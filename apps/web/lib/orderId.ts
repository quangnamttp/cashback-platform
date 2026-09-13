// Firestore doc ids for AFFILIATE-sourced orders are `accesstrade_<id>` (see
// workers/accesstrade-sync) — the affiliate network's name must never reach
// a screen (customer, admin, or Telegram — 2026-09-13), only exist in code/
// data. Every place that shows an order id to a human must strip this
// prefix first; the underlying value (Firestore doc id, search matching,
// ledger/fraud references) stays untouched everywhere else.
export function displayOrderId(id: string): string {
  return id.startsWith('accesstrade_') ? id.slice('accesstrade_'.length) : id;
}
