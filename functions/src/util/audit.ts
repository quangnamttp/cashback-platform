import { admin, db } from '../lib/admin';

export async function writeAuditLog(params: {
  actorUid: string;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.collection('adminAuditLogs').add({
    ...params,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
