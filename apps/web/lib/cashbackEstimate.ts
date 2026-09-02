// Shared between /get-cashback-link and /link-history so both ever show the
// SAME guessed range for the same product — previously each page had its
// own logic (get-cashback-link had a proper tiered range, link-history had
// an older single fixed-ASSUMED_ORDER_VALUE number that never varied,
// always showing "~4.000đ" no matter the product), which is exactly the
// kind of inconsistency a customer bouncing between the two pages would
// notice and lose trust over.
import { ASSUMED_ORDER_VALUE } from './systemConfig';

// Both ends of every range below are still `bound * platformRate` — the
// exact same rate real orders settle at — never a bigger made-up number,
// since a customer who gets less at real payout than this range promised
// is a much worse outcome than a plainer display. What varies is only the
// assumed order-value bound itself: a rough keyword guess at the product's
// price tier from whatever title text is available (real scraped title,
// or failing that the local URL-slug guess). This is explicitly a guess,
// not a claim — no keyword list can reliably price a product, it only has
// to be closer than one fixed range for every product on the site.
export const ORDER_VALUE_TIERS = {
  small: { low: 20_000, high: 150_000 },
  medium: { low: ASSUMED_ORDER_VALUE, high: 1_000_000 },
  large: { low: 500_000, high: 5_000_000 },
};

const SMALL_ITEM_KEYWORDS = [
  'ốp lưng', 'ốp điện thoại', 'dây sạc', 'cáp sạc', 'tai nghe nhét tai',
  'khẩu trang', 'móc khóa', 'bao tay', 'dây buộc tóc', 'miếng dán',
  'kính cường lực', 'bút bi', 'kẹp tóc', 'băng đô', 'tất chân', 'vớ chân',
];

const LARGE_ITEM_KEYWORDS = [
  'ghế massage', 'tủ lạnh', 'máy giặt', 'điều hòa', 'máy lạnh', 'ti vi', 'tivi',
  'laptop', 'macbook', 'điện thoại', 'iphone', 'samsung galaxy', 'xe đạp điện',
  'xe máy điện', 'nệm', 'đệm', 'sofa', 'máy lọc nước', 'lò vi sóng', 'lò nướng',
  'robot hút bụi', 'máy hút bụi', 'đồng hồ thông minh', 'smartwatch',
  'máy tính bảng', 'ipad', 'dàn karaoke', 'loa karaoke', 'bếp từ', 'bếp hồng ngoại',
  'nồi chiên không dầu', 'máy nước nóng',
];

// Real scraped titles (og:title) come through with proper Vietnamese
// diacritics, but the local URL-slug guess (extractProductNameFromUrl,
// shown immediately and often still what's on screen when the scrape
// fails/never resolves) is built from a URL path — which real marketplace
// slugs almost always have with diacritics stripped ("Ghe-Massage-...",
// never "Ghế-Massage-..."). Matching the accented keyword list directly
// against an unaccented slug title would silently never match, so both
// sides get diacritics stripped before comparing.
const COMBINING_DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g');

export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITIC_MARKS, '')
    .replace(/đ/gi, (m) => (m === 'Đ' ? 'D' : 'd'));
}

const SMALL_ITEM_KEYWORDS_NORM = SMALL_ITEM_KEYWORDS.map(stripDiacritics);
const LARGE_ITEM_KEYWORDS_NORM = LARGE_ITEM_KEYWORDS.map(stripDiacritics);

export function guessOrderValueRange(title: string | undefined): { low: number; high: number } {
  if (!title) return ORDER_VALUE_TIERS.medium;
  const t = stripDiacritics(title.toLowerCase());
  if (LARGE_ITEM_KEYWORDS_NORM.some((k) => t.includes(k))) return ORDER_VALUE_TIERS.large;
  if (SMALL_ITEM_KEYWORDS_NORM.some((k) => t.includes(k))) return ORDER_VALUE_TIERS.small;
  return ORDER_VALUE_TIERS.medium;
}
