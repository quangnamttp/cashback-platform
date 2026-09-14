// Real marketplace brand icons (provided as static assets in public/icons),
// swapped in for the earlier hand-drawn SVG approximations. Each source
// image is a near-edge-to-edge rounded-square mark already, so a matching
// border-radius on the <img> itself is enough to crop away the few
// leftover square-corner pixels outside that shape.
//
// Every one of these source files has a solid WHITE square baked into its
// own pixels (not transparent) — fine on a light page, but it read as a
// glaring, mismatched patch dropped straight onto a dark background in
// dark mode. Rather than fight that with CSS (impossible without a real
// transparent asset) or wait on new source files, the border+shadow below
// turns it into a deliberate "app icon on a white card" treatment (the
// same convention iOS/Android/every app store already uses for icons
// regardless of system theme) — so the white now reads as intentional
// branding instead of a rendering bug, in both themes, with no new assets
// needed and no layout size change at any existing call site.
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
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          objectFit: 'cover',
          display: 'block',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.18)',
        }}
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
