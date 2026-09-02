import * as functions from 'firebase-functions';
import { REGION } from '../../lib/constants';

/**
 * Lets the client know whether Google Drive is set up (DRIVE_FOLDER_ID
 * present) without exposing the value itself — used to decide whether chat
 * history should persist indefinitely (Drive-backed images) or fall back
 * to the 3-day auto-expiry policy.
 */
export const getPublicConfig = functions.region(REGION).https.onCall(async () => {
  return { driveConfigured: !!process.env.DRIVE_FOLDER_ID };
});
