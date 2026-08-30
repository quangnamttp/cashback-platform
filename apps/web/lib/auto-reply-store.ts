const STORAGE_KEY = 'cb_auto_reply_message';

export const DEFAULT_AUTO_REPLY =
  'Cảm ơn bạn đã nhắn tin! Đội ngũ hỗ trợ hiện không online, chúng tôi sẽ phản hồi sớm nhất có thể trong giờ làm việc (8:00 - 22:00 hàng ngày).';

/**
 * Loads the admin-configured auto-reply message from localStorage.
 * IMPORTANT limitation: localStorage is per-browser, not shared between
 * the admin's device and a customer's device — so this only truly works
 * end-to-end once a real backend (e.g. Firebase) stores it centrally.
 * Until then this returns the default message for anyone browsing on a
 * different device than the admin who configured it.
 */
export function loadAutoReplyMessage(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_AUTO_REPLY;
  } catch {
    return DEFAULT_AUTO_REPLY;
  }
}

export function saveAutoReplyMessage(message: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, message);
  } catch {
    // ignore storage errors
  }
}
