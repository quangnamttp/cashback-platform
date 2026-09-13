'use client';

import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { usePageTitle } from '../../lib/use-page-title';

const POLICY_SECTIONS = [
  {
    icon: '💰',
    title: 'Hoàn tiền',
    items: [
      'Cashback được ghi nhận khi đơn hàng của bạn được Shopee, TikTok Shop hoặc Lazada xác nhận thành công. Nếu đơn hàng bị hủy hoặc trả hàng, khoản cashback tương ứng sẽ bị thu hồi.',
      'Bạn nhận tới 80% hoa hồng do sàn chi trả cho mỗi đơn hàng hợp lệ; phần còn lại dùng để vận hành hệ thống.',
      'Thời gian sàn xác nhận đơn hàng (chỉ mang tính tham khảo, có thể thay đổi theo từng thời điểm): Shopee khoảng 7-15 ngày, TikTok Shop khoảng 7-30 ngày tùy chương trình từng shop, Lazada khoảng 3-15 ngày sau khi đơn hoàn tất. Ngay khi sàn xác nhận, hệ thống tự động cập nhật trạng thái trên web trong vòng 24 giờ.',
    ],
  },
  {
    icon: '👥',
    title: 'Giới thiệu bạn bè',
    items: [
      'Mời bạn bè mua sắm bằng mã hoặc link giới thiệu riêng của bạn.',
      'Khi đơn hàng của người được giới thiệu được xác nhận, bạn nhận thêm 5% hoa hồng vào ví — khoản này được giữ tạm và duyệt giải phóng theo đúng cơ chế như cashback thông thường.',
    ],
  },
  {
    icon: '🏦',
    title: 'Rút tiền',
    items: [
      'Không giới hạn thời gian, không phân biệt số tiền lớn hay nhỏ — mọi lệnh rút tiền đều được đội ngũ vận hành xem xét và duyệt thủ công, sau đó chuyển khoản trực tiếp đến tài khoản ngân hàng bạn cung cấp.',
      'Số dư khả dụng luôn được tính trực tiếp từ lịch sử giao dịch thật trong hệ thống, không dùng bộ đếm riêng, nên không thể bị sai lệch.',
    ],
  },
  {
    icon: '🛡️',
    title: 'Gian lận & bảo mật tài khoản',
    items: [
      'Hệ thống giám sát các dấu hiệu bất thường (trả hàng liên tục, giá trị đơn hàng cao bất thường...) nhằm bảo vệ tính minh bạch cho toàn bộ người dùng.',
      'Tài khoản có dấu hiệu vi phạm có thể bị tạm khóa. Mọi quyết định khóa hoặc mở lại tài khoản đều do đội ngũ vận hành xem xét thủ công, không có cơ chế tự động khóa tài khoản.',
    ],
  },
  {
    icon: '🔒',
    title: 'Dữ liệu cá nhân',
    items: [
      'Thông tin tài khoản của bạn (email, lịch sử đơn hàng, thông tin ngân hàng khi rút tiền) chỉ được sử dụng để vận hành dịch vụ hoàn tiền, không chia sẻ cho bên thứ ba ngoài mục đích này.',
    ],
  },
];

export default function PolicyPage() {
  const { t } = useLanguage();
  usePageTitle(t('footer_policy'));

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">Hoàn Tiền DV</span>
            <h1>{t('footer_policy')}</h1>
          </div>
        </div>

        <p className="muted-copy" style={{ marginTop: -8 }}>
          Các điều khoản dưới đây mô tả đúng cách hệ thống Hoàn Tiền DV đang vận hành thật, giúp bạn hiểu rõ quyền lợi
          và trách nhiệm khi sử dụng dịch vụ.
        </p>

        {POLICY_SECTIONS.map((section) => (
          <section key={section.title} className="panel policy-section">
            <div className="policy-section-head">
              <span className="promo-icon-badge">{section.icon}</span>
              <h3>{section.title}</h3>
            </div>
            <ul className="policy-section-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <p className="muted-copy" style={{ fontSize: '0.78rem' }}>
          Có thắc mắc về chính sách? Liên hệ đội ngũ hỗ trợ tại mục{' '}
          <a href="/support#contact">Hỗ trợ</a>.
        </p>
      </div>
    </AppShell>
  );
}
