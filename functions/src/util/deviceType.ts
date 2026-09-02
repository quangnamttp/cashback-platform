export type DeviceType = 'mobile' | 'desktop';

const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|windows phone|mobile/i;

export function detectDeviceType(userAgent: string | undefined): DeviceType {
  if (!userAgent) return 'desktop';
  return MOBILE_UA_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}
