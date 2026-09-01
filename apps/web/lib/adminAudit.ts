'use client';

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

export function logAdminAction(params: {
  actorUid: string;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  return addDoc(collection(getFirebaseDb(), 'adminAuditLogs'), {
    ...params,
    createdAt: serverTimestamp(),
  });
}
