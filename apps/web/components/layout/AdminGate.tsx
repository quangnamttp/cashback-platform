'use client';

import { useEffect, useState } from 'react';

const SESSION_KEY = 'cb_admin_demo_unlocked';
const DEMO_PASSWORD = 'admin123';

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(window.sessionStorage.getItem(SESSION_KEY) === '1');
    } catch {
      setUnlocked(false);
    }
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (input === DEMO_PASSWORD) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // ignore storage errors
      }
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  if (unlocked === null) {
    return null;
  }

  if (!unlocked) {
    return (
      <div className="admin-gate-screen">
        <form className="admin-gate-card" onSubmit={handleSubmit}>
          <div className="brand-mark">C</div>
          <h1>Admin console</h1>
          <p className="muted-copy">
            Khu vực quản trị — chỉ dành cho đội ngũ vận hành. Đây là rào chắn tạm thời ở mức giao diện,
            <strong> chưa phải bảo mật thật</strong>. Trước khi triển khai thật cần thay bằng đăng nhập +
            phân quyền (RBAC) từ backend.
          </p>
          <input
            type="password"
            placeholder="Mật khẩu admin (demo)"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError(false);
            }}
            autoFocus
          />
          {error && <span className="admin-gate-error">Sai mật khẩu demo.</span>}
          <button type="submit" className="button button-primary wide-button">Vào trang quản trị</button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
