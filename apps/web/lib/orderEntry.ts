'use client';

import {
  collection,
  doc,
  type DocumentReference,
  type QuerySnapshot,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { generateOrderId } from './ids';
import { notifyCashbackApprovalToTelegram, notifyOrderApprovalToTelegram } from './telegram';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';
export type Platform = 'SHOPEE' | 'TIKTOK_SHOP' | 'LAZADA';

// Which affiliate provider (if any) originated this order — 'MANUAL' for
// every order entered by hand today (the only source that exists right
// now). Kept as an open string union (not a strict literal type) so a
// future provider id doesn't require touching this file — see
// lib/affiliateProvider.ts for the provider abstraction this feeds into.
export type OrderSource = 'MANUAL' | 'AFFILIATE';

// The affiliate provider's OWN verdict on the commission behind an order —
// distinct from OrderStatus (our admin's PENDING/CONFIRMED/CANCELLED/
// REFUNDED decision) and from the cashbackLedger status (FROZEN/RELEASED/
// REJECTED). Only ever meaningful for source:'AFFILIATE' orders; a MANUAL
// order has no such upstream provider to report one, so this stays
// undefined for it. Set by workers/accesstrade-sync's scheduled sync
// (mirrors ACCESSTRADE's own order_pending/order_approved/order_reject
// flags — see that Worker's deriveOrderStatus) — this codebase itself
// never sets it. manager/payouts gates on this being APPROVED before an
// AFFILIATE order's FROZEN ledger entries can be released.
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Chờ duyệt',
  CONFIRMED: 'Đã xác nhận',
  CANCELLED: 'Đã hủy',
  REFUNDED: 'Đã trả hàng',
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  SHOPEE: 'Shopee',
  TIKTOK_SHOP: 'TikTok Shop',
  LAZADA: 'Lazada',
};

// A virtual "user" that holds the platform's own 20% revenue share — not a
// real account (no such uid can ever exist from Firebase Auth), so no
// regular user can ever read or accidentally receive it. Only isAdmin()
// can read cashbackLedger docs with this userId (see firestore.rules).
export const ADMIN_WALLET_ID = 'ADMIN_WALLET';

// Commission split — applied automatically the moment an order is
// confirmed, off the commission the marketplace actually pays
// (commissionAmount), never off a manually-typed cashback number.
export const COMMISSION_SPLIT = {
  CUSTOMER_WITH_REFERRER: 0.75,
  REFERRER_BONUS: 0.05,
  CUSTOMER_NO_REFERRER: 0.8,
  PLATFORM_SHARE: 0.2,
};

export type LedgerEntryType = 'CUSTOMER_CASHBACK' | 'REFERRAL_BONUS' | 'PLATFORM_REVENUE';

// --- Refund/clawback fraud-signal severity ------------------------------
// Previously: ANY refund of an order >= HIGH_VALUE_ORDER_THRESHOLD_VND, or
// ANY refund after the cashback had already been RELEASED, was flagged
// riskLevel:'HIGH' on the very first occurrence — literally "1 refund =
// HIGH", with no notion of how often this customer does this or what
// fraction of their orders it is. Replaced with a repeat-behavior check:
// a single ordinary refund is normal customer behavior (a real return),
// not fraud — severity only escalates once a PATTERN shows up (several
// refunds, or a high refund rate against this customer's own order
// history). Every threshold below is a named constant specifically so it
// can be tuned later without hunting through the classification logic.
const HIGH_VALUE_ORDER_THRESHOLD_VND = 2000000;
// >= this many refunds (this one included) against the same customer ->
// treated as a real repeated pattern regardless of their total order count.
const FRAUD_REPEAT_COUNT_THRESHOLD = 3;
// Refund rate above this (of the customer's own CONFIRMED-or-REFUNDED
// orders) also counts as a pattern — only applied once there are at least
// FRAUD_MIN_SAMPLE_FOR_RATE orders to compute a rate from, so a single
// refund out of a single order (100%) doesn't trip this on its own.
const FRAUD_REPEAT_RATE_THRESHOLD = 0.5;
const FRAUD_MIN_SAMPLE_FOR_RATE = 2;

