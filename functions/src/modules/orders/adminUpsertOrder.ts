import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { generateOrderId } from '../../util/ids';
import { writeAuditLog } from '../../util/audit';

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED'];

/**
 * There is no live order-ingestion pipeline from Shopee/TikTok/Lazada yet
 * (polling their APIs from a Cloud Function would be an outbound call to a
 * non-Google service, which Spark blocks; a webhook *into* this function
 * would work but no platform integration exists yet). Until then, admin
 * records/updates orders manually here — this is also the write path that
 * feeds onOrderWrite (fraud detection + the 15-day cashback freeze).
 */
export const adminUpsertOrder = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền tạo/cập nhật đơn hàng.');
  }

  const userId = typeof data?.userId === 'string' ? data.userId : null;
  const status = data?.status;
  if (!userId || !VALID_STATUSES.includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu userId hoặc status không hợp lệ.');
  }

  const orderId = typeof data?.orderId === 'string' && data.orderId ? data.orderId : generateOrderId();
  const ref = db.collection('orders').doc(orderId);
  const existing = await ref.get();
  const existingData = existing.data();

  await ref.set({
    userId,
    platform: data?.platform ?? existingData?.platform ?? null,
    productName: data?.productName ?? existingData?.productName ?? '',
    orderValue: Number(data?.orderValue ?? existingData?.orderValue) || 0,
    commissionAmount: Number(data?.commissionAmount ?? existingData?.commissionAmount) || 0,
    cashbackAmount: Number(data?.cashbackAmount ?? existingData?.cashbackAmount) || 0,
    status,
    redirectCode: data?.redirectCode ?? existingData?.redirectCode ?? null,
    orderDate: existingData?.orderDate ?? admin.firestore.FieldValue.serverTimestamp(),
    confirmedAt: status === 'CONFIRMED'
      ? admin.firestore.FieldValue.serverTimestamp()
      : existingData?.confirmedAt ?? null,
  }, { merge: true });

  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: existing.exists ? 'adminUpdateOrder' : 'adminCreateOrder',
    targetType: 'order',
    targetId: orderId,
    metadata: { status },
  });

  return { ok: true, orderId };
});
