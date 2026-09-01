'use client';

import { collection, getDocs, query, Timestamp, where, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { uploadTextFileToDrive } from './googleDrive';

/**
 * Exports adminAuditLogs older than `olderThanDays` as a CSV into the
 * ADMIN'S OWN Google Drive (client-side OAuth — see lib/googleDrive.ts),
 * then deletes those rows from Firestore so the database stays lean.
 * There's no server to do this on a schedule, so it only ever runs when an
 * admin clicks the button.
 */
export async function backupOldAuditLogs(olderThanDays: number): Promise<{ count: number; webViewLink: string }> {
  const db = getFirebaseDb();
  const cutoff = Timestamp.fromMillis(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const snap = await getDocs(query(collection(db, 'adminAuditLogs'), where('createdAt', '<', cutoff)));

  if (snap.empty) {
    return { count: 0, webViewLink: '' };
  }

  const header = ['id', 'actorEmail', 'action', 'targetType', 'targetId', 'createdAt'];
  const rows = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.()?.toISOString() ?? '';
    return [d.id, data.actorEmail ?? '', data.action ?? '', data.targetType ?? '', data.targetId ?? '', createdAt]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');

  const result = await uploadTextFileToDrive({
    text: csv,
    fileName: `admin-audit-logs-backup-${new Date().toISOString().slice(0, 10)}.csv`,
  });

  // Firestore batches cap at 500 writes — chunk defensively.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return { count: snap.docs.length, webViewLink: result.webViewLink };
}