export type FraudRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Decides the severity of a refund/clawback fraud signal — or null,
 * meaning "don't create one at all" (a real, ordinary first-time return of
 * an unremarkable order isn't a fraud-worthy event and would just be noise
 * on the Fraud page). Mirrors the 4 tiers requested: null=NORMAL (no
 * signal), 'LOW'=WATCH, 'MEDIUM'=WARNING/HIGH RISK, 'HIGH'=SERIOUS FRAUD —
 * reusing fraudSignals' existing 3-value riskLevel field rather than adding
 * a 4th enum value app-wide.
 *
 * refundCount includes the refund currently being processed; totalOrders is
 * this customer's total CONFIRMED-or-REFUNDED order count (the population a
 * refund RATE is measured against — a CANCELLED/PENDING order was never
 * paid out, so it isn't part of this ratio).
 */
export function classifyClawbackRisk(params: {
  alreadyReleased: boolean;
  refundCount: number;
  totalOrders: number;
  orderValue: number;
}): FraudRiskLevel | null {
  const { alreadyReleased, refundCount, totalOrders, orderValue } = params;
  const rate = totalOrders > 0 ? refundCount / totalOrders : 1;
  const isRepeatedPattern =
    refundCount >= FRAUD_REPEAT_COUNT_THRESHOLD || (totalOrders >= FRAUD_MIN_SAMPLE_FOR_RATE && rate > FRAUD_REPEAT_RATE_THRESHOLD);

  if (alreadyReleased) {
    // Money already left the system — never fully "normal" (worth at
    // least a low-priority note the first time), and escalates to the
    // most serious tier the moment it happens more than once. A
    // FROZEN-only refund below can stay silent on a true first offense;
    // this one can't, since real money already moved.
    return refundCount >= 2 ? 'HIGH' : 'MEDIUM';
  }

  if (isRepeatedPattern) return 'HIGH';
  if (refundCount === 1 && orderValue < HIGH_VALUE_ORDER_THRESHOLD_VND) return null;
  return refundCount >= 2 ? 'MEDIUM' : 'LOW';
}

export type UpsertOrderInput = {
  orderId?: string;
  userId: string;
  platform: Platform;
  productName: string;
  productUrl?: string;
  imageUrl?: string;
  orderValue: number;
  commissionAmount: number;
  status: OrderStatus;
  // All optional and unused by the manual admin form today — reserved for
  // a future affiliate-provider integration (see lib/affiliateProvider.ts)
  // so that path can call this same upsertOrder without this file needing
  // to change again. Existing orders (all MANUAL, all created before these
  // fields existed) simply have them absent, which every read site already
  // treats as "no value" — no migration needed.
  source?: OrderSource;
  externalOrderId?: string;
  subId?: string;
  trackingId?: string;
  affiliateProvider?: string;
  affiliateConversionId?: string;
  commissionStatus?: CommissionStatus;
};

export type CommissionSplitPreview = {
  hasReferrer: boolean;
  customerAmount: number;
  referrerAmount: number;
  platformAmount: number;
};

/** Pure calculation, reused by the live preview in the admin form and by the actual write path below. */
export function computeCommissionSplit(commissionAmount: number, hasReferrer: boolean): CommissionSplitPreview {
  const safeAmount = Math.max(0, Math.round(commissionAmount || 0));
  if (hasReferrer) {
    return {
      hasReferrer: true,
      customerAmount: Math.round(safeAmount * COMMISSION_SPLIT.CUSTOMER_WITH_REFERRER),
      referrerAmount: Math.round(safeAmount * COMMISSION_SPLIT.REFERRER_BONUS),
      platformAmount: Math.round(safeAmount * COMMISSION_SPLIT.PLATFORM_SHARE),
    };
  }
  return {
    hasReferrer: false,
    customerAmount: Math.round(safeAmount * COMMISSION_SPLIT.CUSTOMER_NO_REFERRER),
    referrerAmount: 0,
    platformAmount: Math.round(safeAmount * COMMISSION_SPLIT.PLATFORM_SHARE),
  };
}

