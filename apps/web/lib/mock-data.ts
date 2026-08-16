export type Status = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED' | 'PAID' | 'AVAILABLE' | 'WITHDRAWN';

export const mockPlatforms = [
  { name: 'Shopee', accent: '#ee4d2d', description: 'Tốc độ nhận diện link và lưu trữ đơn hàng theo chuẩn affiliate.' },
  { name: 'TikTok Shop', accent: '#0ea5e9', description: 'Theo dõi nguồn click và commission trong luồng mua hàng mới.' },
  { name: 'Lazada', accent: '#f59e0b', description: 'Chuẩn hóa product URL và kiểm tra xác nhận hoa hồng.' },
];

export const mockBenefits = [
  {
    title: 'Nhận diện sàn tự động',
    text: 'Hệ thống tự động xác định Shopee, TikTok Shop hoặc Lazada từ URL bạn dán.',
  },
  {
    title: 'Chuẩn hóa link an toàn',
    text: 'URL được làm sạch, kiểm tra độ hợp lệ và chuẩn bị luồng mua hàng riêng.',
  },
  {
    title: 'Theo dõi đúng trạng thái',
    text: 'Cashback chỉ được mới được tính khi commission đã được xác nhận thực tế.',
  },
  {
    title: 'Giảm rủi ro gian lận',
    text: 'Hệ thống đánh dấu duplicate order, self-referral risk và abnormal cashback.',
  },
];

export const mockOrderRows = [
  { id: 'ORD-2401', product: 'Máy lọc không khí cao cấp', platform: 'Shopee', date: '12/08/2026', value: 6200000, commission: 186000, cashback: 93000, status: 'PENDING' },
  { id: 'ORD-2389', product: 'Đồng hồ thông minh', platform: 'TikTok Shop', date: '09/08/2026', value: 4200000, commission: 126000, cashback: 98000, status: 'CONFIRMED' },
  { id: 'ORD-2364', product: 'Sữa rửa mặt chuyên dụng', platform: 'Lazada', date: '04/08/2026', value: 520000, commission: 31200, cashback: 15600, status: 'REFUNDED' },
  { id: 'ORD-2332', product: 'Bàn phím cơ', platform: 'Shopee', date: '31/07/2026', value: 2100000, commission: 63000, cashback: 48000, status: 'CANCELLED' },
];

export const mockCashbackRows = [
  { id: 'CB-1102', platform: 'Shopee', amount: 93000, status: 'PENDING', date: '12/08/2026' },
  { id: 'CB-1101', platform: 'TikTok Shop', amount: 98000, status: 'AVAILABLE', date: '09/08/2026' },
  { id: 'CB-1099', platform: 'Lazada', amount: 15600, status: 'WITHDRAWN', date: '04/08/2026' },
  { id: 'CB-1098', platform: 'Shopee', amount: 48000, status: 'CONFIRMED', date: '31/07/2026' },
];

export const mockDashboardStats = [
  { label: 'Tổng cashback', value: '₫420.000', delta: '+12.5%' },
  { label: 'Cashback chờ', value: '₫156.000', delta: '3 đơn hàng' },
  { label: 'Cashback xác nhận', value: '₫234.000', delta: '+8.4%' },
  { label: 'Cashback đã rút', value: '₫88.000', delta: '1 giao dịch' },
];

export const mockAdminStats = [
  { label: 'Users', value: '1,284' },
  { label: 'Orders', value: '8,910' },
  { label: 'Commission', value: '₫46.3M' },
  { label: 'Confirmed commission', value: '₫31.7M' },
  { label: 'Pending commission', value: '₫8.2M' },
  { label: 'Cashback', value: '₫18.7M' },
  { label: 'Pending cashback', value: '₫4.1M' },
  { label: 'Withdrawals', value: '₫11.2M' },
];

export const mockFraudSignals = [
  { user: 'anhquang@example.com', reason: 'Duplicate order pattern', risk: 'HIGH' },
  { user: 'thuylinh@gmail.com', reason: 'Suspicious click burst', risk: 'MEDIUM' },
  { user: 'bichngoc@demo.vn', reason: 'Self-referral risk', risk: 'HIGH' },
];

export const mockFaq = [
  { question: 'Cashback có chắc chắn được trả không?', answer: 'Không. Cashback chỉ được ghi nhận khi commission đã xác nhận từ nền tảng/đơn hàng tương ứng.' },
  { question: 'Tôi có thể dán link từ sàn nào?', answer: 'Hiện hỗ trợ Shopee, TikTok Shop và Lazada, với flow chuẩn hóa riêng cho từng nền tảng.' },
  { question: 'Hệ thống có lưu lịch sử không?', answer: 'Có. Mọi đơn hàng, commission và cashback đều có lịch sử theo dõi và trạng thái rõ ràng.' },
  { question: 'Có thể rút tiền không?', answer: 'Có. Bạn có thể theo dõi phần cashback có sẵn, sau đó điều hướng tới luồng rút tiền trong dashboard.' },
];

export const mockProtectedLinks = [
  {
    title: 'Mua hàng trên Shopee',
    description: 'Chuẩn hóa và theo dõi đơn hàng, commission, cashback sau khi xác nhận.',
  },
  {
    title: 'Mua hàng trên TikTok Shop',
    description: 'Theo dõi click đến product link và đánh giá commission theo trạng thái thực tế.',
  },
  {
    title: 'Mua hàng trên Lazada',
    description: 'Giữ link sạch và ánh xạ trạng thái order theo công thức affiliate chuẩn.',
  },
];
