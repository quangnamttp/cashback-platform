'use client';

/**
 * The PRE-PURCHASE ESTIMATE's counterpart to Financial Core's
 * computeCommissionSplit (lib/orderEntry.ts) — deliberately a SEPARATE
 * module, never imported by orderEntry.ts or anything under the real
 * ledger/wallet/withdrawal write path, so a future change here (e.g.
 * "Shopee 80% → 75%") can never alter a real payout by accident.
 *
 * Today every platform mirrors COMMISSION_SPLIT.CUSTOMER_NO_REFERRER
 * (80%) — same number, same source constant — so this refactor changes
 * no behavior on its own. The point is the SHAPE: a plain per-platform
 * config object, so changing one platform's split later is a one-line
 * edit here, not a UI-component change and not a Financial Core change.
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
 */
export type CommissionSource = 'ACCESSTRADE_PRODUCT_COMMISSION' | 'ACCESSTRADE_CAMPAIGN_POLICY';

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
