'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../../../components/layout/AdminShell';
import { DEFAULT_AUTO_REPLY, loadAutoReplyMessage, saveAutoReplyMessage } from '../../../lib/auto-reply-store';
import { usePageTitle } from '../../../lib/use-page-title';
import { useAuth, BOOTSTRAP_ADMIN_EMAILS } from '../../../lib/auth';
import { isGoogleDriveConfigured } from '../../../lib/googleDrive';
import { backupOldAuditLogs } from '../../../lib/backupLogs';
import { subscribeSystemRates, saveSystemRates, DEFAULT_RATES, type SystemRates } from '../../../lib/systemConfig';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';

export default function AdminSettingsPage() {
  usePageTitle('Cấu hình hệ thống');
  const { userEmail, logout } = useAuth();
  const { lang } = useLanguage();

  const [showAutoReplyForm, setShowAutoReplyForm] = useState(false);
  const [autoReply, setAutoReply] = useState(DEFAULT_AUTO_REPLY);
  const [autoReplySaved, setAutoReplySaved] = useState(false);

  const [backupDays, setBackupDays] = useState(30);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{ count: number; webViewLink: string } | 'error' | null>(null);

  const [rates, setRates] = useState<SystemRates>(DEFAULT_RATES);
  const [ratesForm, setRatesForm] = useState<SystemRates>(DEFAULT_RATES);
  const [showRatesForm, setShowRatesForm] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [ratesSaved, setRatesSaved] = useState(false);

  useEffect(() => {
    setAutoReply(loadAutoReplyMessage());
  }, []);

  useEffect(() => {
    return subscribeSystemRates((r) => {
      setRates(r);
      setRatesForm(r);
    });
  }, []);

  const handleSaveRates = async () => {
    setSavingRates(true);
    try {
      await saveSystemRates(ratesForm);
      setRatesSaved(true);
      setTimeout(() => setRatesSaved(false), 2000);
    } finally {
      setSavingRates(false);
    }
  };

  const handleSaveAutoReply = () => {
    saveAutoReplyMessage(autoReply);
    setAutoReplySaved(true);
    setTimeout(() => setAutoReplySaved(false), 2000);
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupResult(null);
    try {
      const result = await backupOldAuditLogs(backupDays);
      setBackupResult(result);
    } catch (err) {
      console.error('backup failed', err);
      setBackupResult('error');
    } finally {
      setBackingUp(false);
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

      <section className="panel">
        <div className="panel-header">
          <h3>💰 Tỷ lệ hoàn tiền &amp; ngưỡng rút tiền</h3>
          <button
            className="button button-secondary"
            onClick={() => {
              setRatesForm(rates);
              setShowRatesForm((v) => !v);
            }}
          >
            {showRatesForm ? 'Đóng' : 'Chỉnh sửa'}
          </button>
        </div>
        <p className="muted-copy">
          Dữ liệu thật từ Firestore (<code>systemConfig/rates</code>) — % hoàn tiền dùng để ước tính ở trang &quot;Nhận
          hoàn tiền&quot;, ngưỡng rút tiền áp dụng ngay khi khách tạo yêu cầu rút ở Ví tiền.
        </p>

        {!showRatesForm ? (
          <div className="profile-grid" style={{ marginTop: 14 }}>
            <div><span className="field-label">Shopee</span><strong>{Math.round(rates.shopeeRate * 100)}%</strong></div>
            <div><span className="field-label">Lazada</span><strong>{Math.round(rates.lazadaRate * 100)}%</strong></div>
            <div><span className="field-label">TikTok Shop</span><strong>{Math.round(rates.tiktokRate * 100)}%</strong></div>
            <div><span className="field-label">Ngưỡng rút tối thiểu</span><strong>{formatCurrency(rates.minWithdraw, lang)}</strong></div>
          </div>
        ) : (
          <>
            <div className="two-column-grid" style={{ marginTop: 14 }}>
              <label>
                <span className="field-label">Shopee (%)</span>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={Math.round(ratesForm.shopeeRate * 1000) / 10}
                  onChange={(e) => setRatesForm((f) => ({ ...f, shopeeRate: (Number(e.target.value) || 0) / 100 }))}
                />
              </label>
              <label>
                <span className="field-label">Lazada (%)</span>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={Math.round(ratesForm.lazadaRate * 1000) / 10}
                  onChange={(e) => setRatesForm((f) => ({ ...f, lazadaRate: (Number(e.target.value) || 0) / 100 }))}
                />
              </label>
              <label>
                <span className="field-label">TikTok Shop (%)</span>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={Math.round(ratesForm.tiktokRate * 1000) / 10}
                  onChange={(e) => setRatesForm((f) => ({ ...f, tiktokRate: (Number(e.target.value) || 0) / 100 }))}
                />
              </label>
              <label>
                <span className="field-label">Ngưỡng rút tối thiểu (đ)</span>
                <input
                  type="number" min={0} step={1000}
                  value={ratesForm.minWithdraw}
                  onChange={(e) => setRatesForm((f) => ({ ...f, minWithdraw: Number(e.target.value) || 0 }))}
                />
              </label>
            </div>
            <button className="button button-primary" style={{ marginTop: 12 }} onClick={handleSaveRates} disabled={savingRates}>
              {savingRates ? 'Đang lưu...' : ratesSaved ? '✓ Đã lưu' : 'Lưu thay đổi'}
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>💬 Tin nhắn trả lời tự động</h3>
          <button className="button button-secondary" onClick={() => setShowAutoReplyForm((v) => !v)}>
            {showAutoReplyForm ? 'Đóng' : 'Chỉnh sửa'}
          </button>
        </div>

        {showAutoReplyForm && (
          <>
            <p className="muted-copy">
              Nội dung này sẽ tự động hiện lại cho khách sau khi họ gửi tin nhắn hỗ trợ đầu tiên, dùng cho lúc admin
              không online. <strong>Lưu ý:</strong> hiện lưu trên trình duyệt của bạn — mọi khách hàng đều thấy nội
              dung này khi cấu hình được đồng bộ qua Firebase; trước đó, khách trên thiết bị khác sẽ thấy nội dung
              mặc định cho tới khi bạn kết nối backend thật.
            </p>
            <textarea
              className="support-chat-textarea"
              style={{ marginTop: 12, minHeight: 90 }}
              value={autoReply}
              onChange={(e) => setAutoReply(e.target.value)}
            />
            <button className="button button-primary" style={{ marginTop: 10 }} onClick={handleSaveAutoReply}>
              {autoReplySaved ? '✓ Đã lưu' : 'Lưu nội dung'}
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <h3>🔒 Tài khoản quản trị</h3>
        <p className="muted-copy">
          Đang đăng nhập với <strong>{userEmail || 'chưa xác định'}</strong> qua Google. Khu vực quản trị chỉ chấp
          nhận đăng nhập Google từ đúng 2 địa chỉ được cấp phép cứng trong mã nguồn và Firestore Rules:
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20 }} className="muted-copy">
          {BOOTSTRAP_ADMIN_EMAILS.map((email) => (
            <li key={email}><code>{email}</code></li>
          ))}
        </ul>
        <p className="muted-copy" style={{ marginTop: 10 }}>
          Không có mật khẩu nào để đổi (không dùng đăng nhập email/mật khẩu cho Admin nữa), và không có nút cấp quyền
          Admin cho tài khoản khác ở bất kỳ đâu trong hệ thống — vai trò <code>role</code> bị khoá vĩnh viễn ngay từ
          lúc tài khoản được tạo, không ai (kể cả Admin) có thể sửa lại sau đó.
        </p>
        <button className="button button-secondary" style={{ marginTop: 14 }} onClick={logout}>
          🚪 Đăng xuất
        </button>
      </section>

      <section className="panel">
        <h3>💾 Backup log cũ lên Google Drive</h3>
        <p className="muted-copy">
          Không còn Cloud Scheduler nên việc dọn dữ liệu cũ chỉ chạy khi bạn bấm nút này. Xuất các bản ghi{' '}
          <code>adminAuditLogs</code> cũ hơn số ngày bên dưới thành file CSV, tải thẳng vào Google Drive cá nhân của
          bạn (yêu cầu đăng nhập Google lần đầu), rồi xoá khỏi Firestore để cơ sở dữ liệu luôn nhẹ.
        </p>

        {!isGoogleDriveConfigured() && (
          <p className="admin-gate-error" style={{ marginTop: 10 }}>
            Chưa cấu hình Google OAuth Client ID (<code>NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID</code>) — xem hướng dẫn kết nối Drive.
          </p>
        )}

        <div className="admin-action-row" style={{ marginTop: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Cũ hơn
            <input
              type="number"
              min={1}
              value={backupDays}
              onChange={(e) => setBackupDays(Number(e.target.value) || 30)}
              style={{ width: 70 }}
            />
            ngày
          </label>
          <button className="button button-primary" onClick={handleBackup} disabled={backingUp || !isGoogleDriveConfigured()}>
            {backingUp ? 'Đang backup...' : '☁️ Backup & dọn dẹp'}
          </button>
        </div>

        {backupResult === 'error' && <p className="admin-gate-error" style={{ marginTop: 8 }}>Backup thất bại, vui lòng thử lại.</p>}
        {backupResult && backupResult !== 'error' && (
          <p className="muted-copy" style={{ marginTop: 8 }}>
            {backupResult.count === 0
              ? 'Không có bản ghi nào đủ cũ để backup.'
              : `✓ Đã backup và xoá ${backupResult.count} bản ghi. `}
            {backupResult.webViewLink && (
              <a href={backupResult.webViewLink} target="_blank" rel="noreferrer">Xem file trên Drive</a>
            )}
          </p>
        )}
      </section>

    </AdminShell>
  );
}
