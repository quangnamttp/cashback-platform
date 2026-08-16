export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand-name">Cashback Platform</div>
          <p className="footer-copy">Theo dõi commission, cashback và trạng thái đơn hàng với luồng chuẩn hóa và adapter-ready cho nhiều sàn.</p>
        </div>

        <div>
          <h4>Khám phá</h4>
          <ul className="footer-links">
            <li>Home</li>
            <li>Cách hoạt động</li>
            <li>Sàn hỗ trợ</li>
          </ul>
        </div>

        <div>
          <h4>Hỗ trợ</h4>
          <ul className="footer-links">
            <li>FAQ</li>
            <li>Liên hệ</li>
            <li>Chính sách</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
