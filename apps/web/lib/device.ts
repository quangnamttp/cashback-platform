const STORAGE_KEY = 'cb_device_id';

export type DeviceType = 'mobile' | 'desktop';
const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|windows phone|mobile/i;

/** Self-reported by the browser now (no trusted server to check headers) — an accepted trade-off, see feature 3. */
export function detectDeviceType(): DeviceType {
  if (typeof navigator === 'undefined') return 'desktop';
  return MOBILE_UA_PATTERN.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

/**
 * A persistent id for this browser/device, used by registerSession to tell
 * "same physical device, different account" apart from "a genuinely new
 * device". It can be cleared by the user to dodge the 1-mobile+1-desktop
 * limit — an accepted trade-off since the feature intentionally never hard
 * bans by device/IP (see feature 3).
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const generated = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    return `dev-${Date.now()}`;
  }
}
