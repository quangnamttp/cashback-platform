// Brand icons for the social-voucher platforms. Facebook/Instagram/YouTube
// are hand-drawn SVG (no official asset files provided for these, unlike
// the marketplace icons), styled to match the same rounded-square language;
// TikTok reuses the real asset already in public/icons since one exists.
export function FacebookIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx={size * 0.28} fill="#1877F2" />
      <path
        d="M27 16.5h3.5v-5h-3.8c-3.9 0-6.2 2.5-6.2 6.4V21H17v5h3.5v11h5.2V26H29l0.7-5h-4V18c0-1 .3-1.5 1.3-1.5Z"
        fill="#fff"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 24 }: { size?: number }) {
  const gradId = 'igGrad';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={gradId} cx="30%" cy="105%" r="120%">
          <stop offset="0%" stopColor="#FFDD55" />
          <stop offset="30%" stopColor="#FF543E" />
          <stop offset="60%" stopColor="#C837AB" />
          <stop offset="100%" stopColor="#3F51E1" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx={size * 0.28} fill={`url(#${gradId})`} />
      <rect x="13" y="13" width="22" height="22" rx="7" fill="none" stroke="#fff" strokeWidth="2.6" />
      <circle cx="24" cy="24" r="6" fill="none" stroke="#fff" strokeWidth="2.6" />
      <circle cx="32.5" cy="15.5" r="1.8" fill="#fff" />
    </svg>
  );
}

export function YouTubeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx={size * 0.28} fill="#FF0000" />
      <path d="M20 17.5 32 24 20 30.5Z" fill="#fff" />
    </svg>
  );
}

export function TikTokVoucherIcon({ size = 24 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/tiktok.png"
      alt="TikTok"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: size * 0.28, objectFit: 'cover', display: 'block' }}
    />
  );
}

export const SOCIAL_PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YouTube'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function SocialPlatformIcon({ name, size = 24 }: { name: string; size?: number }) {
  if (name === 'Facebook') return <FacebookIcon size={size} />;
  if (name === 'Instagram') return <InstagramIcon size={size} />;
  if (name === 'YouTube') return <YouTubeIcon size={size} />;
  if (name === 'TikTok') return <TikTokVoucherIcon size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx={size * 0.28} fill="#4a7ba7" />
      <text x="24" y="31" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff">{name.charAt(0)}</text>
    </svg>
  );
}
