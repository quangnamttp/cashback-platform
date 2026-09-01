'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import Link from 'next/link';
import { getFirebaseDb } from '../../lib/firebase';

const TTL_MS = 168 * 60 * 60 * 1000;
const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function GoPageInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!code) {
      setExpired(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const db = getFirebaseDb();
      const ref = doc(db, 'redirectCache', code);
      const snap = await getDoc(ref);
      const data = snap.data();
      const now = Date.now();
      const expiresAtMs: number = data?.expiresAt?.toMillis?.() ?? 0;

      if (cancelled) return;
      if (!snap.exists() || data?.status !== 'ACTIVE' || now > expiresAtMs) {
        setExpired(true);
        return;
      }

      const createdAtMs: number = data.createdAt?.toMillis?.() ?? now;
      const newExpiry = Math.min(now + TTL_MS, createdAtMs + MAX_LIFETIME_MS);
      updateDoc(ref, {
        lastHitAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(newExpiry),
        hitCount: increment(1),
      }).catch(() => undefined);
      addDoc(collection(ref, 'hits'), { timestamp: serverTimestamp() }).catch(() => undefined);

      window.location.replace(data.destinationUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (expired) {
    return (
      <div className="page-shell" style={{ textAlign: 'center', paddingTop: 60 }}>
        <p>⚠️ Link đã hết hạn hoặc không hợp lệ.</p>
        <Link href="/get-cashback-link" className="button button-primary" style={{ marginTop: 12, display: 'inline-block' }}>
          Tạo link mới
        </Link>
      </div>
    );
  }

  return (
    <div className="page-shell" style={{ textAlign: 'center', paddingTop: 60 }}>
      <p>Đang chuyển hướng đến sàn thương mại điện tử...</p>
    </div>
  );
}

export default function GoPage() {
  return (
    <Suspense fallback={null}>
      <GoPageInner />
    </Suspense>
  );
}
