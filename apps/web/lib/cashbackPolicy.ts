'use client';

/**
 * The single place a "customer's share of a commission" is ever computed
 * for the PRE-PURCHASE ESTIMATE shown on get-cashback-link (no component
 * ever multiplies by a rate itself — see computeEstimatedCashback below,
 * the only function that does this math for the estimate). Its ACTUAL,
 * post-purchase counterpart is Financial Core's computeCommissionSplit
 * (lib/orderEntry.ts), used for the real ledger/wallet/admin-payout path.
 *
 * These are deliberately two separate functions, not one shared call —
 * but NOT two separate sources of truth: CASHBACK_POLICY below is sourced
 * directly from COMMISSION_SPLIT.CUSTOMER_NO_REFERRER (imported, never a
 * second hardcoded number), so today's rate is byte-for-byte the same
 * constant Financial Core uses. The separation exists so that a future
 * change to this ESTIMATE layer (e.g. a UI experiment, a per-platform
 * preview tweak) can never alter what computeCommissionSplit computes for
 * a real ledger entry — modifying computeCommissionSplit itself is the
 * only way to change a real payout, and nothing in this file can do that.
 * If this module ever needs its own independently-tunable rate (the
 * per-platform Record shape below already supports that), it still must
 * never be wired back into orderEntry.ts's write path.
 */
import { COMMISSION_SPLIT } from './orderEntry';
import type { Platform } from './redirectLink';

export const CASHBACK_POLICY: Record<Platform, number> = {
  SHOPEE: COMMISSION_SPLIT.CUSTOMER_NO_REFERRER,
  LAZADA: COMMISSION_SPLIT.CUSTOMER_NO_REFERRER,
  TIKTOK_SHOP: COMMISSION_SPLIT.CUSTOMER_NO_REFERRER,
};

/**
 * Where the PRICE half of an estimate came from. ACCESSTRADE_DIRECT is
 * TikTok Shop's case — ACCESSTRADE's own API hands back a ready
 * commission AMOUNT for the exact product, no separate price × rate step
 * needed. ACCESSTRADE_DATAFEED is Shopee/Lazada's counterpart — a real
 * ACCESSTRADE-sourced product price (workers/accesstrade-sync's
 * lookupDatafeedPrice, computed server-side) combined with a campaign
 * rate. SCRAPED_PREVIEW is the product page's own independently-scraped
 * price (lib/productPreview.ts), used only when the datafeed doesn't have
 * that product.
 */
export type PriceSource = 'ACCESSTRADE_DIRECT' | 'ACCESSTRADE_DATAFEED' | 'SCRAPED_PREVIEW';

/**
 * Where the COMMISSION half came from — ACCESSTRADE_PRODUCT_COMMISSION is
 * a real per-product figure ACCESSTRADE's own API returned directly
 * (TikTok Shop's v2 create-link response); ACCESSTRADE_CAMPAIGN_POLICY is
 * a campaign-wide rate text-mined from /v1/campaigns' real policy
 * description (Shopee/Lazada — see workers/accesstrade-sync's
 * fetchCampaignCommissionRate) — real data either way, never guessed, but
 * the campaign-wide one is a default/modal rate, not a per-product exact
 * one (see that function's own comment for what it actually represents).
 * ACCESSTRADE_CASHBACK_CAMPAIGNS is a real category-specific rate from
 * GET /v1/cashback/campaigns (see workers/accesstrade-sync's
 * resolveCommission/fetchCashbackCampaignCommission) — the most precise
 * tier when available, but this ACCESSTRADE account currently has no
 * access to that endpoint (confirmed 401), so this value is defined for
 * forward-compatibility and does not appear in a real response today.
 */
export type CommissionSource =
  | 'ACCESSTRADE_PRODUCT_COMMISSION'
  | 'ACCESSTRADE_CAMPAIGN_POLICY'
  | 'ACCESSTRADE_CASHBACK_CAMPAIGNS';

/**
 * Always ESTIMATED here — this module has no path that ever produces
 * 'EXACT'. The real, authoritative commission is only known once
 * ACCESSTRADE confirms a real order; if it differs from this estimate,
 * the real (actual) figure is always what the ledger/wallet uses — this
 * estimate is discarded, never reconciled against or corrected toward.
 */
export type EstimationType = 'ESTIMATED';

/**
 * HIGH: both price and commission are real, product-specific-or-better
 * ACCESSTRADE data (real datafeed price × real rate, or TikTok's own
 * per-product commission field). MEDIUM: the commission rate is real but
 * campaign-wide (not product-specific) and/or the price came from best-
 * effort page scraping rather than ACCESSTRADE's own data.
 */
export type EstimationConfidence = 'HIGH' | 'MEDIUM';

export type EstimatedCashbackResult = {
  amount: number;
  priceSource: PriceSource;
  commissionSource: CommissionSource;
  estimationType: EstimationType;
  confidence: EstimationConfidence;
};

/**
 * Pure calculation — never writes anywhere, never called from any
 * order/ledger/wallet code path. commissionAmount is the platform's real,
 * undivided commission (already resolved by the caller from one of the
 * two CommissionSource tiers); this only applies the customer's policy
 * split on top of it.
 */
export function computeEstimatedCashback(
  platform: Platform,
  commissionAmount: number,
  meta: { priceSource: PriceSource; commissionSource: CommissionSource; confidence: EstimationConfidence },
): EstimatedCashbackResult {
  const rate = CASHBACK_POLICY[platform];
  return {
    amount: Math.round(Math.max(0, commissionAmount) * rate),
    estimationType: 'ESTIMATED',
    ...meta,
  };
}