/**
 * Looks up whether this customer signed up under someone's referral code,
 * and resolves that code back to the referrer's uid. Two reads (user doc,
 * then a referralCode query) — acceptable at this app's scale, and it's
 * only ever run by the admin at the moment an order gets confirmed.
 */
async function resolveReferrer(db: ReturnType<typeof getFirebaseDb>, customerUserId: string): Promise<string | null> {
  const userSnap = await getDoc(doc(db, 'users', customerUserId));
  const referredByCode = userSnap.exists() ? (userSnap.data().referredBy as string | null) : null;
  if (!referredByCode) return null;

  const referrerSnap = await getDocs(
    query(collection(db, 'users'), where('referralCode', '==', referredByCode), limit(1)),
  );
  if (referrerSnap.empty) return null;
  const referrerUid = referrerSnap.docs[0].id;
  // Guard against a corrupted/self-referential record ever paying a user their own order twice.
  return referrerUid === customerUserId ? null : referrerUid;
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

type PreparedLedgerWrite = { ref: DocumentReference; data: Record<string, unknown> };

/**
 * Pure preparation, no Firestore writes: computes the split, sends the
 * Telegram "duyệt hoàn tiền" notification (a side effect — deliberately
 * done HERE, once, before any transaction, never inside
 * confirmOrderWithLedger's transaction callback below, since a Firestore
 * transaction's updateFunction can be retried by the SDK on contention and
 * a retried network call would send the same Telegram message twice), and
 * returns the ledger docs to write. The caller commits them atomically
 * together with the order's own status flip via confirmOrderWithLedger.
 */
async function prepareCommissionLedgerEntries(
  db: ReturnType<typeof getFirebaseDb>,
  params: { orderId: string; customerUserId: string; referrerUid: string | null; commissionAmount: number },
): Promise<{ split: CommissionSplitPreview; writes: PreparedLedgerWrite[] }> {
  const split = computeCommissionSplit(params.commissionAmount, !!params.referrerUid);
  const writes: PreparedLedgerWrite[] = [];

  if (split.customerAmount > 0) {
    const customerSnap = await getDoc(doc(db, 'users', params.customerUserId));
    const customerData = customerSnap.exists() ? customerSnap.data() : null;
    const requesterName: string = customerData?.fullName || customerData?.email || params.customerUserId;
    const requesterEmail: string = customerData?.email || '—';

    const ledgerRef = doc(collection(db, 'cashbackLedger'));
    const telegramRef = await notifyCashbackApprovalToTelegram({
      requesterName,
      requesterEmail,
      orderId: params.orderId,
      amount: split.customerAmount,
      amountLabel: formatVnd(split.customerAmount),
      ledgerId: ledgerRef.id,
    });

    writes.push({
      ref: ledgerRef,
      data: {
        userId: params.customerUserId,
        orderId: params.orderId,
        amount: split.customerAmount,
        type: 'CUSTOMER_CASHBACK' as LedgerEntryType,
        status: 'FROZEN',
        confirmedAt: serverTimestamp(),
        requesterName,
        requesterEmail,
        telegramChatId: telegramRef?.chatId ?? null,
        telegramMessageId: telegramRef?.messageId ?? null,
      },
    });
  }

  if (split.platformAmount > 0) {
    writes.push({
      ref: doc(collection(db, 'cashbackLedger')),
      data: {
        userId: ADMIN_WALLET_ID,
        orderId: params.orderId,
        amount: split.platformAmount,
        type: 'PLATFORM_REVENUE' as LedgerEntryType,
        status: 'FROZEN',
        confirmedAt: serverTimestamp(),
      },
    });
  }

  if (params.referrerUid && split.referrerAmount > 0) {
    writes.push({
      ref: doc(collection(db, 'cashbackLedger')),
      data: {
        userId: params.referrerUid,
        orderId: params.orderId,
        amount: split.referrerAmount,
        type: 'REFERRAL_BONUS' as LedgerEntryType,
        status: 'FROZEN',
        confirmedAt: serverTimestamp(),
      },
    });
  }

  return { split, writes };
}

/**
 * The atomic guard against double-approving the same order (two admin tabs,
 * a Telegram tap racing a web click, a double-click before the button
 * disables, a bulk-approve re-run) — this is what CONFIRMED->FROZEN
 * duplication actually turns on: whoever's transaction reads the order
 * FIRST and finds it still eligible (not already CONFIRMED/CANCELLED/
 * REFUNDED) is the only one allowed to both flip its status AND create its
 * ledger entries; Firestore serializes conflicting transactions on the
 * same document and retries the loser with a fresh read, so the loser
 * always sees the winner's write and backs off instead of creating a
 * second set of FROZEN entries for the same order. orderFields is the
 * full field set to merge onto the order doc (not just status/confirmedAt)
 * so this also covers the "brand-new order created directly as CONFIRMED"
 * case, where the doc doesn't exist yet at all.
 */
async function confirmOrderWithLedger(
  db: ReturnType<typeof getFirebaseDb>,
  orderRef: DocumentReference,
  orderFields: Record<string, unknown>,
  ledgerWrites: PreparedLedgerWrite[],
): Promise<boolean> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    const currentStatus = snap.exists() ? (snap.data().status as OrderStatus) : null;
    if (currentStatus === 'CONFIRMED' || currentStatus === 'CANCELLED' || currentStatus === 'REFUNDED') {
      return false;
    }
    tx.set(orderRef, orderFields, { merge: true });
    ledgerWrites.forEach(({ ref, data }) => tx.set(ref, data));
    return true;
  });
}

