import * as functions from 'firebase-functions';
import { db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { serializeDoc } from '../../util/serialize';
import { settleDueLedgerEntries } from './settle';

/** Feature 7: admin queue of cashback >=100k awaiting manual approval, plus withdrawals awaiting the same. */
export const listPayoutQueue = functions.region(REGION).https.onCall(async (_data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới xem được hàng chờ duyệt.');
  }

  await settleDueLedgerEntries();

  const [ledgerSnap, withdrawalSnap] = await Promise.all([
    db.collection('cashbackLedger').where('status', '==', 'PENDING_ADMIN_APPROVAL').get(),
    db.collection('withdrawalRequests').where('status', '==', 'PENDING_ADMIN').get(),
  ]);

  return {
    payouts: ledgerSnap.docs.map(serializeDoc),
    withdrawals: withdrawalSnap.docs.map(serializeDoc),
  };
});
