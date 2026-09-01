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
  { question: 'Cashback có chắc chắn được trả không?', answer: 'Không. Cashback chỉ được ghi nhận khi commission đã xác nhận từ nền tảng/đơn hàng tương ứng.' },
  { question: 'Tôi có thể dán link từ sàn nào?', answer: 'Hiện hỗ trợ Shopee, TikTok Shop và Lazada, với flow chuẩn hóa riêng cho từng nền tảng.' },
  { question: 'Hệ thống có lưu lịch sử không?', answer: 'Có. Mọi đơn hàng, commission và cashback đều có lịch sử theo dõi và trạng thái rõ ràng.' },
  { question: 'Có thể rút tiền không?', answer: 'Có. Bạn có thể theo dõi phần cashback có sẵn, sau đó điều hướng tới luồng rút tiền trong dashboard.' },
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
