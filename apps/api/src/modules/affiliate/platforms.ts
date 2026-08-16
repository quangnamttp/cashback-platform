import type {
  AffiliateLinkResult,
  AffiliatePlatformCode,
  ParsedProductLink,
  PlatformStatus,
  CashbackSnapshot,
  CommissionSnapshot,
} from './types';

export interface AffiliateAdapter {
  code: AffiliatePlatformCode;
  detectPlatform(url: string): boolean;
  validateUrl(url: string): boolean;
  normalizeUrl(url: string): string;
  generateAffiliateUrl(url: string): string;
  getOrderStatus(): PlatformStatus;
  getCommission(): CommissionSnapshot;
  getAvailableCashback(): CashbackSnapshot;
}

abstract class BaseAffiliateAdapter implements AffiliateAdapter {
  abstract code: AffiliatePlatformCode;

  detectPlatform(url: string): boolean {
    const value = url.toLowerCase();
    return value.includes(this.code === 'shopee'
      ? 'shopee'
      : this.code === 'tiktok-shop'
        ? 'tiktok'
        : 'lazada');
  }

  validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  normalizeUrl(url: string): string {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  }

  generateAffiliateUrl(url: string): string {
    const normalized = this.normalizeUrl(url);
    const params = new URLSearchParams({
      utm_source: 'cashback-platform',
      utm_medium: 'affiliate',
      utm_campaign: this.code,
      ref: 'cashback-platform',
    });
    const parsed = new URL(normalized);
    parsed.search = params.toString();
    return parsed.toString();
  }

  getOrderStatus(): PlatformStatus {
    return 'PENDING';
  }

  getCommission(): CommissionSnapshot {
    return {
      amount: 0,
      currency: 'VND',
      rate: 0,
      status: 'PENDING',
    };
  }

  getAvailableCashback(): CashbackSnapshot {
    return {
      amount: 0,
      currency: 'VND',
      rate: 0,
      status: 'PENDING',
    };
  }
}

export class ShopeeAdapter extends BaseAffiliateAdapter {
  code: AffiliatePlatformCode = 'shopee';
}

export class TikTokShopAdapter extends BaseAffiliateAdapter {
  code: AffiliatePlatformCode = 'tiktok-shop';
}

export class LazadaAdapter extends BaseAffiliateAdapter {
  code: AffiliatePlatformCode = 'lazada';
}

export function detectPlatform(url: string): ParsedProductLink {
  const safe = url.trim();

  if (!safe) {
    return {
      platform: 'shopee',
      normalizedUrl: '',
      isValid: false,
      reason: 'URL is empty',
    };
  }

  const lowercase = safe.toLowerCase();
  if (lowercase.includes('shopee')) {
    return {
      platform: 'shopee',
      normalizedUrl: new URL(safe).toString(),
      isValid: true,
      productIdentifier: 'shopee-product',
      sourceHost: 'shopee.vn',
    };
  }

  if (lowercase.includes('tiktok')) {
    return {
      platform: 'tiktok-shop',
      normalizedUrl: new URL(safe).toString(),
      isValid: true,
      productIdentifier: 'tiktok-product',
      sourceHost: 'tiktok.com',
    };
  }

  if (lowercase.includes('lazada')) {
    return {
      platform: 'lazada',
      normalizedUrl: new URL(safe).toString(),
      isValid: true,
      productIdentifier: 'lazada-product',
      sourceHost: 'lazada.vn',
    };
  }

  return {
    platform: 'shopee',
    normalizedUrl: safe,
    isValid: false,
    reason: 'Unsupported marketplace URL',
  };
}

export function createAffiliateLinkResult(url: string): AffiliateLinkResult {
  const parsed = detectPlatform(url);
  const adapterMap: Record<AffiliatePlatformCode, BaseAffiliateAdapter> = {
    shopee: new ShopeeAdapter(),
    'tiktok-shop': new TikTokShopAdapter(),
    lazada: new LazadaAdapter(),
  };

  const adapter = adapterMap[parsed.platform];
  const trackingUrl = adapter.generateAffiliateUrl(url);

  return {
    platform: parsed.platform,
    originalUrl: url,
    normalizedUrl: parsed.normalizedUrl,
    trackingUrl,
    productIdentifier: parsed.productIdentifier,
    isValid: parsed.isValid,
  };
}
