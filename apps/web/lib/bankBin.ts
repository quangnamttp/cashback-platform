// VietQR bank identifiers — verified against api.vietqr.io/v2/banks
// (2026-09) and vietqr.io's deep-link docs. Only real banks are mapped —
// e-wallets (MoMo, ZaloPay, Viettel Money, ShopeePay, VNPay) aren't part
// of the VietQR bank network, so buildVietQrImageUrl() returns null for
// those and callers must fall back to plain text (no QR image).
const BANK_INFO: Record<string, { code: string; bin: string }> = {
  Vietcombank: { code: 'vcb', bin: '970436' },
  Techcombank: { code: 'tcb', bin: '970407' },
  MBBank: { code: 'mb', bin: '970422' },
  BIDV: { code: 'bidv', bin: '970418' },
  VietinBank: { code: 'icb', bin: '970415' },
  Agribank: { code: 'vba', bin: '970405' },
  ACB: { code: 'acb', bin: '970416' },
  VPBank: { code: 'vpb', bin: '970432' },
  TPBank: { code: 'tpb', bin: '970423' },
  Sacombank: { code: 'stb', bin: '970403' },
  VIB: { code: 'vib', bin: '970441' },
  SHB: { code: 'shb', bin: '970443' },
  HDBank: { code: 'hdb', bin: '970437' },
  MSB: { code: 'msb', bin: '970426' },
  OCB: { code: 'ocb', bin: '970448' },
  SeABank: { code: 'seab', bin: '970440' },
  Eximbank: { code: 'eib', bin: '970431' },
  LPBank: { code: 'lpb', bin: '970449' },
  'Nam A Bank': { code: 'nab', bin: '970428' },
  ABBank: { code: 'abb', bin: '970425' },
  PVcomBank: { code: 'pvcb', bin: '970412' },
  BacABank: { code: 'bab', bin: '970409' },
  VietBank: { code: 'vietbank', bin: '970433' },
  Kienlongbank: { code: 'klb', bin: '970452' },
  SCB: { code: 'scb', bin: '970429' },
  VietABank: { code: 'vab', bin: '970427' },
  PGBank: { code: 'pgb', bin: '970430' },
  Saigonbank: { code: 'sgicb', bin: '970400' },
  'CAKE by VPBank': { code: 'cake', bin: '546034' },
};

function findBankInfo(bankLabel: string): { code: string; bin: string } | null {
  // bankLabel may carry a trailing "(Ví điện tử)" tag (see lib/mock-data.ts
  // bankList) or be an exact ADMIN_PAYMENT_METHODS entry — match by
  // whichever known key the label starts with/contains.
  const name = Object.keys(BANK_INFO).find((key) => bankLabel.includes(key));
  return name ? BANK_INFO[name] : null;
}

/**
 * A real VietQR code image (img.vietqr.io — the standard image-generation
 * endpoint, no API key needed) with the recipient account, amount and note
 * already encoded into the QR itself. Chosen over VietQR's dl.vietqr.io/pay
 * "quick link" (tried first) because that endpoint now HARD REQUIRES an
 * `app` param naming one specific bank app to launch (verified live —
 * omitting it returns {"message":"Thiếu tham số app"}), which would lock
 * the button to one guessed bank instead of letting the admin pick whatever
 * app they actually have open. A QR image has no such problem: it's the
 * one standard format essentially every VN banking app's "Scan QR" (or
 * "scan from photo/gallery") feature already reads, regardless of which
 * bank issued the app — so the admin picks the app themselves, same as
 * scanning any other VietQR code. Returns null when the bank has no known
 * VietQR code (e-wallets, or a bank not in the mapping above).
 */
export function buildVietQrImageUrl(params: {
  bankLabel: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  note: string;
}): string | null {
  const info = findBankInfo(params.bankLabel);
  if (!info) return null;
  const query = new URLSearchParams({
    amount: String(Math.round(params.amount)),
    addInfo: params.note,
    accountName: params.accountHolder,
  });
  return `https://img.vietqr.io/image/${info.bin}-${params.accountNumber}-qr_only.png?${query.toString()}`;
}
