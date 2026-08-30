export type Status = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED' | 'PAID' | 'AVAILABLE' | 'WITHDRAWN';

export const mockPlatforms = [
  { name: 'Shopee', accent: '#ee4d2d', description: 'Tốc độ nhận diện link và lưu trữ đơn hàng theo chuẩn affiliate.' },
  { name: 'TikTok Shop', accent: '#0ea5e9', description: 'Theo dõi nguồn click và commission trong luồng mua hàng mới.' },
  { name: 'Lazada', accent: '#f59e0b', description: 'Chuẩn hóa product URL và kiểm tra xác nhận hoa hồng.' },
];

export const mockHomeEvents = [
  { id: 1, platform: 'Shopee', tag: 'Sự kiện', title: 'Shopee Mega Sale — hoàn tiền tăng gấp đôi cuối tuần này', accent: '#ee4d2d' },
  { id: 2, platform: 'TikTok Shop', tag: 'Xu hướng', title: 'Săn deal Livestream TikTok Shop — nhiều mã hoàn tiền mới mỗi ngày', accent: '#111827' },
  { id: 3, platform: 'Lazada', tag: 'Ưu đãi', title: 'Lazada Flash Sale khung giờ vàng — dán link sớm để không bỏ lỡ', accent: '#0f146d' },
  { id: 4, platform: 'Shopee', tag: 'Mẹo hay', title: 'Mẹo tối ưu hoàn tiền: dán link trước khi vào giỏ hàng', accent: '#ee4d2d' },
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
  { id: 'ORD-2401', product: 'Máy lọc không khí cao cấp', platform: 'Shopee', date: '12/08/2026', time: '08:00', value: 6200000, commission: 186000, cashback: 93000, status: 'PENDING', linkUrl: 'https://shopee.vn/product/2401', shippingStage: 1 },
  { id: 'ORD-2389', product: 'Đồng hồ thông minh', platform: 'TikTok Shop', date: '09/08/2026', time: '07:31', value: 4200000, commission: 126000, cashback: 98000, status: 'CONFIRMED', linkUrl: 'https://shop.tiktok.com/product/2389', shippingStage: 2 },
  { id: 'ORD-2364', product: 'Sữa rửa mặt chuyên dụng', platform: 'Lazada', date: '04/08/2026', time: '07:30', value: 520000, commission: 31200, cashback: 15600, status: 'REFUNDED', linkUrl: 'https://lazada.vn/product/2364', shippingStage: 3 },
  { id: 'ORD-2332', product: 'Bàn phím cơ', platform: 'Shopee', date: '31/07/2026', time: '07:30', value: 2100000, commission: 63000, cashback: 48000, status: 'CANCELLED', linkUrl: 'https://shopee.vn/product/2332', shippingStage: 3 },
];

