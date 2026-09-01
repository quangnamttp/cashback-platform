import { PlatformBadge } from './PlatformBadge';

// Real orders can carry a product photo (set by admin when entering the
// order); falls back to the platform badge for older orders that don't
// have one yet.
export function OrderThumb({ imageUrl, platform, size = 44 }: { imageUrl?: string | null; platform: string; size?: number }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: size * 0.28, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return <PlatformBadge name={platform} size={size} />;
}