/**
 * The replacement for the old adminUpsertOrder Cloud Function + its
 * onOrderWrite trigger — both folded into one call the admin's browser
 * makes directly. Reads happen first (to decide what the write should
 * contain). The CONFIRMED-with-commission path (real money) commits through
 * confirmOrderWithLedger's transaction instead of a plain writeBatch — see
 * that function's comment — because two callers racing on the SAME order
 * (a web tab and a Telegram tap, two admin tabs, a retried request) must
 * never both succeed in creating FROZEN ledger entries for it. Every other
 * status transition (PENDING creation, CANCELLED, REFUNDED, a plain field
 * edit) has no such money-duplication risk and keeps the simpler batch.
 */
export async function upsertOrder(input: UpsertOrderInput): Promise<{ orderId: string }> {
  const db = getFirebaseDb();
  const orderId = input.orderId || generateOrderId();
  const orderRef = doc(db, 'orders', orderId);
  const existingSnap = await getDoc(orderRef);
  const existing = existingSnap.exists() ? existingSnap.data() : null;
  const prevStatus: OrderStatus | null = (existing?.status as OrderStatus) ?? null;
  const statusChanged = prevStatus !== input.status;

  // Reads that decide the batch's contents happen before we start writing.
  const referrerUid = statusChanged && input.status === 'CONFIRMED' ? await resolveReferrer(db, input.userId) : null;

  // Only for a brand-new order entered as PENDING — never for one created
  // directly as CONFIRMED/CANCELLED/etc (the admin's own explicit choice
  // at entry time already skips the approval step, so there's nothing to
  // notify) and never on a later status change to an already-existing
  // order (this message is specifically "a new order needs a decision",
  // not a general order-activity log). Pre-generate nothing extra here —
  // orderRef already has its final id (generateOrderId() ran above,
  // synchronously) before this call, so the Telegram message and the
  // order doc agree on the same id from the start.
  let orderTelegramRef: { chatId: string; messageId: number } | null = null;
  if (!existing && input.status === 'PENDING') {
    const customerSnap = await getDoc(doc(db, 'users', input.userId));
    const customerData = customerSnap.exists() ? customerSnap.data() : null;
    orderTelegramRef = await notifyOrderApprovalToTelegram({
      requesterName: customerData?.fullName || customerData?.email || input.userId,
      requesterEmail: customerData?.email || '—',
      productName: input.productName,
      platformLabel: PLATFORM_LABEL[input.platform] ?? input.platform,
      orderValue: input.orderValue,
      orderValueLabel: formatVnd(input.orderValue),
      commissionAmount: input.commissionAmount,
      commissionAmountLabel: formatVnd(input.commissionAmount),
      orderId,
    });
  }

  const orderFields: Record<string, unknown> = {
    userId: input.userId,
    platform: input.platform,
    productName: input.productName,
    productUrl: input.productUrl || null,
    imageUrl: input.imageUrl || null,
    orderValue: input.orderValue,
    commissionAmount: input.commissionAmount,
    status: input.status,
    orderDate: existing?.orderDate ?? serverTimestamp(),
    confirmedAt: input.status === 'CONFIRMED' ? serverTimestamp() : existing?.confirmedAt ?? null,
    // Affiliate-provider prep fields (see UpsertOrderInput) — always written
    // so a manually-created order explicitly records source:'MANUAL'
    // instead of leaving the field absent, which is what every order
    // created before this existed still has (read sites must treat a
    // missing source as 'MANUAL', never assume it's present).
    source: input.source ?? existing?.source ?? 'MANUAL',
    externalOrderId: input.externalOrderId ?? existing?.externalOrderId ?? null,
    subId: input.subId ?? existing?.subId ?? null,
    trackingId: input.trackingId ?? existing?.trackingId ?? null,
    affiliateProvider: input.affiliateProvider ?? existing?.affiliateProvider ?? null,
    affiliateConversionId: input.affiliateConversionId ?? existing?.affiliateConversionId ?? null,
    commissionStatus: input.commissionStatus ?? existing?.commissionStatus ?? null,
    // A MANUAL order (the admin's own /manager/orders form — the only way
    // to reach this branch with a brand-new doc) has always been visible
    // to the customer immediately, PENDING or not — unchanged here. An
    // AFFILIATE order (workers/accesstrade-sync) starts invisible while
    // still PENDING (an unreviewed external conversion shouldn't show up
    // as "you have an order" before Admin has looked at it — see
    // firestore.rules' orders match block) and only this function's own
    // CONFIRMED transition ever flips it true; REJECTED/CANCELLED never
    // does, matching the "customer never sees a rejected auto-conversion"
    // rule. Once true, always stays true (a later REFUNDED must stay
    // visible — that's the existing cashbackClawback transparency note).
    customerVisible:
      input.status === 'CONFIRMED' ? true : existing ? (existing.customerVisible ?? true) : input.source !== 'AFFILIATE',
    ...(orderTelegramRef
      ? { telegramChatId: orderTelegramRef.chatId, telegramMessageId: orderTelegramRef.messageId }
      : existing
        ? {}
        : { telegramChatId: null, telegramMessageId: null }),
  };

  // Real money path: an order transitioning to CONFIRMED with a commission
  // to split must never create its FROZEN ledger entries more than once,
  // including under two callers racing on the exact same order — see
  // confirmOrderWithLedger's comment. This replaces both the order write
  // AND the ledger writes for this one case; every other transition below
  // falls through to the plain batch, unchanged.
  if (statusChanged && input.status === 'CONFIRMED' && input.commissionAmount > 0) {
    const { writes } = await prepareCommissionLedgerEntries(db, {
      orderId,
      customerUserId: input.userId,
      referrerUid,
      commissionAmount: input.commissionAmount,
    });
    await confirmOrderWithLedger(db, orderRef, orderFields, writes);
    return { orderId };
  }

  // Reads for the REFUNDED path happen before any write, same reason as
  // the CONFIRMED path above — and specifically before orderFields is
  // handed to batch.set below, since a WriteBatch serializes each set()
  // call's data immediately (mutating orderFields afterwards wouldn't
  // reach the queued write).
  let clawbackFlag: 'FROZEN_REJECTED' | 'RELEASED_FLAGGED' | null = null;
  let ledgerSnap: QuerySnapshot | null = null;
  let frozenAmount = 0;
  let releasedAmount = 0;
  let refundRisk: { frozen: FraudRiskLevel | null; released: FraudRiskLevel | null; refundCount: number; totalOrders: number } | null = null;

  if (statusChanged && input.status === 'REFUNDED') {
    ledgerSnap = await getDocs(query(collection(db, 'cashbackLedger'), where('orderId', '==', orderId)));
    let clawedBackFrozen = false;
    let clawedBackReleased = false;
    ledgerSnap.docs.forEach((ledgerDoc) => {
      const ledger = ledgerDoc.data();
      if (ledger.status === 'FROZEN') {
        clawedBackFrozen = true;
        frozenAmount += ledger.amount ?? 0;
      } else if (ledger.status === 'RELEASED') {
        clawedBackReleased = true;
        releasedAmount += ledger.amount ?? 0;
      }
    });

    if (clawedBackFrozen || clawedBackReleased) {
      // This customer's own refund history decides whether this is an
      // isolated return or a repeated pattern (see classifyClawbackRisk) —
      // counted from CONFIRMED-or-REFUNDED orders only (a CANCELLED/PENDING
      // order was never paid out, so it isn't part of a refund rate).
      // orderId's own doc still reads back as CONFIRMED here (this
      // function's own REFUNDED write hasn't committed yet), so it's
      // counted explicitly as the refund it's about to become.
      const customerOrdersSnap = await getDocs(query(collection(db, 'orders'), where('userId', '==', input.userId)));
      const relevant = customerOrdersSnap.docs
        .map((d) => (d.id === orderId ? 'REFUNDED' : (d.data().status as OrderStatus)))
        .filter((status) => status === 'CONFIRMED' || status === 'REFUNDED');
      const totalOrders = relevant.length;
      const refundCount = relevant.filter((status) => status === 'REFUNDED').length;

      refundRisk = {
        refundCount,
        totalOrders,
        frozen: clawedBackFrozen
          ? classifyClawbackRisk({ alreadyReleased: false, refundCount, totalOrders, orderValue: input.orderValue })
          : null,
        released: clawedBackReleased
          ? classifyClawbackRisk({ alreadyReleased: true, refundCount, totalOrders, orderValue: input.orderValue })
          : null,
      };
      clawbackFlag = clawedBackReleased ? 'RELEASED_FLAGGED' : 'FROZEN_REJECTED';
    }
  }

  if (clawbackFlag) orderFields.cashbackClawback = clawbackFlag;

  const batch = writeBatch(db);
  batch.set(orderRef, orderFields, { merge: true });

  if (ledgerSnap && refundRisk) {
    ledgerSnap.docs.forEach((ledgerDoc) => {
      if (ledgerDoc.data().status === 'FROZEN') {
        batch.update(ledgerDoc.ref, { status: 'REJECTED' });
      }
    });

    const { refundCount, totalOrders } = refundRisk;
    if (refundRisk.frozen) {
      batch.set(doc(collection(db, 'fraudSignals')), {
        userId: input.userId,
        orderId,
        signalType: 'ORDER_REFUNDED_AFTER_CONFIRM',
        riskLevel: refundRisk.frozen,
        orderValue: input.orderValue,
        cashbackAmount: frozenAmount,
        refundCount,
        totalOrders,
        reason: `Đơn hàng giá trị ${input.orderValue.toLocaleString('vi-VN')}đ bị trả hàng sau khi hoa hồng đã được xác nhận (lần trả hàng thứ ${refundCount}/${totalOrders} đơn đã xác nhận của khách này). Các khoản hoàn tiền/hoa hồng liên quan (khách hàng, giới thiệu, ví admin) đã bị thu hồi trước khi giải phóng.`,
        status: 'OPEN',
        createdAt: serverTimestamp(),
      });
    }
    if (refundRisk.released) {
      batch.set(doc(collection(db, 'fraudSignals')), {
        userId: input.userId,
        orderId,
        signalType: 'REFUND_AFTER_RELEASE',
        riskLevel: refundRisk.released,
        orderValue: input.orderValue,
        cashbackAmount: releasedAmount,
        refundCount,
        totalOrders,
        reason: `Đơn hàng giá trị ${input.orderValue.toLocaleString('vi-VN')}đ bị trả hàng SAU KHI ${formatVnd(releasedAmount)} đã được giải phóng (lần thứ ${refundCount}/${totalOrders} đơn đã xác nhận của khách này). Cần Admin xem xét thủ công — hệ thống không tự động khóa hay thu hồi tiền đã giải phóng.`,
        status: 'OPEN',
        createdAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
  return { orderId };
}

export type PendingOrderForApproval = {
  id: string;
  userId: string;
  commissionAmount: number;
};

/**
 * Bulk "Duyệt hàng loạt". Each order now commits through its OWN
 * confirmOrderWithLedger transaction instead of one shared writeBatch —
 * previously this blindly wrote CONFIRMED + FROZEN ledger entries with no
 * check at all, so the exact same order approved twice (two admin tabs, a
 * bulk-approve re-run before the UI's onSnapshot list updated, a race with
 * a Telegram "✅ Duyệt đơn hàng" tap on the same order) created a SECOND
 * full set of ledger entries — real duplicated cashback. Per-order
 * transactions close that: whichever call gets there first wins, every
 * later one for the same order sees it's no longer PENDING and no-ops.
 * Sequential (not Promise.all) — same reason as before: a Telegram message
 * per order, and firing a whole batch at once risks Telegram's per-chat
 * rate limit. callTelegramApi already treats a failed send as best-effort
 * and never blocks/fails the approval itself.
 */
export async function approveOrdersBatch(orders: PendingOrderForApproval[]): Promise<void> {
  const db = getFirebaseDb();
  for (const order of orders) {
    const referrerUid = await resolveReferrer(db, order.userId);
    const orderRef = doc(db, 'orders', order.id);
    if (order.commissionAmount > 0) {
      const { writes } = await prepareCommissionLedgerEntries(db, {
        orderId: order.id,
        customerUserId: order.userId,
        referrerUid,
        commissionAmount: order.commissionAmount,
      });
      await confirmOrderWithLedger(db, orderRef, { status: 'CONFIRMED', confirmedAt: serverTimestamp(), customerVisible: true }, writes);
    } else {
      await confirmOrderWithLedger(db, orderRef, { status: 'CONFIRMED', confirmedAt: serverTimestamp(), customerVisible: true }, []);
    }
  }
}

/**
 * Bulk "Từ chối" — no ledger ever touched (none exists yet for a still-
 * PENDING order), but still transactional per order: without the PENDING
 * check, a reject racing a concurrent approve of the SAME order could
 * overwrite a just-CONFIRMED order back to CANCELLED while its FROZEN
 * ledger entries stay behind, orphaned — a real order/ledger inconsistency
 * even though no money duplicates. Parallel is safe here (no Telegram send
 * tied to each individual reject to rate-limit).
 */
export async function rejectOrdersBatch(orderIds: string[]): Promise<void> {
  const db = getFirebaseDb();
  await Promise.all(
    orderIds.map((id) =>
      runTransaction(db, async (tx) => {
        const ref = doc(db, 'orders', id);
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().status !== 'PENDING') return;
        tx.update(ref, { status: 'CANCELLED' });
      }),
    ),
  );
}