export const mockCashbackRows = [
  { id: 'CB-1102', platform: 'Shopee', amount: 93000, status: 'PENDING', date: '12/08/2026', shippingStage: 1 },
  { id: 'CB-1101', platform: 'TikTok Shop', amount: 98000, status: 'AVAILABLE', date: '09/08/2026', shippingStage: 2 },
  { id: 'CB-1099', platform: 'Lazada', amount: 15600, status: 'WITHDRAWN', date: '04/08/2026', shippingStage: 3 },
  { id: 'CB-1098', platform: 'Shopee', amount: 48000, status: 'CONFIRMED', date: '31/07/2026', shippingStage: 3 },
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

export const mockAdminUsers = [
  { id: 'USR-1042', name: 'Nguyen Minh', email: 'minh.nguyen@gmail.com', balance: 890000, totalCashback: 2340000, status: 'ACTIVE', joined: '02/03/2026' },
  { id: 'USR-1039', name: 'Le Thuy Linh', email: 'thuylinh@gmail.com', balance: 156000, totalCashback: 980000, status: 'ACTIVE', joined: '18/02/2026' },
  { id: 'USR-1021', name: 'Tran Bich Ngoc', email: 'bichngoc@demo.vn', balance: 0, totalCashback: 410000, status: 'SUSPENDED', joined: '05/01/2026' },
  { id: 'USR-0998', name: 'Pham Anh Quang', email: 'anhquang@example.com', balance: 320000, totalCashback: 1750000, status: 'LOCKED', joined: '22/11/2025' },
  { id: 'USR-0987', name: 'Do Bao Tran', email: 'bao.tran@example.com', balance: 540000, totalCashback: 620000, status: 'ACTIVE', joined: '11/11/2025' },
];

export const mockWithdrawalRequests = [
  { id: 'WD-3021', user: 'minh.nguyen@gmail.com', amount: 500000, method: 'Bank transfer', requestedAt: '19/08/2026', status: 'PENDING' },
  { id: 'WD-3015', user: 'thuylinh@gmail.com', amount: 150000, method: 'MoMo', requestedAt: '18/08/2026', status: 'PENDING' },
  { id: 'WD-3002', user: 'bao.tran@example.com', amount: 300000, method: 'Bank transfer', requestedAt: '15/08/2026', status: 'APPROVED' },
  { id: 'WD-2988', user: 'bichngoc@demo.vn', amount: 200000, method: 'ZaloPay', requestedAt: '10/08/2026', status: 'REJECTED' },
];

export const mockAdminLogs = [
  { id: 'LOG-9021', actor: 'admin@cashback.vn', action: 'Approved withdrawal WD-3002', time: '15/08/2026 14:22' },
  { id: 'LOG-9018', actor: 'admin@cashback.vn', action: 'Locked user USR-0998 (fraud signal)', time: '14/08/2026 09:05' },
  { id: 'LOG-9010', actor: 'system', action: 'Auto-confirmed commission CB-1098', time: '12/08/2026 22:41' },
  { id: 'LOG-9004', actor: 'admin@cashback.vn', action: 'Updated coupon SHOPEE10 expiry', time: '10/08/2026 11:18' },
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

export const mockSocialVouchers = [
  { platform: 'Facebook', title: 'Creator coupon', code: 'FBVOUCHER30', discount: 'Giảm ₫30K', condition: 'Đơn từ ₫150K', source: 'Partner feed', expiry: '30/08/2026', status: 'Valid', usedPercent: 34 },
  { platform: 'Instagram', title: 'Beauty picks', code: 'IGBEAUTY10', discount: 'Giảm 10%', condition: 'Đơn từ ₫200K', source: 'Story code', expiry: '28/08/2026', status: 'Valid', usedPercent: 58 },
  { platform: 'TikTok', title: 'Shop campaign', code: 'TIKTOK50K', discount: 'Giảm ₫50K', condition: 'Đơn từ ₫300K', source: 'Live session', expiry: '24/08/2026', status: 'Limited', usedPercent: 78 },
  { platform: 'YouTube', title: 'Product review code', code: 'YTREVIEW15', discount: 'Giảm 15%', condition: 'Đơn từ ₫250K', source: 'Verified creator', expiry: '29/08/2026', status: 'Valid', usedPercent: 12 },
];

export const mockCashbackStates = [
  'PENDING',
  'CONFIRMED',
  'AVAILABLE',
  'WITHDRAWN',
  'CANCELLED',
  'REFUNDED',
  'REJECTED',
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

export const mockWithdrawalHistory = [
  { id: 'W6A8AE3E5BD3CF', amount: 43810, bank: 'Ngân hàng MBBANK', accountNumber: '11131102001', accountHolder: 'TRUONG TAN PHUONG', status: 'DONE', createdAt: '23/08/2026 19:13', updatedAt: '24/08/2026 13:53' },
  { id: 'W6A7AC1D36607A', amount: 43752, bank: 'Ngân hàng MBBANK', accountNumber: '11131102001', accountHolder: 'TRUONG TAN PHUONG', status: 'DONE', createdAt: '11/08/2026 13:31', updatedAt: '12/08/2026 09:02' },
  { id: 'W6B1FE2A9931D2', amount: 20000, bank: 'MoMo', accountNumber: '0987654321', accountHolder: 'TRUONG TAN PHUONG', status: 'PENDING', createdAt: '24/08/2026 20:40', updatedAt: '24/08/2026 20:40' },
  { id: 'W6A5DD8B7712E9', amount: 60000, bank: 'Ngân hàng Vietcombank', accountNumber: '0071002345678', accountHolder: 'TRUONG TAN PHUONG', status: 'CANCELLED', updatedAt: '06/08/2026 10:15', createdAt: '05/08/2026 08:20' },
];

export const bankDirectory = [
  'Vietcombank',
  'Techcombank',
  'BIDV',
  'VietinBank',
  'MB Bank (Quân đội)',
  'ACB',
  'VPBank',
  'Sacombank',
  'TPBank',
  'Agribank',
  'HDBank',
  'VIB',
  'SHB',
  'SeABank',
  'MSB',
  'OCB',
  'Eximbank',
  'MoMo (Ví điện tử)',
  'ZaloPay (Ví điện tử)',
  'ShopeePay (Ví điện tử)',
];

export const mockBankList = [
  'Vietcombank', 'Techcombank', 'MBBank', 'BIDV', 'VietinBank', 'ACB',
  'VPBank', 'Sacombank', 'TPBank', 'HDBank', 'SHB', 'VIB', 'Agribank',
  'SeABank', 'MSB', 'OCB', 'Eximbank', 'MoMo', 'ZaloPay', 'ViettelPay',
];

export const mockLinkedBankAccounts = [
  { id: 'BANK-1', bank: 'MBBank', accountNumber: '11131102001', accountHolder: 'TRUONG TAN PHUONG' },
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

export const mockBalanceLedger = [
  { id: 'AFF_1752', content: 'Hoa hồng cashback TikTok #58564095988...', type: 'AFFILIATE', before: 2859, change: 224, after: 3083, time: '26/08/2026 09:12' },
  { id: 'AFF_1747', content: 'Hoa hồng cashback TikTok #58563752003...', type: 'AFFILIATE', before: 1588, change: 1271, after: 2859, time: '25/08/2026 14:05' },
  { id: 'AFF_1753', content: 'Hoa hồng cashback TikTok #58564094612...', type: 'AFFILIATE', before: 1, change: 1588, after: 1588, time: '24/08/2026 20:31' },
  { id: 'W6A8AE3E5BD3CF', content: 'Rút tiền quỹ #W6A8AE3E5BD3CF', type: 'WITHDRAW', before: 43811, change: -43810, after: 1, time: '23/08/2026 19:13' },
  { id: 'CB6A8A3120661BC', content: 'Hoàn tiền đơn mua hàng Shopee - Đơn #2608...', type: 'CASHBACK', before: 24693, change: 19118, after: 43811, time: '23/08/2026 06:30' },
  { id: 'AFF_1625', content: 'Hoa hồng cashback Shopee #260816G5G8DS...', type: 'AFFILIATE', before: 24079, change: 314, after: 24393, time: '22/08/2026 07:01' },
  { id: 'AFF_945', content: 'Hoa hồng cashback TikTok #58535179433...', type: 'AFFILIATE', before: 23729, change: 350, after: 24079, time: '21/08/2026 09:30' },
  { id: 'AFF_1663', content: 'Hoa hồng cashback TikTok #58560385357...', type: 'AFFILIATE', before: 22141, change: 1588, after: 23729, time: '21/08/2026 08:30' },
];

export const balanceLedgerTypeKeyMap: Record<string, string> = {
  AFFILIATE: 'ledger_type_affiliate',
  WITHDRAW: 'ledger_type_withdraw',
  CASHBACK: 'ledger_type_cashback',
};
