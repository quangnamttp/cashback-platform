'use client';

import { useState } from 'react';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminSettingsPage() {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: 'idle', message: '' });

    if (newPassword.length < 6) {
      setStatus({ type: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'Xác nhận mật khẩu không khớp.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/manager-auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Đổi mật khẩu thành công. Lần đăng nhập sau sẽ dùng mật khẩu mới.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setShowPasswordForm(false), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'wrong_current_password') {
          setStatus({ type: 'error', message: 'Mật khẩu hiện tại không đúng.' });
        } else {
          setStatus({ type: 'error', message: 'Có lỗi xảy ra, vui lòng thử lại.' });
        }
      }
    } catch {
      setStatus({ type: 'error', message: 'Không thể kết nối máy chủ, vui lòng thử lại.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Cấu hình</span>
          <h1>Cấu hình hệ thống</h1>
        </div>
      </div>

      <section className="two-column-grid">
        <div className="panel">
          <h3>Tỷ lệ hoàn tiền mặc định</h3>
          <p className="muted-copy">Cấu hình % hoàn tiền mặc định theo từng sàn (Shopee, Lazada, TikTok Shop).</p>
          <div className="profile-grid">
            <div><span className="field-label">Shopee</span><strong>4%</strong></div>
            <div><span className="field-label">Lazada</span><strong>5%</strong></div>
            <div><span className="field-label">TikTok Shop</span><strong>3%</strong></div>
          </div>
        </div>

        <div className="panel">
          <h3>Ngưỡng rút tiền</h3>
          <p className="muted-copy">Số tiền tối thiểu người dùng có thể yêu cầu rút.</p>
          <div className="profile-grid">
            <div><span className="field-label">Ngưỡng tối thiểu</span><strong>₫50.000</strong></div>
            <div><span className="field-label">Thời gian xử lý</span><strong>1-3 ngày làm việc</strong></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>🔒 Đổi mật khẩu quản trị</h3>
          <button className="button button-secondary" onClick={() => setShowPasswordForm((v) => !v)}>
            {showPasswordForm ? 'Đóng' : 'Đổi mật khẩu'}
          </button>
        </div>

        {showPasswordForm && (
          <>
            <p className="muted-copy">
              Mật khẩu dùng để đăng nhập trang <code>/manager</code>. Đổi mật khẩu ở đây sẽ lưu qua cookie an toàn
              (httpOnly) trên trình duyệt này — <strong>chưa phải hệ thống tài khoản admin đầy đủ</strong> (chưa có
              nhiều tài khoản riêng biệt, chưa có nhật ký ai đổi mật khẩu). Nếu xoá cookie trình duyệt hoặc đổi máy khác,
              mật khẩu sẽ quay về giá trị mặc định đã cấu hình trên server.
            </p>

            <form onSubmit={handleChangePassword} className="bank-add-form" style={{ maxWidth: 420, marginTop: 18 }}>
              <label>
                <span className="field-label">Mật khẩu hiện tại</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label>
                <span className="field-label">Mật khẩu mới</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
              <label>
                <span className="field-label">Xác nhận mật khẩu mới</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>

              {status.type !== 'idle' && (
                <p className={status.type === 'error' ? 'admin-gate-error' : 'muted-copy'} style={status.type === 'success' ? { color: 'var(--success)' } : undefined}>
                  {status.message}
                </p>
              )}

              <button type="submit" className="button button-primary" disabled={submitting}>
                {submitting ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </form>
          </>
        )}
      </section>

      <p className="mock-note">Đây là giao diện nền tảng (foundation) cho Admin — logic backend cấu hình đầy đủ (RBAC, nhiều tài khoản) sẽ triển khai ở phase sau.</p>
    </AdminShell>
  );
}
