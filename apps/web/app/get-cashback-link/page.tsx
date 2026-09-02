'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { mockPlatforms } from '../../lib/mock-data';
import { createOrReuseRedirect, recordRedirectHit, savePreviewToRedirect, voucherMatchesMarketplace, type Platform } from '../../lib/redirectLink';
import { COMMISSION_SPLIT } from '../../lib/orderEntry';
import { subscribeSystemRates, DEFAULT_RATES, ASSUMED_ORDER_VALUE, type SystemRates } from '../../lib/systemConfig';
import { guessOrderValueRange } from '../../lib/cashbackEstimate';
import { fetchProductPreview, extractProductNameFromUrl, isShortlink, resolveShortlink, type ProductPreview } from '../../lib/productPreview';
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
  | { status: 'unsupported' }
  | { status: 'invalid_link' }
  | { status: 'error' }
  | {
      status: 'supported';
      platformCode: Platform;
      platform: string;
      code: string;
      redirectUrl: string;
      destinationUrl: string;
      cacheHit: boolean;
    };

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
  const previewRequestRef = useRef(0);
  const [rates, setRates] = useState<SystemRates>(DEFAULT_RATES);
  const platformRate: Record<Platform, number> = {
    SHOPEE: rates.shopeeRate,
    TIKTOK_SHOP: rates.tiktokRate,
    LAZADA: rates.lazadaRate,
  };

  useEffect(() => subscribeSystemRates(setRates), []);

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

  const detectedPlatform = result?.status === 'supported' ? result.platformCode : null;

  // Recomputed live (not fixed at the moment the link was checked) so it
  // updates the instant a real price resolves from the scraper — using the
  // real price when we have one, the same reference order value as before
  // otherwise.
  const hasRealPrice = typeof productPreview?.price === 'number';
  const estimatedCashback =
    result?.status === 'supported'
      ? Math.round((productPreview?.price ?? ASSUMED_ORDER_VALUE) * (platformRate[result.platformCode] ?? 0))
      : 0;

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
    try {
      // A share/shortlink (s.shopee.vn, vt.tiktok.com, ...) isn't itself a
      // product URL — normalizeProductUrl only strips/sorts query params,
      // it doesn't follow redirects, so tagging the bare shortlink with our
      // own tracking param instead of the real resolved product URL would
      // generate a "Mua ngay" link the marketplace can't attribute a
      // purchase against. Resolve it first when the Worker is configured;
      // on failure fall back to the original link rather than block link
      // creation entirely — a link generated from the unresolved shortlink
      // still works for the customer, it just won't track properly.
      const targetLink = isShortlink(link) ? (await resolveShortlink(link)) || link : link;
      const data = await createOrReuseRedirect(uid, targetLink);
      if (data.status === 'unsupported') {
        setResult({ status: 'unsupported' });
        return;
      }
      if (data.status === 'invalid_link') {
        setResult({ status: 'invalid_link' });
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
      });

      // Immediate, network-free title from the URL's own slug — shows the
      // instant the check completes instead of a generic "Sản phẩm liên kết
      // qua X" placeholder. fetchProductPreview below may still replace it
      // with a real og:title + thumbnail (+ price, when the page's own
      // structured data has one) if that resolves; if it doesn't
      // (rate-limited, no preview available, etc.), this stays as the title
      // instead of silently reverting to the generic fallback.
      const localTitle = extractProductNameFromUrl(targetLink);
      if (localTitle) setProductPreview({ title: localTitle });

      // Best-effort real product title/thumbnail/price — never blocks the
      // flow above; if it resolves after the user already changed the
      // link, the request id guard drops the stale response on the floor.
      // Reuses targetLink (already resolved above if it was a shortlink)
      // instead of re-resolving the same redirect a second time here.
      const requestId = ++previewRequestRef.current;
      fetchProductPreview(targetLink).then((preview) => {
        if (previewRequestRef.current === requestId && preview) {
          // A real product page always has og:title AND og:image together —
          // a scraped title with NO image is the generic site-wide
          // fallback (e.g. Shopee serving "Shopee Việt Nam | Mua và Bán…"
          // for a non-existent/invalid product id, confirmed live), which
          // is strictly worse than the local slug guess above and must
          // never overwrite it — it would also silently break the tier
          // guess below (a "ghế massage" slug losing to a generic title
          // means guessOrderValueRange never sees the keyword).
          setProductPreview((prev) => ({
            title: preview.title && preview.image ? preview.title : prev?.title,
            image: preview.image || prev?.image,
            price: preview.price,
          }));
          // Persisted onto the redirectCache doc so /link-history can show
          // a real thumbnail/title/price for this link later, not just at
          // the moment it was first pasted.
          savePreviewToRedirect(data.code, preview);
        }
      });
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
      const trimmed = link.trim();
      const targetLink = isShortlink(trimmed) ? (await resolveShortlink(trimmed)) || trimmed : trimmed;
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

            {result?.status === 'unsupported' && (
              <div className="get-link-result-card">
                <div className="get-link-result-error">
                  ⚠️ {t('get_link_unsupported')}
                </div>
                <p className="get-link-unsupported-note">
                  Sàn này chưa được hệ thống hỗ trợ theo dõi hoàn tiền tự động, nên link bên dưới sẽ không được cộng
                  tiền hoàn — bạn vẫn có thể mua bình thường qua link gốc.
                </p>
                <a href={link} target="_blank" rel="noreferrer" className="button button-secondary get-link-unsupported-buy" style={{ display: 'inline-flex', marginTop: 4 }}>
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

            {result?.status === 'supported' && (
              <div className="get-link-result-card">
                <span className="get-link-platform-detected">✅ Đã nhận diện: {result.platform}</span>

                <div className="quick-result-grid">
                  <div className="quick-product-card">
                  <div className="quick-product-info-row">
                    <div className="quick-product-thumb">
                      {productPreview?.image ? (
                        <img
                          src={productPreview.image}
                          alt=""
                          onError={() => setProductPreview((prev) => (prev ? { ...prev, image: undefined } : prev))}
                        />
                      ) : (
                        <PlatformBadge name={result.platform} size={30} />
                      )}
                    </div>
                    <div className="quick-product-info-text">
                      <h3 className="quick-product-title">{productPreview?.title || `Sản phẩm liên kết qua ${result.platform}`}</h3>
                      {/* Only ever a POSITIVE signal, never a negative one —
                          a real product photo resolving from the scraper is
                          good evidence the link points at a real, live
                          listing, but the reverse isn't true: Shopee's
                          common "tên-shop/id" share-link format (as opposed
                          to the canonical /product/{shopId}/{itemId} form)
                          serves a bare SPA shell with zero scrapable meta
                          tags for real products too (verified live against
                          a link a real customer pasted), so no image here
                          must never be read as "not a real product". */}
                      {productPreview?.image && (
                        <div className="quick-product-verified-badge">✅ Đã xác minh sản phẩm thật</div>
                      )}
                      {hasRealPrice ? (
                        <div className="quick-product-cashback-inline">
                          Hoàn tiền dự kiến: <strong>{formatCurrency(estimatedCashback, lang)}</strong>
                          <span className="quick-product-cashback-caption"> (số tiền dự kiến, chỉ mang tính tham khảo)</span>
                        </div>
                      ) : (
                        <>
                          {/* Shopee/TikTok/Lazada product pages don't publish
                              real price anywhere a scraper (or even a
                              JS-rendering proxy — tried, got CAPTCHA'd on
                              TikTok, empty on Shopee) can read it without
                              their official affiliate API, so a single fixed
                              VND number here is always either misleadingly
                              low (a 500k+ product showing "3.000đ") or high
                              (a 20k product showing the same "3.000đ" as if
                              expensive). A range across a guessed order-value
                              tier (see guessOrderValueRange above) is the
                              honest version of this estimate — both ends are
                              still `bound * platformRate`, the same rate a
                              real order settles at, never a bigger made-up
                              number. */}
                          <div className="quick-product-cashback-row">
                            <span>Hoàn tiền dự kiến</span>
                            <strong>
                              {formatCurrency(Math.round(guessOrderValueRange(productPreview?.title).low * (platformRate[result.platformCode] ?? 0)), lang)}
                              {' – '}
                              {formatCurrency(Math.round(guessOrderValueRange(productPreview?.title).high * (platformRate[result.platformCode] ?? 0)), lang)}
                            </strong>
                            <span className="quick-product-cashback-caption">(số tiền dự kiến, chỉ mang tính tham khảo)</span>
                          </div>
                          <p className="quick-product-note">
                            💡 Mức hoàn tiền tham khảo theo giá trị đơn hàng thực tế. Số tiền chính xác sẽ được cập
                            nhật khi đơn hàng được sàn đối soát.
                          </p>
                        </>
                      )}
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
