'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { mockPlatforms } from '../../lib/mock-data';
import { createOrReuseRedirect, detectPlatform, ensureUrlScheme, recordRedirectHit, savePreviewToRedirect, voucherMatchesMarketplace, type AffiliateLinkFailureReason, type Platform, type ResolvedProductInfo } from '../../lib/redirectLink';
import { COMMISSION_SPLIT } from '../../lib/orderEntry';
import { computeEstimatedCashback, type CommissionSource } from '../../lib/cashbackPolicy';
import { fetchProductPreview, isShortlink, resolveShortlink, type ProductPreview } from '../../lib/productPreview';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { AppShell } from '../../components/layout/AppShell';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { SocialPlatformIcon } from '../../components/ui/SocialPlatformIcons';
import { VoucherTicket, PLATFORM_ACCENT } from '../../components/ui/VoucherTicket';
import { ReceiptIcon, UsersIcon, LinkIcon } from '../../components/ui/Icons';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { usePageTitle } from '../../lib/use-page-title';

const PLATFORM_LABEL: Record<Platform, string> = {
  SHOPEE: 'Shopee',
  TIKTOK_SHOP: 'TikTok Shop',
  LAZADA: 'Lazada',
};

type CheckResult =
  // Shown the INSTANT a valid platform is detected client-side, before
  // any network call resolves — see handleCheck. Lets the card/loading
  // shell render immediately instead of the customer staring at nothing
  // while the link is created and ProductResolver runs.
  | { status: 'resolving'; platformCode: Platform; platform: string }
  | { status: 'unsupported' }
  | { status: 'invalid_link' }
  | { status: 'error' }
  // No real tracking link — either genuinely no commission (reason ===
  // 'not_in_campaign', the ONLY value that means that — see
  // AffiliateLinkFailureReason's own comment) or a technical failure
  // (anything else). Customer can still buy via fallbackUrl either way,
  // just with different wording — see NO_TRACKING_COPY below. No
  // technical/provider-name terms ever shown to the customer for either.
  | { status: 'no_tracking'; platformCode: Platform; platform: string; reason: AffiliateLinkFailureReason; fallbackUrl: string }
  // Reaching 'supported' now itself means a real tracking link exists —
  // see lib/redirectLink.ts's createOrReuseRedirect, which never returns
  // this status any other way. estimatedCommission is the marketplace's
  // RAW commission (see that field's own comment in lib/redirectLink.ts)
  // — this page runs it through computeEstimatedCashback (lib/
  // cashbackPolicy.ts) before ever showing a number (see the "Dự kiến
  // hoàn" render below), so the customer only ever sees their own split
  // amount, never the raw figure.
  | {
      status: 'supported';
      platformCode: Platform;
      platform: string;
      code: string;
      redirectUrl: string;
      destinationUrl: string;
      cacheHit: boolean;
      estimatedCommission?: { amount: number; currency: string };
      estimatedCommissionPriceSource?: 'ACCESSTRADE_DATAFEED';
      // Shopee/Lazada's counterpart — a rate, not an amount (see that
      // field's own comment in lib/redirectLink.ts). Combined with the
      // product's own independently-scraped real price (productPreview
      // state below) once available — see the productInfo useMemo.
      estimatedCommissionRate?: number;
      // Which resolveCommission() tier produced estimatedCommissionRate/
      // estimatedCommission's rate — see lib/cashbackPolicy.ts's
      // CommissionSource. Read directly here (never re-derived/guessed)
      // for the productInfo useMemo below.
      estimatedCommissionSource?: CommissionSource;
      // Real name/image/price from ACCESSTRADE's own datafeed (Shopee/
      // Lazada) — see ResolvedProductInfo's own comment in
      // lib/redirectLink.ts. Takes priority over the page-scraped preview
      // (productPreview state) wherever both exist.
      product?: ResolvedProductInfo;
      // Shopee-only diagnostic (see lib/redirectLink.ts's own comment) —
      // never read by productInfo's cashback calculation, only kept around
      // so a future debug UI/log could explain a miss without needing a
      // live wrangler tail.
      productLookupReason?: 'product_not_found' | 'url_parse_failed';
    };

// Exactly the 3 customer-facing states this page can show — neutral
// wording only, no ACCESSTRADE/campaign/Sub-ID/API terms. `not_in_campaign`
// is the only reason value that means "genuinely no commission"; every
// other value is a technical failure and gets the retry copy instead —
// see AffiliateLinkFailureReason's own comment in lib/redirectLink.ts.
const NO_TRACKING_COPY = {
  noCommission: { icon: '⚪', text: 'Sản phẩm này hiện không có mức hoàn tiền' },
  technicalError: { icon: '🔄', text: 'Không thể tạo liên kết hoàn tiền lúc này. Vui lòng thử lại.' },
} as const;

