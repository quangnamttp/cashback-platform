import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

/**
 * True once real project values are in `.env.local` (see
 * apps/web/.env.example). Before that, every feature that depends on
 * Firebase (login, admin pages, cashback link creation) should degrade
 * quietly instead of throwing — the same "not configured yet" pattern
 * already used for the Telegram-backed support chat widget.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

/**
 * `output: 'export'` still renders every 'use client' page once on the
 * server to produce its static HTML — so a bare `getAuth()` at module scope
 * would run during `next build` too. With no real NEXT_PUBLIC_FIREBASE_*
 * values yet (or any placeholder), that makes Firebase Auth throw
 * `auth/invalid-api-key` synchronously and fails the whole export (this
 * broke the site build before it was made lazy). Everything below is
 * created on first use instead, and only ever called from inside
 * useEffect/event-handler code paths, which never execute during
 * prerendering — only in the browser.
 *
 * No Cloud Functions client (`getFunctions`) anymore — this is a pure
 * client-side architecture now, every write goes straight through
 * Firestore + firestore.rules instead of a callable.
 */
function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error('Firebase is only available in the browser.');
  }
  if (!cachedApp) {
    cachedApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  if (!cachedAuth) {
    cachedAuth = getAuth(getFirebaseApp());
  }
  return cachedAuth;
}

export function getFirebaseDb(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore(getFirebaseApp());
  }
  return cachedDb;
}
