const PLATFORM_STYLES: Record<string, { bg: string; letter: string }> = {
  Shopee: { bg: '#ee4d2d', letter: 'S' },
  Lazada: { bg: '#0f146d', letter: 'L' },
  'TikTok Shop': { bg: '#010101', letter: 'T' },
};

export function PlatformBadge({ name, size = 22 }: { name: string; size?: number }) {
  const style = PLATFORM_STYLES[name] ?? { bg: '#4a7ba7', letter: name.charAt(0) };

  return (
    <span
      className="platform-badge-icon"
      style={{
        background: style.bg,
        width: size,
        height: size,
        fontSize: size * 0.55,
      }}
      aria-hidden="true"
    >
      {style.letter}
    </span>
  );
}
