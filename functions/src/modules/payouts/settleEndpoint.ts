import * as functions from 'firebase-functions';
import { REGION } from '../../lib/constants';
import { settleDueLedgerEntries } from './settle';

/**
 * Optional: an external free cron (GitHub Actions `schedule:`, cron-job.org)
 * can hit this to settle due ledger entries closer to real time than
 * "whenever someone opens a payout page" allows. Protected by a shared
 * secret header rather than Firebase Auth since the caller is a cron job,
 * not a signed-in user — and calling *into* a Cloud Function like this
 * doesn't count as the function making an outbound call, so it's fine on
 * Spark. Leave SETTLE_ENDPOINT_SECRET unset to disable this endpoint.
 */
export const settleDueLedgerEntriesHttp = functions.region(REGION).https.onRequest(async (req, res) => {
  const secret = process.env.SETTLE_ENDPOINT_SECRET;
  if (!secret || req.headers['x-settle-secret'] !== secret) {
    res.status(403).send('forbidden');
    return;
  }
  const result = await settleDueLedgerEntries();
  res.status(200).json(result);
});