type Voucher = {
  id: string;
  platform: string;
  title: string;
  code: string;
  discount: string;
  condition: string;
  expiry: string;
  status: string;
  usedPercent?: number;
  marketplaces?: Platform[];
};

const REFRESH_SLOTS = ['00:00', '09:00', '12:00', '15:00', '18:00', '20:00'];

function getNextSlotInfo() {
  const now = new Date();
  const slotsToday = REFRESH_SLOTS.map((slot) => {
    const [h, m] = slot.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return { slot, date: d };
  });

  let next = slotsToday.find((s) => s.date.getTime() > now.getTime());
  if (!next) {
    const [h, m] = REFRESH_SLOTS[0].split(':').map(Number);
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    next = { slot: REFRESH_SLOTS[0], date: d };
  }

  const diffMs = next.date.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  return { nextSlot: next.slot, hours, minutes };
}

const platformGroups = [
  { key: 'fb-ig', label: 'Facebook & Instagram', platforms: ['Facebook', 'Instagram'] },
  { key: 'yt', label: 'YouTube & TikTok', platforms: ['YouTube', 'TikTok'] },
];

export default function GetCashbackLinkPage() {
  const { t, lang } = useLanguage();
  usePageTitle(t('get_link_title'));
  const { uid } = useAuth();
  const [link, setLink] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  // Voucher MXH — merged in from the old standalone /social-vouchers page,
  // sharing this same "link" field instead of its own separate input.
  const [activeGroup, setActiveGroup] = useState('fb-ig');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [countdown, setCountdown] = useState<{ nextSlot: string; hours: number; minutes: number } | null>(null);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [productPreview, setProductPreview] = useState<ProductPreview | null>(null);
  // Whichever image URL is currently shown (from either source — see
  // productInfo) failed to load — forces the platform-icon
  // fallback regardless of source, since clearing productPreview alone
  // wouldn't help when the broken image actually came from result.product
  // (ACCESSTRADE's datafeed, not the scraped preview).
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  // True only while the page-scraped preview fetch is genuinely still in
  // flight for the CURRENT link — lets the UI tell "still might get a
  // real Dự kiến hoàn number" (show a neutral loading state) apart from
  // "confirmed no more data is coming" (show the friendly "Hoàn tiền:
  // Được áp dụng" copy instead of a permanent "Đang xác định..." that
  // reads like the product/link is broken — see productInfo's cashback
  // tiers and the JSX render below).
  const [productPreviewLoading, setProductPreviewLoading] = useState(false);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    setCountdown(getNextSlotInfo());
    const id = setInterval(() => setCountdown(getNextSlotInfo()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'socialVouchers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setVouchers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Voucher)));
    });
    return unsubscribe;
  }, []);

  const detectedPlatform = result?.status === 'supported' || result?.status === 'resolving' ? result.platformCode : null;

  // ProductResolver's unified output — the SAME shape for all 3 platforms
  // (per-platform branching lives only inside this one useMemo; the JSX
  // below never checks result.platformCode to decide what to render).
  //   name/image priority: ACCESSTRADE's own data (result.product — HIGH
  //     confidence, see ResolvedProductInfo's own comment) first, then the
  //     page's own scraped preview (productPreview) — but ONLY the
  //     title+image PAIR together (a title with no image, OR Shopee's own
  //     generic site-wide shell text, is never the real product — see
  //     productPreview's own comment and workers/product-preview's known-
  //     generic-title rejection). No third tier that turns a URL slug
  //     into a name — with neither real source resolved yet, productName
  //     stays undefined and the card shows a neutral loading label (see
  //     the JSX below) instead of a slug dressed up as an official name.
  //   estimatedCashback priority (via CashbackPolicy, lib/cashbackPolicy.ts
  //     — deliberately separate from Financial Core's computeCommissionSplit,
  //     so a future per-platform % change here can never touch a real
  //     payout):
  //     1. TikTok's own direct per-product commission field, or Shopee/
  //        Lazada with a real ACCESSTRADE datafeed price match (HIGH).
  //     2. Shopee/Lazada with only a campaign rate, combined with the
  //        page's own scraped price (MEDIUM) — productPreview resolves
  //        asynchronously, so this recomputes and "Đang xác định..."
  //        upgrades to a real number the moment a price becomes
  //        available — never a guessed/placeholder price substituted.
  const productInfo = useMemo(() => {
    if (result?.status !== 'supported' && result?.status !== 'resolving') return null;
    const product = result.status === 'supported' ? result.product : undefined;

    const cashback = (() => {
      if (result.status !== 'supported') return undefined;
      if (result.estimatedCommission) {
        // TikTok never sets estimatedCommissionSource (its commission is a
        // direct per-product API field, not resolved from a rate tier) —
        // falls back to ACCESSTRADE_PRODUCT_COMMISSION for that case.
        // Shopee/Lazada set it from the real tier resolveCommission()
        // (workers/accesstrade-sync) actually used — read directly, never
        // re-inferred from whether some other field happens to be present.
        return computeEstimatedCashback(result.platformCode, result.estimatedCommission.amount, {
          priceSource: result.estimatedCommissionPriceSource ?? 'ACCESSTRADE_DIRECT',
          commissionSource: result.estimatedCommissionSource ?? 'ACCESSTRADE_PRODUCT_COMMISSION',
          confidence: 'HIGH',
        });
      }
      // Shopee is intentionally excluded here — its ONLY real price source
      // is the D1 datafeed index (workers/accesstrade-sync's
      // lookupShopeeProductFromIndex), already covered by the
      // result.estimatedCommission branch above for BOTH long and short
      // links (a short link resolves to its canonical product URL, then
      // runs through the exact same /create-link -> D1 lookup as a long
      // link — see resolveShortlink/createOrReuseRedirect). Shopee's own
      // product pages never carry a real price in scrapeable page metadata
      // (confirmed live: no og:price/product:price meta tag, no JSON-LD
      // offers.price on a real Shopee product page), so productPreview.price
      // for a Shopee product — when a page's og:image/title scrape happens
      // to also catch SOME price-looking field — must never be used as a
      // second, uncontrolled price source standing in for D1. A miss here
      // always falls through to the "Được áp dụng" fallback, never a
      // scraped guess. Lazada/TikTok keep this branch unchanged.
      if (result.platformCode !== 'SHOPEE' && result.estimatedCommissionRate && productPreview?.price) {
        return computeEstimatedCashback(result.platformCode, result.estimatedCommissionRate * productPreview.price, {
          priceSource: 'SCRAPED_PREVIEW',
          commissionSource: result.estimatedCommissionSource ?? 'ACCESSTRADE_CAMPAIGN_POLICY',
          confidence: 'MEDIUM',
        });
      }
      return undefined;
    })();

    // True while a real cashback number MIGHT still arrive — either the
    // whole check is still in flight ('resolving'), or the MEDIUM-tier
    // path is live (a real campaign rate exists, so a real number will
    // appear the moment productPreview's own price lookup settles). Once
    // this goes false with no cashback amount, that's the FINAL word —
    // the JSX below switches from a loading state to the permanent
    // "Hoàn tiền: Được áp dụng" copy instead of an indefinite
    // "Đang xác định...", which read like the link/product was broken.
    // Shopee never has a MEDIUM tier to wait for (see the cashback branch
    // above), so it's excluded here too — otherwise a Shopee D1 miss would
    // show a loading spinner that can never resolve to a number instead of
    // going straight to the honest "Được áp dụng" fallback.
    const cashbackPending = result.status === 'resolving'
      || (!cashback && result.status === 'supported' && result.platformCode !== 'SHOPEE' && !!result.estimatedCommissionRate && productPreviewLoading);

    return {
      platform: result.platformCode,
      productId: product?.productId,
      productName: product?.name || productPreview?.title,
      productImage: imageLoadFailed ? undefined : product?.image || productPreview?.image,
      price: product?.price ?? (productPreview?.price || undefined),
      discount: product?.discount,
      commission: result.status === 'supported' ? result.estimatedCommission?.amount : undefined,
      commissionRate: result.status === 'supported' ? result.estimatedCommissionRate : undefined,
      commissionSource: cashback?.commissionSource,
      estimatedCashback: cashback?.amount,
      cashbackPending,
      dataSource: product?.dataSource,
      updatedAt: product?.updatedAt,
    };
  }, [result, productPreview, productPreviewLoading, imageLoadFailed]);

  const filteredVouchers = useMemo(() => {
    const group = platformGroups.find((g) => g.key === activeGroup) ?? platformGroups[0];
    return vouchers.filter((v) => group.platforms.includes(v.platform));
  }, [activeGroup, vouchers]);

  // The compact side panel next to the product card draws from the WHOLE
  // vault (not just the active social tab below) — eligible-for-this-
  // marketplace vouchers sort first and stay clickable, everything else
  // sits dimmed underneath instead of being hidden entirely.
  const sortedVouchersForPanel = useMemo(() => {
    return [...vouchers].sort((a, b) => {
      const aRank = voucherMatchesMarketplace(a.marketplaces, detectedPlatform) ? 0 : 1;
      const bRank = voucherMatchesMarketplace(b.marketplaces, detectedPlatform) ? 0 : 1;
      return aRank - bRank;
    });
  }, [vouchers, detectedPlatform]);

  const handlePasteOrClear = async () => {
    if (link) {
      setLink('');
      setResult(null);
      setProductPreview(null);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
    } catch {
      // clipboard access may be blocked; user can paste manually
    }
  };

  const handleCheck = async () => {
    if (!link || checking || !uid) return;
    setChecking(true);
    setSelectedVoucherId(null);
    setProductPreview(null);
    setImageLoadFailed(false);
    setProductPreviewLoading(false);

    const inputLink = ensureUrlScheme(link);
    // Instant feedback (client-side, no network) — platform detection is
    // a pure regex test, so the card/loading shell can render before the
    // link is even created, instead of the customer staring at a blank
    // panel until every network call below finishes.
    const earlyPlatform = detectPlatform(inputLink);
    setResult(earlyPlatform ? { status: 'resolving', platformCode: earlyPlatform, platform: PLATFORM_LABEL[earlyPlatform] ?? earlyPlatform } : null);

    try {
      // A share/shortlink (s.shopee.vn, vt.tiktok.com, ...) isn't itself a
      // product URL — normalizeProductUrl only strips/sorts query params,
      // it doesn't follow redirects, so tagging the bare shortlink with our
      // own tracking param instead of the real resolved product URL would
      // generate a "Mua ngay" link the marketplace can't attribute a
      // purchase against. Resolve it first when the Worker is configured.
      //
      // On a FAILED resolve, we deliberately do NOT fall through to
      // ACCESSTRADE with the raw, unresolved shortlink: their create-link
      // API can't follow a vt.tiktok.com/s.shopee.vn redirect itself, so it
      // would very likely answer with the documented "not eligible" shape
      // — which this app would then have to (wrongly) report as "no
      // commission" even though we genuinely never found out. Surfacing
      // this as its own resolve_error reason keeps that distinction
      // honest (see AffiliateLinkFailureReason's comment in
      // lib/redirectLink.ts) — the customer still gets the same neutral
      // "try again" wording and can still buy via the original shortlink.
      let targetLink = inputLink;
      // Set only for the shortlink path — the SAME Worker call that
      // resolved the redirect already scraped title/image/price for us,
      // so the fetchProductPreview call further below is skipped entirely
      // in that case rather than hitting the exact same URL a second time
      // (confirmed live 2026-09-09: this was happening on every single
      // shortlink paste, doubling that Worker round-trip for nothing).
      let reusablePreview: { title?: string; image?: string; price?: number } | undefined;
      if (isShortlink(inputLink)) {
        const resolved = await resolveShortlink(inputLink);
        if (!resolved) {
          const platformCode = detectPlatform(inputLink);
          if (!platformCode) {
            setResult({ status: 'unsupported' });
            return;
          }
          setResult({
            status: 'no_tracking',
            platformCode,
            platform: PLATFORM_LABEL[platformCode] ?? platformCode,
            reason: 'resolve_error',
            fallbackUrl: inputLink,
          });
          return;
        }
        targetLink = resolved.resolvedUrl;
        reusablePreview = { title: resolved.title, image: resolved.image, price: resolved.price };
      }
      const data = await createOrReuseRedirect(uid, targetLink);
      if (data.status === 'unsupported') {
        setResult({ status: 'unsupported' });
        return;
      }
      if (data.status === 'invalid_link') {
        setResult({ status: 'invalid_link' });
        return;
      }
      if (data.status === 'no_tracking') {
        setResult({
          status: 'no_tracking',
          platformCode: data.platform,
          platform: PLATFORM_LABEL[data.platform] ?? data.platform,
          reason: data.reason,
          fallbackUrl: data.fallbackUrl,
        });
        return;
      }
      setResult({
        status: 'supported',
        platformCode: data.platform,
        platform: PLATFORM_LABEL[data.platform] ?? data.platform,
        code: data.code,
        redirectUrl: data.redirectUrl,
        destinationUrl: data.destinationUrl,
        cacheHit: data.cacheHit,
        estimatedCommission: data.estimatedCommission,
        estimatedCommissionPriceSource: data.estimatedCommissionPriceSource,
        estimatedCommissionRate: data.estimatedCommissionRate,
        estimatedCommissionSource: data.estimatedCommissionSource,
        product: data.product,
        productLookupReason: data.productLookupReason,
      });

      // Best-effort real product title/thumbnail/price, scraped from the
      // page itself — a SECONDARY source, only used to fill in whatever
      // ACCESSTRADE's own datafeed (data.product above) didn't have (see
      // productInfo's priority order below). Deliberately no
      // local URL-slug guess shown in the meantime — a slug is never a
      // real product name, and showing one as if it were would be exactly
      // the "fake it until real data arrives" this project avoids; the
      // card shows a neutral loading state instead (see the 'resolving'
      // and no-name-yet render branches) until real data — from either
      // source — actually lands. Never blocks the flow above; if this
      // resolves after the user already changed the link, the request id
      // guard drops the stale response on the floor.
      // A real product page always has og:title AND og:image together — a
      // scraped title with NO image is a generic site-wide fallback (e.g.
      // Shopee serving "Shopee Việt Nam | Mua và Bán…" for a share link
      // that never actually redirected anywhere — also caught server-side
      // now, see workers/product-preview's known-generic-title rejection,
      // but this is defense-in-depth for the general case), which must
      // never be shown as if it were the real product name.
      const acceptPreview = (preview: { title?: string; image?: string; price?: number }) => ({
        title: preview.title && preview.image ? preview.title : undefined,
        image: preview.image,
        price: preview.price,
      });

      if (reusablePreview) {
        // Already have this synchronously — nothing left to wait for.
        setProductPreview(acceptPreview(reusablePreview));
        savePreviewToRedirect(data.code, reusablePreview);
      } else {
        setProductPreviewLoading(true);
        const requestId = ++previewRequestRef.current;
        fetchProductPreview(targetLink).then((preview) => {
          if (previewRequestRef.current !== requestId) return; // stale — a newer link replaced this one
          if (preview) {
            setProductPreview(acceptPreview(preview));
            // Persisted onto the redirectCache doc so /link-history can
            // show a real thumbnail/title/price for this link later, not
            // just at the moment it was first pasted.
            savePreviewToRedirect(data.code, preview);
          }
          // Settled either way — the "might still get a number" window
          // (see productPreviewLoading's own comment) is over regardless
          // of whether this actually found anything.
          setProductPreviewLoading(false);
        });
      }
    } catch {
      setResult({ status: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const copyTrackingLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const resetForm = () => {
    setLink('');
    setResult(null);
    setSelectedVoucherId(null);
    setProductPreview(null);
  };

  const absoluteRedirectUrl = (path: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  // Two-step flow, matching how a shopper actually uses a code: pick a
  // voucher first (copies it, marks it "applied" on this product) — the
  // marketplace redirect only happens afterwards when they hit "Mua ngay",
  // so the code is already sitting in their clipboard by the time they
  // reach checkout to paste it in.
  const applyVoucherToProduct = async (voucher: Voucher) => {
    try {
      await navigator.clipboard.writeText(voucher.code);
    } catch {
      // clipboard access may be blocked — selection still records below
    }
    setSelectedVoucherId(voucher.id);
  };

  // Browsing-mode voucher list further down the page still redirects
  // immediately on apply (no product card there to attach the selection
  // to) — same reuse-or-create cache as the main flow above.
  const handleApplyVoucherStandalone = async () => {
    if (!uid || !link.trim()) return;
    try {
      const trimmed = ensureUrlScheme(link);
      const targetLink = isShortlink(trimmed) ? (await resolveShortlink(trimmed))?.resolvedUrl || trimmed : trimmed;
      const r = await createOrReuseRedirect(uid, targetLink);
      if (r.status === 'supported') {
        // Open the marketplace URL directly rather than the intermediate
        // /go?code= redirector — installed as a PWA in standalone mode, an
        // in-app *script-driven* navigation (what /go's window.location.
        // replace() does) tends to stay trapped inside the PWA's own webview
        // instead of escaping to the system browser/native app the way a
        // direct, real user-gesture click on an external URL does. /go
        // itself stays in place for links copied/shared outside the app.
        window.open(r.destinationUrl, '_blank', 'noopener,noreferrer');
        recordRedirectHit(r.code);
      }
    } catch (err) {
      console.error('apply voucher redirect failed', err);
    }
  };

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <section className="get-link-card">
            <div className="get-link-card-head">
              <div className="promo-icon-badge">🔗</div>
              <div>
                <h1>{t('get_link_title')}</h1>
                <p>{t('get_link_subtitle')}</p>
              </div>
            </div>

            <div className="get-link-platform-grid">
              {mockPlatforms.map((platform) => (
                <span key={platform.name} className="get-link-platform-chip">
                  <PlatformBadge name={platform.name} size={20} />
                  <span>{platform.name}</span>
                </span>
              ))}
            </div>

            <div className="get-link-input-block">
              <label className="field-label" htmlFor="product-link">{t('paste_label')}</label>
              <div className="get-link-input-row">
                <span className="get-link-input-icon">🔗</span>
                <input
                  id="product-link"
                  placeholder={t('get_link_input_placeholder')}
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    setResult(null);
                    setSelectedVoucherId(null);
                  }}
                />
                <button type="button" className="get-link-paste-btn" onClick={handlePasteOrClear}>
                  {link ? `✕ ${t('sv_clear_link')}` : `📋 ${t('get_link_paste')}`}
                </button>
              </div>
            </div>

            <button className="button button-primary get-link-cta" onClick={handleCheck} disabled={!link || checking}>
              ✨ {checking ? t('get_link_checking') : t('get_link_btn')}
            </button>

            {result?.status === 'resolving' && (
              <div className="get-link-result-card">
                <span className="get-link-platform-detected">✅ Đã nhận diện: {result.platform}</span>
                <p className="quick-product-note" style={{ marginTop: 8 }}>🔍 Đang lấy thông tin sản phẩm...</p>
              </div>
            )}

            {result?.status === 'unsupported' && (
              <div className="get-link-result-card">
                <div className="get-link-result-error">
                  ⚠️ {t('get_link_unsupported')}
                </div>
                <p className="get-link-unsupported-note">
                  Sàn này chưa được hệ thống hỗ trợ theo dõi hoàn tiền tự động, nên link bên dưới sẽ không được cộng
                  tiền hoàn — bạn vẫn có thể mua bình thường qua link gốc.
                </p>
                <a href={ensureUrlScheme(link)} target="_blank" rel="noreferrer" className="button button-secondary get-link-unsupported-buy" style={{ display: 'inline-flex', marginTop: 4 }}>
                  🛒 Mua ngay (không hoàn tiền)
                </a>
              </div>
            )}

            {result?.status === 'invalid_link' && (
              <div className="get-link-result-card">
                <div className="get-link-result-error">
                  ⚠️ Link này không có định dạng sản phẩm hợp lệ
                </div>
                <p className="get-link-unsupported-note">
                  Không tìm thấy mã sản phẩm trong link — bạn kiểm tra lại đã copy đúng link trang sản phẩm chưa
                  (không phải link trang chủ, trang tìm kiếm hay link quảng cáo).
                </p>
              </div>
            )}

            {result?.status === 'error' && (
              <div className="get-link-result-error">
                ⚠️ {t('get_link_error_generic')}
              </div>
            )}

            {result?.status === 'no_tracking' && (() => {
              const copy = result.reason === 'not_in_campaign' ? NO_TRACKING_COPY.noCommission : NO_TRACKING_COPY.technicalError;
              return (
                <div className="get-link-result-card">
                  <span className="get-link-platform-detected">✅ Đã nhận diện: {result.platform}</span>
                  <div className="get-link-affiliate-status not-real">{copy.icon} {copy.text}</div>
                  <p className="get-link-unsupported-note">
                    Bạn vẫn có thể mua bình thường qua link gốc bên dưới — chỉ là đơn này sẽ không được cộng tiền hoàn.
                  </p>
                  <a
                    href={result.fallbackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="button button-secondary get-link-unsupported-buy"
                    style={{ display: 'inline-flex', marginTop: 4 }}
                  >
                    🛒 Mua ngay (không hoàn tiền)
                  </a>
                </div>
              );
            })()}

            {result?.status === 'supported' && (
              <div className="get-link-result-card">
                <span className="get-link-platform-detected">✅ Đã nhận diện: {result.platform}</span>
                <div className="get-link-affiliate-status real">🟢 Sản phẩm này được hỗ trợ hoàn tiền</div>

                <div className="quick-result-grid">
                  <div className="quick-product-card">
                  <div className="quick-product-info-row">
                    <div className="quick-product-thumb">
                      {productInfo?.productImage ? (
                        <img
                          src={productInfo.productImage}
                          alt=""
                          onError={() => setImageLoadFailed(true)}
                        />
                      ) : (
                        <PlatformBadge name={result.platform} size={30} />
                      )}
                    </div>
                    <div className="quick-product-info-text">
                      <h3 className="quick-product-title">{productInfo?.productName || 'Đang lấy thông tin sản phẩm'}</h3>
                      {/* estimatedCommission is ONLY ever the real figure
                          ACCESSTRADE's own API returned (see
                          lib/redirectLink.ts's own comment for exactly
                          which endpoint/field, per platform) — never
                          guessed or hardcoded. computeCommissionSplit is
                          the exact same pure function the real ledger
                          write uses (lib/orderEntry.ts) — this preview
                          applies the same customer/platform split a real
                          order would, so what's shown here is the
                          customer's own split amount, never the
                          marketplace's raw, undivided commission. Replaces
                          the old photo-verification badge entirely — this
                          is now the single, most prominent line in the
                          card (see globals.css's .quick-product-estimate-*
                          rules) since "product is supported" is already
                          shown by the 🟢 status line above. Defaults to the
                          no-referrer split (same 80% already shown in the
                          fixed line below) since this runs before any
                          order/referrer exists — purely a display
                          estimate, never written to any order/ledger/
                          wallet document. */}
                      {/* Three states, not two: a real number (HIGH/MEDIUM
                          confidence, see productInfo's own comment); a
                          brief loading state while a number still MIGHT
                          arrive (productInfo.cashbackPending); or — once
                          that window closes with nothing found — a
                          friendly "vẫn được hoàn tiền" message instead of
                          leaving "Đang xác định..." up indefinitely, which
                          reads like the link/product is broken rather
                          than "this specific product just doesn't have a
                          pre-purchase number available". Never a guessed
                          amount in that third state — the real figure is
                          only ever confirmed once ACCESSTRADE reports a
                          real order. */}
                      <div className="quick-product-estimate-block">
                        {productInfo?.estimatedCashback != null ? (
                          <>
                            <span className="quick-product-estimate-label">🤑 Dự kiến hoàn</span>
                            <span className="quick-product-estimate-amount">{formatCurrency(productInfo.estimatedCashback, lang)}</span>
                          </>
                        ) : productInfo?.cashbackPending ? (
                          <>
                            <span className="quick-product-estimate-label">🤑 Dự kiến hoàn</span>
                            <span className="quick-product-estimate-amount">Đang xác định...</span>
                          </>
                        ) : productInfo?.platform === 'SHOPEE' ? (
                          // Shopee specifically: never word this as a
                          // settled "Được áp dụng" when no real price/
                          // commission could be determined (ACCESSTRADE
                          // Datafeeds miss + no other trustworthy price
                          // source — see workers/accesstrade-sync's own
                          // resolveCommission/lookupShopeeProductFromIndex
                          // comments) — that reads as more certain than it
                          // is. Lazada/TikTok keep the original wording
                          // below, unchanged.
                          <>
                            <span className="quick-product-estimate-label">🤑 Hoàn tiền</span>
                            <span className="quick-product-estimate-amount">Đang xác định mức hoàn</span>
                          </>
                        ) : (
                          <>
                            <span className="quick-product-estimate-label">🤑 Hoàn tiền</span>
                            <span className="quick-product-estimate-amount">Được áp dụng</span>
                          </>
                        )}
                      </div>
                      <p className="quick-product-note">
                        {productInfo?.estimatedCashback != null || productInfo?.cashbackPending
                          ? 'Số tiền chính xác được xác nhận khi đơn hàng được đối soát.'
                          : '💰 Số tiền hoàn sẽ được xác nhận sau khi đơn hàng được ghi nhận. 🎉 Mua hàng qua link này vẫn được hoàn tiền.'}
                      </p>
                      <div
                        className="quick-product-commission-note"
                        title="Đây là % hoa hồng mà sàn thương mại điện tử trả cho chúng tôi trên mỗi đơn hàng — không phải % giá trị đơn hàng. Số tiền hoàn thực tế tùy theo mức hoa hồng thực tế sàn trả cho từng sản phẩm."
                      >
                        🎉 Bạn nhận {Math.round(COMMISSION_SPLIT.CUSTOMER_NO_REFERRER * 100)}% hoa hồng tiếp thị ⓘ
                      </div>
                    </div>
                  </div>

                  {result.cacheHit && <p className="quick-product-note">♻️ {t('get_link_cache_hit')}</p>}

                  {selectedVoucherId && (
                    <p className="quick-product-note applied">
                      ✓ Đã áp mã <strong>{vouchers.find((v) => v.id === selectedVoucherId)?.code}</strong> (đã sao chép — dán ở bước thanh toán trên sàn)
                    </p>
                  )}

                  <div className="get-link-input-row">
                    <span className="get-link-input-icon">🔗</span>
                    <input readOnly value={absoluteRedirectUrl(result.redirectUrl)} />
                  </div>
                </div>

                <div className="quick-voucher-panel">
                  <div className="quick-voucher-panel-header">🔥 Voucher độc quyền</div>
                  <div className="quick-voucher-list">
                    {vouchers.length === 0 ? (
                      <p className="quick-voucher-empty">Hiện tại không có voucher nào.</p>
                    ) : (
                      sortedVouchersForPanel.map((voucher) => {
                        const eligible = voucherMatchesMarketplace(voucher.marketplaces, detectedPlatform);
                        const isSelected = selectedVoucherId === voucher.id;
                        const accent = PLATFORM_ACCENT[voucher.platform] ?? 'var(--primary)';
                        return (
                          <div key={voucher.id} className={`quick-voucher-row${isSelected ? ' selected' : ''}${!eligible ? ' ineligible' : ''}`}>
                            <span className="quick-voucher-row-icon" style={{ background: accent }}>
                              <SocialPlatformIcon name={voucher.platform} size={15} />
                            </span>
                            <div className="quick-voucher-row-body">
                              {voucher.title && <strong className="quick-voucher-row-title">{voucher.title}</strong>}
                              <span className="quick-voucher-row-discount">
                                {voucher.discount}
                                {voucher.condition && <span className="quick-voucher-row-condition"> · {voucher.condition}</span>}
                              </span>
                              {voucher.expiry && <span className="quick-voucher-row-meta">HSD: {voucher.expiry}</span>}
                            </div>
                            <button
                              type="button"
                              className={`quick-voucher-radio${isSelected ? ' checked' : ''}`}
                              disabled={!eligible}
                              aria-label={isSelected ? 'Đã chọn mã này' : 'Chọn mã này'}
                              onClick={() => applyVoucherToProduct(voucher)}
                            >
                              {isSelected ? '✓' : ''}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="get-link-result-actions">
                <button type="button" className="button button-secondary" onClick={() => copyTrackingLink(absoluteRedirectUrl(result.redirectUrl))}>
                  {copied ? '✓' : '📋'} {t('get_link_copy')}
                </button>
                <a
                  href={result.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="button button-primary"
                  onClick={() => recordRedirectHit(result.code)}
                >
                  🛒 {t('get_link_buy_now')}
                </a>
                <button
                  type="button"
                  className={`button ${selectedVoucherId ? 'button-primary' : 'button-secondary'}`}
                  disabled={!selectedVoucherId}
                  title={selectedVoucherId ? undefined : 'Chọn 1 voucher ở bảng bên phải trước'}
                  onClick={() => {
                    const v = vouchers.find((item) => item.id === selectedVoucherId);
                    if (v) applyVoucherToProduct(v);
                  }}
                >
                  🎟️ {selectedVoucherId ? 'Đã áp voucher' : 'Áp dụng voucher'}
                </button>
              </div>

              <button type="button" className="text-link get-link-create-another-line" onClick={resetForm}>
                ➕ {t('get_link_create_another')}
              </button>
            </div>
            )}

            <div className="get-link-helper-row">
              <Link href="/#guide">▶ {t('get_link_how_to')}</Link>
              <a href="#important-rule-section">⚠ {t('get_link_note')}</a>
            </div>
          </section>

          <div className="get-link-quicklinks">
            <Link href="/orders" className="quick-utility-item">
              <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#0d9488' }}><ReceiptIcon size={22} /></span></span>
              {t('get_link_history')}
            </Link>
            <Link href="/link-history" className="quick-utility-item">
              <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#0369a1' }}><LinkIcon size={22} /></span></span>
              {t('sidebar_link_history')}
            </Link>
            <Link href="/referrals" className="quick-utility-item">
              <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#6366f1' }}><UsersIcon size={22} /></span></span>
              {t('sidebar_referrals')}
            </Link>
          </div>

          {/* Voucher MXH — merged here from the old standalone page */}
          <section className="panel" id="voucher-section" style={{ marginTop: 4, scrollMarginTop: 90 }}>
            <div className="sv-slot-header">
              <span>⏱ {t('sv_slot_title')}</span>
              {countdown && (
                <span className="sv-countdown">
                  {t('sv_next_in')} {countdown.hours}{t('sv_hours')}{countdown.minutes}{t('sv_minutes')}
                </span>
              )}
            </div>
            <div className="sv-slot-grid">
              {REFRESH_SLOTS.map((slot) => (
                <div key={slot} className={`sv-slot-item${countdown?.nextSlot === slot ? ' next' : ''}`}>
                  <strong>{slot}</strong>
                  <span>{countdown?.nextSlot === slot ? t('sv_slot_next_tag') : t('sv_slot_refresh_tag')}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="sv-platform-tabs">
            {platformGroups.map((group) => (
              <button
                key={group.key}
                className={activeGroup === group.key ? 'active' : ''}
                onClick={() => setActiveGroup(group.key)}
              >
                <span className="sv-platform-tab-icons">
                  {group.platforms.map((p) => <SocialPlatformIcon key={p} name={p} size={16} />)}
                </span>
                {group.label}
              </button>
            ))}
          </section>

          <section>
            <div className="section-header">
              <h2>{t('sv_title')}</h2>
              <p className="muted-copy">
                {detectedPlatform
                  ? `Voucher sáng rõ là những mã dùng được cho ${PLATFORM_LABEL[detectedPlatform]} — voucher mờ là mã không áp dụng cho sàn này.`
                  : t('sv_desc')}
              </p>
            </div>
            <div className="voucher-ticket-stack">
              {filteredVouchers.map((voucher, index) => {
                const eligible = voucherMatchesMarketplace(voucher.marketplaces, detectedPlatform);
                return (
                  <VoucherTicket
                    key={voucher.code}
                    voucher={voucher}
                    applyLabel={link.trim() && eligible ? t('sv_use_now') : t('offer_get_code')}
                    featured={index === 0 && eligible}
                    disabled={!eligible}
                    disabledReason={!eligible ? 'Không áp dụng cho sàn vừa nhận diện' : undefined}
                    onApply={link.trim() && eligible ? handleApplyVoucherStandalone : undefined}
                  />
                );
              })}
              {filteredVouchers.length === 0 && (
                <p className="muted-copy">{t('sv_empty')}</p>
              )}
            </div>
          </section>

          <section className="two-column-grid">
            <div className="panel">
              <h3>{t('how_it_works')}</h3>
              <ol className="ordered-list">
                <li>{t('step1')}</li>
                <li>{t('step2')}</li>
                <li>{t('step3')}</li>
                <li>{t('step4')}</li>
              </ol>
            </div>

            <div className="panel" id="important-rule-section">
              <h3>{t('important_rule')}</h3>
              <p className="muted-copy">{t('important_rule_desc')}</p>
            </div>
          </section>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
