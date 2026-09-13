export type Status = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED' | 'PAID' | 'AVAILABLE' | 'WITHDRAWN';

export const mockPlatforms = [
  { name: 'Shopee', accent: '#ee4d2d', description: 'Tốc độ nhận diện link và lưu trữ đơn hàng theo chuẩn affiliate.' },
  { name: 'TikTok Shop', accent: '#0ea5e9', description: 'Theo dõi nguồn click và commission trong luồng mua hàng mới.' },
  { name: 'Lazada', accent: '#f59e0b', description: 'Chuẩn hóa product URL và kiểm tra xác nhận hoa hồng.' },
];

export const mockHomeEvents = [
  { id: 1, src: '/hero/hero-1.jpg', alt: 'Hoàn tiền khủng lên tới 80% số tiền sàn chi trả — Shopee, Lazada, TikTok và hơn nữa' },
  { id: 2, src: '/hero/hero-2.jpg', alt: 'Ghi nhận tất cả đơn dù mua sai sản phẩm so với khi lấy link' },
  { id: 3, src: '/hero/hero-3.jpg', alt: 'Hướng dẫn lấy link sản phẩm trên Shopee và TikTok Shop' },
  { id: 4, src: '/hero/hero-4.jpg', alt: 'Mua sắm nhận tiền hoàn, tiết kiệm mỗi ngày' },
];

export const mockFaq = [
  {
    question: 'Cashback có chắc chắn được hoàn không?',
    answer:
      'Có, miễn đơn hàng của bạn được sàn (Shopee, TikTok Shop, Lazada) xác nhận thành công, không bị hủy hay trả hàng. Bạn có thể theo dõi trạng thái từng đơn ngay trong mục Đơn hàng.',
  },
  {
    question: 'Trang hỗ trợ những sàn nào?',
    answer: 'Hiện hỗ trợ Shopee, TikTok Shop và Lazada — chỉ cần dán link sản phẩm từ 1 trong 3 sàn này vào trang Nhận hoàn tiền.',
  },
  {
    question: 'Tôi có xem lại được lịch sử đơn hàng và hoàn tiền không?',
    answer: 'Có. Mọi đơn hàng, trạng thái duyệt và số tiền hoàn đều được lưu đầy đủ, xem trực tiếp tại mục Đơn hàng và Ví tiền.',
  },
  {
    question: 'Làm sao để rút tiền hoàn về tài khoản?',
    answer: 'Vào mục Ví tiền, chọn số dư khả dụng và tạo lệnh rút — hệ thống sẽ xử lý và chuyển khoản theo thông tin ngân hàng bạn cung cấp.',
  },
];

export const bankList = [
  'Vietcombank',
  'Techcombank',
  'MBBank',
  'BIDV',
  'VietinBank',
  'Agribank',
  'ACB',
  'VPBank',
  'TPBank',
  'Sacombank',
  'VIB',
  'SHB',
  'HDBank',
  'MSB',
  'OCB',
  'SeABank',
  'Eximbank',
  'LPBank',
  'Nam A Bank',
  'ABBank',
  'PVcomBank',
  'BacABank',
  'VietBank',
  'Kienlongbank',
  'SCB',
  'DongABank',
  'VietABank',
  'PGBank',
  'Saigonbank',
  'CAKE by VPBank',
  'MoMo (Ví điện tử)',
  'ZaloPay (Ví điện tử)',
  'Viettel Money (Ví điện tử)',
  'ShopeePay (Ví điện tử)',
  'VNPay (Ví điện tử)',
];
