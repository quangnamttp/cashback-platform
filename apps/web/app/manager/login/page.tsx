'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import { signOut } from 'firebase/auth';
import { useAuth, BOOTSTRAP_ADMIN_EMAILS } from '../../../lib/auth';
import { getFirebaseAuth } from '../../../lib/firebase';
import { usePageTitle } from '../../../lib/use-page-title';

function mapFirebaseError(err: unknown): string {
  if (err instanceof Error && err.message === 'firebase-not-configured') {
    return 'Chưa cấu hình Firebase cho ứng dụng này.';
  }
  if (err instanceof FirebaseError) {
    if (err.code === 'auth/popup-closed-by-user') return '';
    if (err.code === 'auth/too-many-requests') return 'Bạn thử sai quá nhiều lần, vui lòng thử lại sau ít phút.';
    return 'Đăng nhập thất bại, vui lòng thử lại.';
  }
  return 'Đăng nhập thất bại, vui lòng thử lại.';
}

export default function ManagerLoginPage() {
  usePageTitle('Đăng nhập quản trị');
  const { loginWithGoogle, isLoggedIn, authLoading, isAdmin } = useAuth();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isLoggedIn && isAdmin) {
      router.replace('/manager');
    }
  }, [authLoading, isLoggedIn, isAdmin, router]);

  const handleGoogleLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      await loginWithGoogle();
      const email = getFirebaseAuth().currentUser?.email ?? '';
      if (!BOOTSTRAP_ADMIN_EMAILS.includes(email)) {
        await signOut(getFirebaseAuth());
        setError('Tài khoản Google này không có quyền truy cập khu vực quản trị.');
        return;
      }
      router.replace('/manager');
    } catch (err) {
      const message = mapFirebaseError(err);
      if (message) setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-head">
          <span className="login-card-eyebrow">Khu vực quản trị</span>
          <h1>Đăng nhập quản trị viên</h1>
          <p className="muted-copy" style={{ marginTop: 6 }}>
            Chỉ tài khoản Google được cấp phép mới truy cập được khu vực này.
          </p>
        </div>

        {error && <p className="admin-gate-error">{error}</p>}

        <button type="button" className="login-google-btn" onClick={handleGoogleLogin} disabled={submitting}>
          <span className="login-google-icon">G</span>
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập bằng Google'}
        </button>

        <Link href="/" className="text-link login-back-home">← Về trang người dùng</Link>
      </div>
    </div>
  );
}
