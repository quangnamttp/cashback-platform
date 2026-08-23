import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminSettingsPage() {
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
        <h3>Cổng thanh toán rút tiền</h3>
        <p className="muted-copy">Bank transfer, MoMo, ZaloPay — bật/tắt từng phương thức (giao diện minh họa, chưa nối logic thật).</p>
      </section>

      <p className="mock-note">Đây là giao diện nền tảng (foundation) cho Admin — logic backend cấu hình sẽ triển khai ở phase sau.</p>
    </AdminShell>
  );
}
