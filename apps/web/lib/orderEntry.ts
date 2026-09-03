'use client';

import {
  collection,
  doc,
  type DocumentReference,
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
// undefined for it. Never set automatically by anything today — no real
// affiliate feed exists yet — this is purely schema preparation.
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

const HIGH_VALUE_ORDER_THRESHOLD_VND = 2000000;

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

  const batch = writeBatch(db);
  batch.set(orderRef, orderFields, { merge: true });

  if (statusChanged && input.status === 'REFUNDED') {
    const ledgerSnap = await getDocs(query(collection(db, 'cashbackLedger'), where('orderId', '==', orderId)));
    const isHighValue = input.orderValue >= HIGH_VALUE_ORDER_THRESHOLD_VND;
    let clawedBackFrozen = false;
    let clawedBackReleased = false;

    ledgerSnap.docs.forEach((ledgerDoc) => {
      const ledger = ledgerDoc.data();
      if (ledger.status === 'FROZEN') {
        batch.update(ledgerDoc.ref, { status: 'REJECTED' });
        clawedBackFrozen = true;
      } else if (ledger.status === 'RELEASED') {
        clawedBackReleased = true;
      }
    });

    if (clawedBackFrozen) {
      batch.set(doc(collection(db, 'fraudSignals')), {
        userId: input.userId,
        orderId,
        signalType: 'ORDER_REFUNDED_AFTER_CONFIRM',
        riskLevel: isHighValue ? 'HIGH' : 'MEDIUM',
        reason: `Đơn hàng giá trị ${input.orderValue.toLocaleString('vi-VN')}đ bị trả hàng sau khi hoa hồng đã được xác nhận. Các khoản hoàn tiền/hoa hồng liên quan (khách hàng, giới thiệu, ví admin) đã bị thu hồi trước khi giải phóng.`,
        status: 'OPEN',
        createdAt: serverTimestamp(),
      });
    }
    if (clawedBackReleased) {
      batch.set(doc(collection(db, 'fraudSignals')), {
        userId: input.userId,
        orderId,
        signalType: 'REFUND_AFTER_RELEASE',
        riskLevel: 'HIGH',
        reason: `Đơn hàng giá trị ${input.orderValue.toLocaleString('vi-VN')}đ bị trả hàng SAU KHI một phần tiền đã được giải phóng. Cần Admin xem xét thủ công — hệ thống không tự động khóa hay thu hồi tiền đã giải phóng.`,
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
      await confirmOrderWithLedger(db, orderRef, { status: 'CONFIRMED', confirmedAt: serverTimestamp() }, writes);
    } else {
      await confirmOrderWithLedger(db, orderRef, { status: 'CONFIRMED', confirmedAt: serverTimestamp() }, []);
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
