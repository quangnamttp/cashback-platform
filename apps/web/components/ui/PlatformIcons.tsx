// Real marketplace brand icons (provided as static assets in public/icons),
// swapped in for the earlier hand-drawn SVG approximations. Each source
// image is a near-edge-to-edge rounded-square mark already, so a matching
// border-radius on the <img> itself is enough to crop away the few
// leftover square-corner pixels outside that shape.
const PLATFORM_ICON_SRC: Record<string, string> = {
  Shopee: '/icons/shopee.png',
  Lazada: '/icons/lazada.jpg',
  'TikTok Shop': '/icons/tiktok.png',
  TikTok: '/icons/tiktok.png',
};

export function PlatformIcon({ name, size = 24 }: { name: string; size?: number }) {
  const src = PLATFORM_ICON_SRC[name];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: size * 0.28, objectFit: 'cover', display: 'block' }}
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx={size * 0.28} fill="#4a7ba7" />
      <text x="24" y="31" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff">
        {name.charAt(0)}
      </text>
    </svg>
  );
}
