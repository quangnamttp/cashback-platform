'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'vi' | 'en' | 'zh';

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh', label: '中文', short: '中文' },
];

const dict = {
  vi: {
    nav_home: 'Trang chủ',
    nav_stores: 'Cửa hàng',
    nav_coupons: 'Coupon',
    nav_deals: 'Deals',
    header_language: 'Ngôn ngữ',
    header_notifications: 'Thông báo',
    header_account: 'Tài khoản',
    header_login: 'Đăng nhập',

    sidebar_home: 'Trang chủ',
    sidebar_stores: 'Cửa hàng',
    sidebar_coupons: 'Coupon',
    sidebar_deals: 'Deals',
    sidebar_get_link: 'Nhận hoàn tiền',
    sidebar_wallet: 'Ví tiền',
    sidebar_orders: 'Đơn hàng',
    sidebar_order_status: 'Trạng thái đơn hàng',
    sidebar_my_vouchers: 'Voucher của tôi',
    sidebar_social_vouchers: 'Voucher MXH',
    sidebar_referrals: 'Giới thiệu bạn bè',
    sidebar_withdraw_history: 'Lịch sử rút tiền',
    sidebar_support: 'Hỗ trợ',
    sidebar_settings: 'Cài đặt',

    panel_balance_title: 'Số dư khả dụng',
    panel_balance_login_hint: 'Đăng nhập để xem số dư',
    panel_wallet_btn: 'Ví tiền',
    panel_withdraw_btn: 'Rút tiền',
    panel_quick_stats: 'Thống kê nhanh',
    panel_saved: 'Đã tiết kiệm',
    panel_pending: 'Chờ xác nhận',
    panel_received: 'Đã nhận',
    panel_orders: 'Đơn hàng',
    panel_referral_title: 'Giới thiệu bạn bè',
    panel_referral_desc: 'Chia sẻ link giới thiệu và nhận thưởng khi bạn bè tham gia.',
    panel_referral_btn: 'Xem ngay',
    panel_support_title: 'Hỗ trợ nhanh',
    panel_faq: 'Câu hỏi thường gặp',
    panel_guide: 'Hướng dẫn nhận hoàn tiền',
    panel_contact: 'Liên hệ hỗ trợ',

    hero_title: 'Mua sắm thông minh',
    hero_highlight: 'Nhận hoàn tiền dễ dàng',
    hero_desc: 'Dán link sản phẩm từ Shopee, Lazada hoặc TikTok Shop để tạo link nhận hoàn tiền và bắt đầu mua sắm.',
    hero_placeholder: 'Dán link sản phẩm tại đây...',
    hero_cta: 'Nhận hoàn tiền',

    stores_title: 'Cửa hàng phổ biến',
    stores_cta: 'Mua ngay',
    stores_cashback_upto: 'Hoàn tiền đến',

    offers_title: 'Ưu đãi nổi bật',
    offer_get_code: 'Lấy mã',
    offer_min_order: 'Đơn từ',
    offer_expiry: 'HSD',

    account_profile: 'Thông tin tài khoản',
    account_sign_out: 'Đăng xuất',

    mock_notice: 'Dữ liệu minh họa (mock)',

    wallet_eyebrow: 'Ví hoàn tiền',
    wallet_title: 'Số dư và rút tiền',
    wallet_available: 'Khả dụng',
    wallet_pending: 'Chờ xác nhận',
    wallet_withdrawn: 'Đã rút',
    wallet_rejected: 'Bị từ chối',

    tbl_id: 'Mã',
    tbl_platform: 'Nền tảng',
    tbl_amount: 'Số tiền',
    tbl_status: 'Trạng thái',
    tbl_date: 'Ngày',
    tbl_product: 'Sản phẩm',
    tbl_order: 'Đơn hàng',
    tbl_cashback: 'Hoàn tiền',
    tbl_commission: 'Hoa hồng',
    tbl_value: 'Giá trị',
    tbl_user: 'Người dùng',
    tbl_purchase: 'Đơn mua',
    tbl_reward: 'Thưởng',

    status_available: 'Khả dụng',
    status_pending: 'Chờ xác nhận',
    status_confirmed: 'Đã xác nhận',
    status_rejected: 'Bị từ chối',
    status_withdrawn: 'Đã rút',

    dashboard_eyebrow: 'Tổng quan',
    dashboard_title: 'Dashboard người dùng',
    dashboard_view_orders: 'Xem đơn hàng',
    dashboard_recent_orders: 'Đơn hàng gần đây',
    dashboard_view_all: 'Xem tất cả',
    dashboard_upcoming_cashback: 'Cashback sắp tới',
    dashboard_details: 'Chi tiết',

    orders_eyebrow: 'Đơn hàng',
    orders_title: 'Lịch sử đơn hàng',

    cashback_eyebrow: 'Cashback',
    cashback_title: 'Quản lý cashback',

    deals_eyebrow: 'Deals / Flash Sale',
    deals_title: 'Ưu đãi có thời hạn',

    referrals_eyebrow: 'Giới thiệu bạn bè',
    referrals_title: 'Theo dõi giới thiệu',
    referral_code_label: 'Mã giới thiệu',
    referred_users: 'Người đã giới thiệu',
    eligible_purchases: 'Đơn hợp lệ',
    referral_rewards: 'Thưởng giới thiệu',
    referral_activity: 'Hoạt động giới thiệu',
    only_confirmed: 'Chỉ tính thưởng đã xác nhận',

    account_eyebrow: 'Tài khoản',
    account_title: 'Hồ sơ & đăng nhập',
    google_login_title: 'Đăng nhập Google',
    google_login_desc: 'Tiếp tục với Google để truy cập ví hoàn tiền và hoạt động giới thiệu của bạn.',
    continue_google: 'Tiếp tục với Google',
    user_profile: 'Hồ sơ người dùng',
    field_name: 'Họ tên',
    field_email: 'Email',
    field_referral_code: 'Mã giới thiệu',
    field_account_status: 'Trạng thái tài khoản',
    active_status: 'Đang hoạt động',
    referral_foundation: 'Nền tảng giới thiệu',
    referral_foundation_desc: 'Mỗi người dùng có một link/mã giới thiệu riêng. Thưởng chỉ được thanh toán sau khi đơn hàng được giới thiệu hoàn tất và hoa hồng/giao dịch liên quan đã được xác nhận.',
    view_referrals: 'Xem giới thiệu',

    get_link_eyebrow: 'Nhận link hoàn tiền',
    get_link_title: 'Dán link sản phẩm',
    back_home: 'Về trang chủ',
    paste_label: 'Dán link sản phẩm Shopee / TikTok Shop / Lazada của bạn',
    get_link_btn: 'NHẬN LINK HOÀN TIỀN',
    how_it_works: 'Quy trình xử lý link',
    step1: 'Nhận diện sàn thương mại từ đường link.',
    step2: 'Kiểm tra và chuẩn hoá link.',
    step3: 'Tạo luồng affiliate/deep-link phù hợp với sàn.',
    step4: 'Theo dõi hoa hồng và hoàn tiền sau khi mua hàng và được xác nhận.',
    important_rule: 'Lưu ý quan trọng',
    important_rule_desc: 'Hoàn tiền không bao giờ được xem là chắc chắn trước khi hoa hồng được xác nhận. Hoa hồng đang chờ sẽ giữ trạng thái chờ cho đến khi được xác nhận rõ ràng bởi đơn hàng hoặc quy trình của nền tảng.',

    footer_desc: 'Theo dõi hoa hồng, hoàn tiền và trạng thái đơn hàng với luồng chuẩn hóa, sẵn sàng mở rộng cho nhiều sàn.',
    footer_explore: 'Khám phá',
    footer_how_it_works: 'Cách hoạt động',
    footer_supported_platforms: 'Sàn hỗ trợ',
    footer_support: 'Hỗ trợ',
    footer_contact: 'Liên hệ',
    footer_policy: 'Chính sách',
    mbn_more: 'Thêm',
  },
  en: {
    nav_home: 'Home',
    nav_stores: 'Stores',
    nav_coupons: 'Coupons',
    nav_deals: 'Deals',
    header_language: 'Language',
    header_notifications: 'Notifications',
    header_account: 'Account',
    header_login: 'Sign in',

    sidebar_home: 'Home',
    sidebar_stores: 'Stores',
    sidebar_coupons: 'Coupons',
    sidebar_deals: 'Deals',
    sidebar_get_link: 'Get cashback link',
    sidebar_wallet: 'Wallet',
    sidebar_orders: 'Orders',
    sidebar_order_status: 'Order status',
    sidebar_my_vouchers: 'My vouchers',
    sidebar_social_vouchers: 'Social vouchers',
    sidebar_referrals: 'Refer friends',
    sidebar_withdraw_history: 'Withdrawal history',
    sidebar_support: 'Support',
    sidebar_settings: 'Settings',

    panel_balance_title: 'Available balance',
    panel_balance_login_hint: 'Sign in to see your balance',
    panel_wallet_btn: 'Wallet',
    panel_withdraw_btn: 'Withdraw',
    panel_quick_stats: 'Quick stats',
    panel_saved: 'Saved',
    panel_pending: 'Pending',
    panel_received: 'Received',
    panel_orders: 'Orders',
    panel_referral_title: 'Refer friends',
    panel_referral_desc: 'Share your referral link and earn rewards when friends join.',
    panel_referral_btn: 'View now',
    panel_support_title: 'Quick support',
    panel_faq: 'FAQ',
    panel_guide: 'How to get cashback',
    panel_contact: 'Contact support',

    hero_title: 'Shop smarter',
    hero_highlight: 'Get cashback easily',
    hero_desc: 'Paste a product link from Shopee, Lazada, or TikTok Shop to create a cashback link and start shopping.',
    hero_placeholder: 'Paste your product link here...',
    hero_cta: 'Get cashback',

    stores_title: 'Popular stores',
    stores_cta: 'Shop now',
    stores_cashback_upto: 'Cashback up to',

    offers_title: 'Featured offers',
    offer_get_code: 'Get code',
    offer_min_order: 'Min. order',
    offer_expiry: 'Expires',

    account_profile: 'Account info',
    account_sign_out: 'Sign out',

    mock_notice: 'Sample (mock) data',

    wallet_eyebrow: 'Cashback Wallet',
    wallet_title: 'Balance and withdrawals',
    wallet_available: 'Available',
    wallet_pending: 'Pending',
    wallet_withdrawn: 'Withdrawn',
    wallet_rejected: 'Rejected',

    tbl_id: 'ID',
    tbl_platform: 'Platform',
    tbl_amount: 'Amount',
    tbl_status: 'Status',
    tbl_date: 'Date',
    tbl_product: 'Product',
    tbl_order: 'Order',
    tbl_cashback: 'Cashback',
    tbl_commission: 'Commission',
    tbl_value: 'Value',
    tbl_user: 'User',
    tbl_purchase: 'Purchase',
    tbl_reward: 'Reward',

    status_available: 'Available',
    status_pending: 'Pending',
    status_confirmed: 'Confirmed',
    status_rejected: 'Rejected',
    status_withdrawn: 'Withdrawn',

    dashboard_eyebrow: 'Overview',
    dashboard_title: 'User dashboard',
    dashboard_view_orders: 'View orders',
    dashboard_recent_orders: 'Recent orders',
    dashboard_view_all: 'View all',
    dashboard_upcoming_cashback: 'Upcoming cashback',
    dashboard_details: 'Details',

    orders_eyebrow: 'Orders',
    orders_title: 'Order history',

    cashback_eyebrow: 'Cashback',
    cashback_title: 'Cashback management',

    deals_eyebrow: 'Deals / Flash Sale',
    deals_title: 'Time-based shopping deals',

    referrals_eyebrow: 'Refer friends',
    referrals_title: 'Referral tracking',
    referral_code_label: 'Referral code',
    referred_users: 'Referred users',
    eligible_purchases: 'Eligible purchases',
    referral_rewards: 'Referral rewards',
    referral_activity: 'Referral activity',
    only_confirmed: 'Only confirmed rewards',

    account_eyebrow: 'Account',
    account_title: 'Profile & login',
    google_login_title: 'Google login',
    google_login_desc: 'Continue with Google to access your cashback wallet and referral activity.',
    continue_google: 'Continue with Google',
    user_profile: 'User profile',
    field_name: 'Name',
    field_email: 'Email',
    field_referral_code: 'Referral code',
    field_account_status: 'Account status',
    active_status: 'Active',
    referral_foundation: 'Referral foundation',
    referral_foundation_desc: 'Every user has a unique referral link/code. Rewards are only payable after the referred purchase is complete and the related transaction/commission is confirmed.',
    view_referrals: 'View referrals',

    get_link_eyebrow: 'Get Cashback Link',
    get_link_title: 'Paste a product link',
    back_home: 'Back home',
    paste_label: 'Paste your Shopee / TikTok Shop / Lazada product link',
    get_link_btn: 'GET CASHBACK LINK',
    how_it_works: 'How the flow works',
    step1: 'Detect the marketplace from the URL.',
    step2: 'Validate the link and normalize it.',
    step3: 'Prepare an affiliate or deep-link flow for the platform.',
    step4: 'Track commission and cashback after purchase and confirmation.',
    important_rule: 'Important rule',
    important_rule_desc: 'Cashback is never treated as guaranteed before commission confirmation. Pending commission remains pending until explicitly confirmed by the related order or platform process.',

    footer_desc: 'Track commission, cashback and order status with a standardized, adapter-ready flow across marketplaces.',
    footer_explore: 'Explore',
    footer_how_it_works: 'How it works',
    footer_supported_platforms: 'Supported platforms',
    footer_support: 'Support',
    footer_contact: 'Contact',
    footer_policy: 'Policy',
    mbn_more: 'More',
  },
  zh: {
    nav_home: '首页',
    nav_stores: '商店',
    nav_coupons: '优惠券',
    nav_deals: '促销',
    header_language: '语言',
    header_notifications: '通知',
    header_account: '账户',
    header_login: '登录',

    sidebar_home: '首页',
    sidebar_stores: '商店',
    sidebar_coupons: '优惠券',
    sidebar_deals: '促销',
    sidebar_get_link: '获取返现链接',
    sidebar_wallet: '钱包',
    sidebar_orders: '订单',
    sidebar_order_status: '订单状态',
    sidebar_my_vouchers: '我的优惠券',
    sidebar_social_vouchers: '社媒优惠券',
    sidebar_referrals: '邀请好友',
    sidebar_withdraw_history: '提现记录',
    sidebar_support: '帮助',
    sidebar_settings: '设置',

    panel_balance_title: '可用余额',
    panel_balance_login_hint: '登录以查看余额',
    panel_wallet_btn: '钱包',
    panel_withdraw_btn: '提现',
    panel_quick_stats: '快速统计',
    panel_saved: '已节省',
    panel_pending: '待确认',
    panel_received: '已收到',
    panel_orders: '订单',
    panel_referral_title: '邀请好友',
    panel_referral_desc: '分享邀请链接，好友加入即可获得奖励。',
    panel_referral_btn: '立即查看',
    panel_support_title: '快速帮助',
    panel_faq: '常见问题',
    panel_guide: '返现指南',
    panel_contact: '联系客服',

    hero_title: '智能购物',
    hero_highlight: '轻松获得返现',
    hero_desc: '粘贴 Shopee、Lazada 或 TikTok Shop 的商品链接，生成返现链接并开始购物。',
    hero_placeholder: '在此粘贴商品链接...',
    hero_cta: '获取返现',

    stores_title: '热门商店',
    stores_cta: '立即购买',
    stores_cashback_upto: '最高返现',

    offers_title: '精选优惠',
    offer_get_code: '领取优惠码',
    offer_min_order: '最低订单',
    offer_expiry: '有效期至',

    account_profile: '账户信息',
    account_sign_out: '退出登录',

    mock_notice: '示例（模拟）数据',

    wallet_eyebrow: '返现钱包',
    wallet_title: '余额与提现',
    wallet_available: '可用',
    wallet_pending: '待确认',
    wallet_withdrawn: '已提现',
    wallet_rejected: '已拒绝',

    tbl_id: '编号',
    tbl_platform: '平台',
    tbl_amount: '金额',
    tbl_status: '状态',
    tbl_date: '日期',
    tbl_product: '商品',
    tbl_order: '订单',
    tbl_cashback: '返现',
    tbl_commission: '佣金',
    tbl_value: '金额',
    tbl_user: '用户',
    tbl_purchase: '购买',
    tbl_reward: '奖励',

    status_available: '可用',
    status_pending: '待确认',
    status_confirmed: '已确认',
    status_rejected: '已拒绝',
    status_withdrawn: '已提现',

    dashboard_eyebrow: '概览',
    dashboard_title: '用户仪表盘',
    dashboard_view_orders: '查看订单',
    dashboard_recent_orders: '最近订单',
    dashboard_view_all: '查看全部',
    dashboard_upcoming_cashback: '即将到账返现',
    dashboard_details: '详情',

    orders_eyebrow: '订单',
    orders_title: '订单历史',

    cashback_eyebrow: '返现',
    cashback_title: '返现管理',

    deals_eyebrow: '促销 / 限时抢购',
    deals_title: '限时购物优惠',

    referrals_eyebrow: '邀请好友',
    referrals_title: '邀请追踪',
    referral_code_label: '邀请码',
    referred_users: '已邀请用户',
    eligible_purchases: '有效订单',
    referral_rewards: '邀请奖励',
    referral_activity: '邀请动态',
    only_confirmed: '仅统计已确认奖励',

    account_eyebrow: '账户',
    account_title: '资料与登录',
    google_login_title: 'Google 登录',
    google_login_desc: '使用 Google 登录以访问您的返现钱包和邀请动态。',
    continue_google: '使用 Google 继续',
    user_profile: '用户资料',
    field_name: '姓名',
    field_email: '邮箱',
    field_referral_code: '邀请码',
    field_account_status: '账户状态',
    active_status: '正常',
    referral_foundation: '邀请机制说明',
    referral_foundation_desc: '每位用户都有专属的邀请链接/邀请码。只有在被邀请用户完成购买且相关交易/佣金被确认后，奖励才可发放。',
    view_referrals: '查看邀请',

    get_link_eyebrow: '获取返现链接',
    get_link_title: '粘贴商品链接',
    back_home: '返回首页',
    paste_label: '粘贴您的 Shopee / TikTok Shop / Lazada 商品链接',
    get_link_btn: '获取返现链接',
    how_it_works: '处理流程说明',
    step1: '从链接中识别所属电商平台。',
    step2: '校验并规范化链接。',
    step3: '为该平台生成对应的联盟/深度链接流程。',
    step4: '在购买并确认后追踪佣金与返现。',
    important_rule: '重要说明',
    important_rule_desc: '在佣金确认之前，返现绝不视为已保证到账。待确认佣金将保持待确认状态，直到相关订单或平台流程明确确认为止。',

    footer_desc: '通过标准化、可扩展的流程，追踪多个平台的佣金、返现与订单状态。',
    footer_explore: '探索',
    footer_how_it_works: '使用说明',
    footer_supported_platforms: '支持的平台',
    footer_support: '帮助',
    footer_contact: '联系我们',
    footer_policy: '政策',
    mbn_more: '更多',
  },
} as const;

export type DictKey = keyof (typeof dict)['vi'];

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'cb_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('vi');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored && (stored === 'vi' || stored === 'en' || stored === 'zh')) {
        setLangState(stored);
      }
    } catch {
      // ignore storage access issues
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage access issues
    }
  }, []);

  const t = useCallback((key: DictKey) => dict[lang][key] ?? dict.vi[key], [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
