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
