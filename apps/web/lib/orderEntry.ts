'use client';

import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { generateOrderId } from './ids';
import { notifyCashbackApprovalToTelegram, notifyOrderApprovalToTelegram } from './telegram';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';
export type Platform = 'SHOPEE' | 'TIKTOK_SHOP' | 'LAZADA';

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

/**
 * Reads first (never inside the batch — batch.set is sync/local), then
 * sends the Telegram "duyệt hoàn tiền" notification, THEN builds the
 * customer's ledger write with that message's chat/message id folded in —
 * same pre-generate-the-ref-before-writing shape as the withdrawal flow in
 * cashback-wallet/page.tsx, and for the same reason: the Worker (or a
 * later web-side decide) needs to edit this exact message later, so its
 * id has to already be on the doc the moment it's created.
 */
async function addCommissionLedgerEntries(
  batch: ReturnType<typeof writeBatch>,
  db: ReturnType<typeof getFirebaseDb>,
  params: { orderId: string; customerUserId: string; referrerUid: string | null; commissionAmount: number },
) {
  const split = computeCommissionSplit(params.commissionAmount, !!params.referrerUid);

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

    batch.set(ledgerRef, {
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
    });
  }

  if (split.platformAmount > 0) {
    batch.set(doc(collection(db, 'cashbackLedger')), {
      userId: ADMIN_WALLET_ID,
      orderId: params.orderId,
      amount: split.platformAmount,
      type: 'PLATFORM_REVENUE' as LedgerEntryType,
      status: 'FROZEN',
      confirmedAt: serverTimestamp(),
    });
  }

  if (params.referrerUid && split.referrerAmount > 0) {
    batch.set(doc(collection(db, 'cashbackLedger')), {
      userId: params.referrerUid,
      orderId: params.orderId,
      amount: split.referrerAmount,
      type: 'REFERRAL_BONUS' as LedgerEntryType,
      status: 'FROZEN',
      confirmedAt: serverTimestamp(),
    });
  }

  return split;
}

/**
 * The replacement for the old adminUpsertOrder Cloud Function + its
 * onOrderWrite trigger — both folded into one call the admin's browser
 * makes directly. Reads happen first (to decide what the batch should
 * contain), then everything commits together in a single writeBatch. Not
 * a transaction — acceptable because only the admin ever writes these
 * collections (see firestore.rules), so there's no concurrent-write race
 * to guard against in practice.
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

  const batch = writeBatch(db);

  batch.set(orderRef, {
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
    ...(orderTelegramRef
      ? { telegramChatId: orderTelegramRef.chatId, telegramMessageId: orderTelegramRef.messageId }
      : existing
        ? {}
        : { telegramChatId: null, telegramMessageId: null }),
  }, { merge: true });

  if (statusChanged && input.status === 'CONFIRMED' && input.commissionAmount > 0) {
    const existingLedger = await getDocs(query(collection(db, 'cashbackLedger'), where('orderId', '==', orderId), limit(1)));
    if (existingLedger.empty) {
      await addCommissionLedgerEntries(batch, db, { orderId, customerUserId: input.userId, referrerUid, commissionAmount: input.commissionAmount });
    }
  }

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

// Now 1-3 ledger writes per order (customer + admin wallet + maybe
// referrer) plus the order update itself — chunked conservatively to stay
// safely under Firestore's 500-operation writeBatch limit.
const MAX_ORDERS_PER_APPROVE_BATCH = 100;
// 1 write per order for reject — more headroom, but chunked the same way
// for consistency and to stay well clear of the limit either way.
const MAX_ORDERS_PER_REJECT_BATCH = 450;

/**
 * Bulk "Duyệt hàng loạt". Unlike before, this now needs one read per order
 * (resolveReferrer) to decide the split, run in parallel per chunk before
 * the writeBatch for that chunk is built.
 */
export async function approveOrdersBatch(orders: PendingOrderForApproval[]): Promise<void> {
  const db = getFirebaseDb();
  for (let i = 0; i < orders.length; i += MAX_ORDERS_PER_APPROVE_BATCH) {
    const chunk = orders.slice(i, i + MAX_ORDERS_PER_APPROVE_BATCH);
    const referrerUids = await Promise.all(chunk.map((order) => resolveReferrer(db, order.userId)));

    const batch = writeBatch(db);
    // Sequential, not Promise.all — addCommissionLedgerEntries now sends a
    // Telegram message per order (the "duyệt hoàn tiền" notification), and
    // firing a whole chunk of those at once risks tripping Telegram's own
    // per-chat rate limit on a large bulk approve. One at a time is slower
    // but never lost — callTelegramApi already treats a failed send as
    // best-effort and won't block/fail the order approval itself.
    for (let idx = 0; idx < chunk.length; idx++) {
      const order = chunk[idx];
      batch.update(doc(db, 'orders', order.id), {
        status: 'CONFIRMED',
        confirmedAt: serverTimestamp(),
      });
      if (order.commissionAmount > 0) {
        await addCommissionLedgerEntries(batch, db, {
          orderId: order.id,
          customerUserId: order.userId,
          referrerUid: referrerUids[idx],
          commissionAmount: order.commissionAmount,
        });
      }
    }
    await batch.commit();
  }
}

/** Bulk "Từ chối" — one write per order, no ledger ever touched (none exists yet for a still-PENDING order). */
export async function rejectOrdersBatch(orderIds: string[]): Promise<void> {
  const db = getFirebaseDb();
  for (let i = 0; i < orderIds.length; i += MAX_ORDERS_PER_REJECT_BATCH) {
    const chunk = orderIds.slice(i, i + MAX_ORDERS_PER_REJECT_BATCH);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.update(doc(db, 'orders', id), { status: 'CANCELLED' });
    });
    await batch.commit();
  }
}
