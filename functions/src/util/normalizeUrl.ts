export type Platform = 'SHOPEE' | 'TIKTOK_SHOP' | 'LAZADA';

const PLATFORM_PATTERNS: { platform: Platform; pattern: RegExp }[] = [
  { platform: 'SHOPEE', pattern: /shopee\.(vn|com)/i },
  { platform: 'TIKTOK_SHOP', pattern: /(tiktok\.com\/.*shop|vt\.tiktok\.com|shop\.tiktok\.com)/i },
  { platform: 'LAZADA', pattern: /lazada\.(vn|com)/i },
];

export function detectPlatform(rawUrl: string): Platform | null {
  const found = PLATFORM_PATTERNS.find((p) => p.pattern.test(rawUrl));
  return found ? found.platform : null;
}

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'spm', 'ref', 'sp_atk', 'xptdk',
];

/** Strips tracking params so repeated views of the same product resolve to the same cache key. */
export function normalizeProductUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    url.hash = '';
    url.searchParams.sort();
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return rawUrl.trim();
  }
}

const AFFILIATE_TAG_PARAM: Record<Platform, string> = {
  SHOPEE: 'af_sub_id',
  TIKTOK_SHOP: 'sub_id',
  LAZADA: 'aff_sub',
};

export function buildAffiliateUrl(platform: Platform, normalizedUrl: string, trackingCode: string): string {
  try {
    const url = new URL(normalizedUrl);
    url.searchParams.set(AFFILIATE_TAG_PARAM[platform], trackingCode);
    url.searchParams.set('utm_source', 'hoantiendv');
    url.searchParams.set('utm_medium', 'cashback');
    return url.toString();
  } catch {
    return normalizedUrl;
  }
}
