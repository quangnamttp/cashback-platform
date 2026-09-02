import * as functions from 'firebase-functions';
import { REGION } from '../../lib/constants';
import { ensureUserProfile } from '../../util/ensureUserProfile';

export const onUserCreate = functions.region(REGION).auth.user().onCreate(async (user) => {
  await ensureUserProfile(user.uid, user.email ?? null, user.displayName, user.photoURL);
});
