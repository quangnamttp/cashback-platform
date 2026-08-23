import type { Lang } from './i18n';

// Mock/display-only conversion rates from VND (our base mock currency).
// These are NOT live exchange rates — for a real deployment this should
// come from a backend/FX service. Clearly a mock rate for now.
const VND_PER_USD = 25400;
const VND_PER_CNY = 3550;

const CURRENCY_BY_LANG: Record<Lang, { code: string; locale: string; rate: number }> = {
  vi: { code: 'VND', locale: 'vi-VN', rate: 1 },
  en: { code: 'USD', locale: 'en-US', rate: 1 / VND_PER_USD },
  zh: { code: 'CNY', locale: 'zh-CN', rate: 1 / VND_PER_CNY },
};

/**
 * Formats an amount (given in VND, our base mock currency) into the
 * currency associated with the currently selected UI language.
 */
export function formatCurrency(amountInVnd: number, lang: Lang): string {
  const { code, locale, rate } = CURRENCY_BY_LANG[lang] ?? CURRENCY_BY_LANG.vi;
  const converted = amountInVnd * rate;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: code === 'VND' ? 0 : 2,
  }).format(converted);
}
