// Real logo asset (public/logo.png), used in the header and admin sidebar
// brand slot in place of the earlier hand-drawn SVG mascot.
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Hoàn Tiền DV"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  );
}
