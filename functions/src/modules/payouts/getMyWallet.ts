import * as functions from 'firebase-functions';
import { db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { serializeDoc } from '../../util/serialize';
import { settleDueLedgerEntries } from './settle';

export const getMyWallet = functions.region(REGION).https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Cần đăng nhập.');
  }
  const uid = context.auth.uid;
  await settleDueLedgerEntries(uid);

  const [walletSnap, ledgerSnap] = await Promise.all([
    db.collection('walletBalances').doc(uid).get(),
    db.collection('cashbackLedger').where('userId', '==', uid).get(),
  ]);

  return {
    wallet: walletSnap.exists ? serializeDoc(walletSnap) : null,
    ledger: ledgerSnap.docs.map(serializeDoc),
  };
});
