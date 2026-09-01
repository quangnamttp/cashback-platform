// Approximate real-world length/format patterns for account numbers — good
// enough to catch typos (missing/extra digits, wrong prefix) before a
// withdrawal request is submitted. Not a real bank lookup (no such API is
// available client-side without a backend), so it never claims the account
// itself exists — only that the format is plausible.

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const VIETTEL_PHONE_PREFIXES = ['032', '033', '034', '035', '036', '037', '038', '039', '086', '096', '097', '098'];

export const ADMIN_PAYMENT_METHODS = ['Vietcombank', 'Sacombank', 'MBBank', 'Viettel Money'] as const;
export type AdminPaymentMethod = (typeof ADMIN_PAYMENT_METHODS)[number];

export function validateAccountNumber(bankLabel: string, rawValue: string): string | null {
  const value = digitsOnly(rawValue);
  if (!value) return 'Vui lòng nhập số tài khoản / số điện thoại.';

  if (bankLabel.includes('Vietcombank')) {
    if (value.length < 9 || value.length > 14) {
      return 'Số tài khoản Vietcombank không đúng định dạng hoặc thiếu/thừa chữ số (cần 9-14 chữ số).';
    }
    return null;
  }
  if (bankLabel.includes('Sacombank')) {
    if (value.length < 8 || value.length > 12) {
      return 'Số tài khoản Sacombank không đúng định dạng hoặc thiếu/thừa chữ số (cần 8-12 chữ số).';
    }
    return null;
  }
  if (bankLabel.includes('MBBank') || bankLabel.includes('MB Bank')) {
    if (value.length < 8 || value.length > 13) {
      return 'Số tài khoản MB Bank không đúng định dạng hoặc thiếu/thừa chữ số (cần 8-13 chữ số).';
    }
    return null;
  }
  if (bankLabel.includes('Viettel Money')) {
    const prefix = value.slice(0, 3);
    if (value.length !== 10 || !VIETTEL_PHONE_PREFIXES.includes(prefix)) {
      return 'Số điện thoại Viettel Money không đúng định dạng (cần đúng 10 số, đầu số thuê bao Viettel).';
    }
    return null;
  }

  // Any other bank in the general list: only a loose sanity range, since
  // this app doesn't maintain per-bank rules for every institution.
  if (value.length < 6 || value.length > 20) {
    return 'Số tài khoản không đúng định dạng hoặc thiếu/thừa chữ số.';
  }
  return null;
}
