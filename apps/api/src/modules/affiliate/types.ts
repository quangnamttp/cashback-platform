export type AffiliatePlatformCode = 'shopee' | 'tiktok-shop' | 'lazada';

export type PlatformStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';

export type CashbackStatus = 'PENDING' | 'ELIGIBLE' | 'REJECTED' | 'PAID';

export interface ParsedProductLink {
  platform: AffiliatePlatformCode;
  normalizedUrl: string;
  isValid: boolean;
  productIdentifier?: string;
  sourceHost?: string;
  reason?: string;
}

export interface AffiliateLinkResult {
  platform: AffiliatePlatformCode;
  originalUrl: string;
  normalizedUrl: string;
  trackingUrl: string;
  productIdentifier?: string;
  isValid: boolean;
}

export interface CommissionSnapshot {
  amount: number;
  currency: string;
  rate: number;
  status: PlatformStatus;
}

export interface CashbackSnapshot {
  amount: number;
  currency: string;
  rate: number;
  status: CashbackStatus;
}
