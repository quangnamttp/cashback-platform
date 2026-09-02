'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from './firebase';
import { getOrCreateDeviceId, detectDeviceType } from './device';
import { generateShortCode } from './ids';

const NOT_CONFIGURED_ERROR = 'firebase-not-configured';
const SESSION_TOKEN_KEY = 'cb_session_token';

// The ONLY two accounts that can ever hold admin rights — must match
// firestore.rules' isBootstrapAdminEmail() AND the email allowlist inside
// isAdmin() exactly. Enforced at TWO points: (1) here, at account-creation
// time (ensureOwnProfile only ever writes role:'admin' for these emails),
// and (2) permanently in firestore.rules' isAdmin(), which re-checks the
// caller's own token email on every admin-gated read/write — so even a
// stray Firestore doc with role:'admin' left over from testing grants
// nothing to a non-whitelisted email. Nothing in this app can ever grant
// admin to a third email: there is no "promote to admin" UI, and
// firestore.rules forbids anyone from writing the `role` field after
// account creation.
export const BOOTSTRAP_ADMIN_EMAILS = ['quangnamttp@gmail.com', 'hoantiendv@gmail.com'];

type AuthContextValue = {
  isLoggedIn: boolean;
  authLoading: boolean;
  isAdmin: boolean;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  uid: string | null;
  /** True only when this account has an email/password credential linked
   * (registered via the email/password form, or later linked one) — a
   * Google-only sign-in has no password at all, so changePassword would
   * fail for it; callers should hide/replace the change-password UI when
   * this is false rather than show a form that can never succeed. */
  hasPasswordProvider: boolean;
  loginWithEmail: (email: string, password: string, remember: boolean) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    profile: { referralCode?: string; fullName?: string },
    remember: boolean,
  ) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const sessionUnsubRef = useRef<(() => void) | undefined>(undefined);
  const profileUnsubRef = useRef<(() => void) | undefined>(undefined);
  const pendingProfileRef = useRef<{ referralCode?: string; fullName?: string }>({});
  const sessionCallIdRef = useRef(0);

  const teardownSessionWatch = useCallback(() => {
    sessionUnsubRef.current?.();
    sessionUnsubRef.current = undefined;
  }, []);

  // No Cloud Functions anymore — the client creates its own users/ doc on
  // first sign-in. firestore.rules is what actually enforces the role can
  // only be 'admin' for BOOTSTRAP_ADMIN_EMAIL; this just mirrors that so
  // the write succeeds instead of being rejected.
  const ensureOwnProfile = useCallback(async (nextUser: User, referralCode?: string, fullName?: string) => {
    const db = getFirebaseDb();
    const userRef = doc(db, 'users', nextUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) return;

    await setDoc(userRef, {
      email: nextUser.email ?? null,
      fullName: fullName || nextUser.displayName || (nextUser.email ? nextUser.email.split('@')[0] : ''),
      role: BOOTSTRAP_ADMIN_EMAILS.includes(nextUser.email ?? '') ? 'admin' : 'user',
      status: 'ACTIVE',
      referredBy: referralCode || null,
      referralCode: generateShortCode(6),
      phone: null,
      birthday: null,
      avatarUrl: nextUser.photoURL ?? null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  }, []);

  // Registers this browser/app install as its own active session (feature
  // 2/3). Session slots are keyed by deviceId (a random id persisted in
  // this browser's own localStorage — see lib/device.ts), NOT by device
  // type, so Chrome and Edge on the same computer — or the app and the
  // mobile browser on the same phone — each get their own independent
  // slot and never kick each other out. There's no reliable way to tell
  // "another browser on this same computer" apart from "a genuinely
  // different computer" (both just look like a fresh random deviceId with
  // no shared history) — since feature 3 already commits to never
  // hard-blocking by device, we resolve that ambiguity by simply not
  // auto-kicking either way. Admin can still see every active session and
  // force one out by hand from /manager/devices.
  const registerSessionAndWatch = useCallback(async (nextUser: User) => {
    // onAuthStateChanged can legitimately fire more than once for what is
    // really a single sign-in (e.g. setPersistence() migrating storage
    // backends re-emits the event). Each firing used to run this whole
    // function independently — two concurrent calls would both write a
    // fresh random token to the SAME session doc, and whichever call's own
    // listener subscribed against a now-stale token would see its own doc
    // write get overwritten and self-kick the tab that just logged in.
    // Only the most-recently-started call is allowed to actually register
    // a listener; an older call that finishes late abandons itself instead
    // of racing.
    const callId = ++sessionCallIdRef.current;
    const db = getFirebaseDb();
    const deviceId = getOrCreateDeviceId();
    const deviceType = detectDeviceType();
    const sessionRef = doc(db, 'sessions', `${nextUser.uid}_${deviceId}`);
    // Reuse this browser's existing session token instead of minting a
    // fresh one on every call — onAuthStateChanged (and therefore this
    // function) fires again for every NEW TAB of an already-logged-in
    // browser, since Firebase Auth's own persistence is shared across tabs
    // of the same browser. deviceId is ALSO shared across those tabs (same
    // localStorage), so every tab was writing a fresh random token to the
    // exact same session doc — each new tab's write made the PREVIOUS
    // tab's onSnapshot listener see a "different" token and self-kick,
    // even though it was really the same browser kicking itself. A stable
    // per-browser token makes every tab's (re-)registration a no-op write
    // for the doc's sessionToken field, so no mismatch, no kick.
    let sessionToken: string;
    try {
      sessionToken = window.localStorage.getItem(SESSION_TOKEN_KEY) || crypto.randomUUID();
    } catch {
      sessionToken = crypto.randomUUID();
    }

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(sessionRef);
      const prev = snap.exists() ? snap.data() : null;
      tx.set(sessionRef, {
        userId: nextUser.uid,
        deviceId,
        deviceType,
        sessionToken,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        status: 'ACTIVE',
        createdAt: prev ? prev.createdAt : serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    });

    if (callId !== sessionCallIdRef.current) return;

    try {
      window.localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    } catch {
      // ignore storage access issues
    }

    teardownSessionWatch();
    // The very first snapshot from a brand new listener can occasionally
    // echo back a read that doesn't yet reflect the transaction this same
    // call just committed (a read-after-write timing edge case) — comparing
    // that first echo against our own fresh token produced a spurious
    // mismatch and self-kicked a device on a perfectly normal solo login.
    // We already know our own token is authoritative the moment we wrote
    // it, so the first delivery is only used to arm the listener; real
    // "kicked by another device" detection starts from the second update.
    let isFirstSnapshot = true;
    sessionUnsubRef.current = onSnapshot(sessionRef, (snap) => {
      if (callId !== sessionCallIdRef.current) return;
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        return;
      }
      const data = snap.data();
      let myToken: string | null = sessionToken;
      try {
        myToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
      } catch {
        // keep the in-memory token if storage is unavailable
      }
      if (data && myToken && data.sessionToken !== myToken) {
        signOut(getFirebaseAuth()).catch(() => undefined);
      }
    });
  }, [teardownSessionWatch]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // No apps/web/.env.local yet (see .env.example) — stay in a plain
      // "logged out" state instead of throwing on every page load.
      setAuthLoading(false);
      return undefined;
    }

    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      profileUnsubRef.current?.();
      if (nextUser) {
        // Re-arm the loading gate for this sign-in even if a previous
        // logged-out state already cleared it — otherwise a fresh login
        // that immediately navigates (e.g. /manager/login) can render one
        // frame with isLoggedIn=true but isAdmin still at its stale
        // default, and RequireAdmin bounces a real admin before the first
        // profile snapshot below has a chance to arrive.
        setAuthLoading(true);
        const { referralCode, fullName } = pendingProfileRef.current;
        pendingProfileRef.current = {};

        try {
          await ensureOwnProfile(nextUser, referralCode, fullName);
        } catch (err) {
          console.error('ensureOwnProfile failed', err);
        }

        // authLoading only clears once this FIRST snapshot lands — setting
        // it false right after ensureOwnProfile (before role is known)
        // let RequireAdmin read the still-default isAdmin=false and bounce
        // a real admin out on any fresh/uncached session (exactly the race
        // that made /manager flaky). Later snapshots update state as usual
        // without touching authLoading again.
        let firstSnapshot = true;
        profileUnsubRef.current = onSnapshot(doc(db, 'users', nextUser.uid), (snap) => {
          const data = snap.data();
          setAvatarUrl(data?.avatarUrl ?? null);
          setIsAdmin(data?.role === 'admin');
          // No Admin SDK anymore to actually disable the Firebase Auth
          // account, so a LOCKED status is enforced here instead — the
          // account can still technically re-authenticate elsewhere, but
          // every tab of this app signs it out the moment status flips.
          if (data?.status === 'LOCKED') {
            signOut(getFirebaseAuth()).catch(() => undefined);
          }
          if (firstSnapshot) {
            firstSnapshot = false;
            setAuthLoading(false);
          }
        });

        registerSessionAndWatch(nextUser).catch((err) => console.error('registerSession failed', err));
      } else {
        setIsAdmin(false);
        setAvatarUrl(null);
        teardownSessionWatch();
        try {
          window.localStorage.removeItem(SESSION_TOKEN_KEY);
        } catch {
          // ignore
        }
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      teardownSessionWatch();
      profileUnsubRef.current?.();
    };
  }, [ensureOwnProfile, registerSessionAndWatch, teardownSessionWatch]);

  const loginWithEmail = useCallback(async (email: string, password: string, remember: boolean) => {
    if (!isFirebaseConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const auth = getFirebaseAuth();
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const registerWithEmail = useCallback(async (
    email: string,
    password: string,
    profile: { referralCode?: string; fullName?: string },
    remember: boolean,
  ) => {
    if (!isFirebaseConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const auth = getFirebaseAuth();
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    pendingProfileRef.current = profile;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (profile.fullName) {
      // Best-effort — ensureOwnProfile (via pendingProfileRef, race-free
      // against onAuthStateChanged) is what actually guarantees the name
      // lands in Firestore; this just keeps Firebase Auth's own
      // displayName in sync so `userName` above reflects it immediately.
      await updateProfile(cred.user, { displayName: profile.fullName }).catch(() => undefined);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const auth = getFirebaseAuth();
    await setPersistence(auth, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    // Without this, Google silently reuses whichever Google account is
    // already active in the browser and skips the picker — fine for a
    // single-admin site, but this one has TWO admin Gmail accounts
    // (BOOTSTRAP_ADMIN_EMAILS) that need to switch between each other on
    // the same machine/browser without first signing out of Google itself.
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }, []);

  const logout = useCallback(() => {
    if (!isFirebaseConfigured()) return;
    teardownSessionWatch();
    signOut(getFirebaseAuth()).catch(() => undefined);
  }, [teardownSessionWatch]);

  // updatePassword requires a recent sign-in — reauthenticate with the
  // CURRENT password first (the only way to prove it for an email/
  // password account; there is no equivalent flow for a Google-only
  // account, which is why hasPasswordProvider gates the whole feature).
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!isFirebaseConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current || !current.email) throw new Error('not-signed-in');
    const credential = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, credential);
    await updatePassword(current, newPassword);
  }, []);

  const userName = user?.displayName || (user?.email ? user.email.split('@')[0] : '');
  const userEmail = user?.email || '';
  const hasPasswordProvider = user?.providerData.some((p) => p.providerId === 'password') ?? false;

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!user,
        authLoading,
        isAdmin,
        userName,
        userEmail,
        avatarUrl,
        uid: user?.uid ?? null,
        hasPasswordProvider,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
