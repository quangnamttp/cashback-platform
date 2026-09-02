import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { CASHBACK_FREEZE_DAYS, HIGH_VALUE_ORDER_THRESHOLD_VND, REGION } from '../../lib/constants';

const FREEZE_MS = CASHBACK_FREEZE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Single trigger, two independent jobs, both keyed off a status change on
 * `orders/{orderId}`:
 *
 * 1. CONFIRMED -> open a FROZEN cashbackLedger entry with eligibleAt fixed
 *    at confirmedAt + 15 days. That date never moves, even if the
 *    marketplace later reports an earlier payout — see feature 6.
 * 2. REFUNDED -> if a ledger entry already exists for this order, claw it
 *    back (still frozen/pending -> REJECTED + un-freeze the balance; already
 *    PAID -> can't claw back automatically, so raise a HIGH fraud signal
 *    instead). This is exactly the "mua giá trị cao rồi trả hàng" pattern
 *    from feature 5 — it only ever creates a signal for Admin to review,
 *    never touches users.status itself.
 *
 * Deliberately does NOT look at redirectCache.hitCount anywhere: repeated
 * views of the same product (feature 4) are normal shopping behavior, not a
 * fraud signal.
 */
export const onOrderWrite = functions.region(REGION).firestore
  .document('orders/{orderId}')
  .onWrite(async (change, context) => {
    const orderId = context.params.orderId as string;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return;

    const statusChanged = !before || before.status !== after.status;
    if (!statusChanged) return;

    if (after.status === 'CONFIRMED') {
      const existingLedger = await db.collection('cashbackLedger')
        .where('orderId', '==', orderId)
        .limit(1)
        .get();

      if (existingLedger.empty && after.cashbackAmount > 0) {
        const confirmedAtMs = Date.now();
        await db.collection('cashbackLedger').add({
          userId: after.userId,
          orderId,
          amount: after.cashbackAmount,
          status: 'FROZEN',
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          eligibleAt: admin.firestore.Timestamp.fromMillis(confirmedAtMs + FREEZE_MS),
        });
        await db.collection('walletBalances').doc(after.userId).update({
          balanceFrozen: admin.firestore.FieldValue.increment(after.cashbackAmount),
          totalCashbackLifetime: admin.firestore.FieldValue.increment(after.cashbackAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    if (after.status === 'REFUNDED') {
      const ledgerSnap = await db.collection('cashbackLedger')
        .where('orderId', '==', orderId)
        .limit(1)
        .get();

      if (ledgerSnap.empty) return;

      const ledgerDoc = ledgerSnap.docs[0];
      const ledger = ledgerDoc.data();
      const isHighValue = (after.orderValue ?? 0) >= HIGH_VALUE_ORDER_THRESHOLD_VND;

      if (ledger.status === 'FROZEN' || ledger.status === 'PENDING_ADMIN_APPROVAL') {
        await ledgerDoc.ref.update({ status: 'REJECTED' });
        await db.collection('walletBalances').doc(after.userId).update({
          balanceFrozen: admin.firestore.FieldValue.increment(-ledger.amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection('fraudSignals').add({
          userId: after.userId,
          orderId,
          signalType: 'ORDER_REFUNDED_AFTER_CONFIRM',
          riskLevel: isHighValue ? 'HIGH' : 'MEDIUM',
          reason: `Đơn hàng giá trị ${Number(after.orderValue ?? 0).toLocaleString('vi-VN')}đ bị trả hàng sau khi hoa hồng đã được xác nhận. Khoản hoàn tiền tương ứng đã bị thu hồi trước khi thanh toán.`,
          status: 'OPEN',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (ledger.status === 'PAID') {
        await db.collection('fraudSignals').add({
          userId: after.userId,
          orderId,
          signalType: 'REFUND_AFTER_PAYOUT',
          riskLevel: 'HIGH',
          reason: `Đơn hàng giá trị ${Number(after.orderValue ?? 0).toLocaleString('vi-VN')}đ bị trả hàng SAU KHI cashback đã được thanh toán (${Number(ledger.amount).toLocaleString('vi-VN')}đ). Cần Admin xem xét thủ công — hệ thống không tự động khóa hay thu hồi tiền.`,
          status: 'OPEN',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  });
