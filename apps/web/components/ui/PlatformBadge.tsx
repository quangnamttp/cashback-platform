import { PlatformIcon } from './PlatformIcons';

export function PlatformBadge({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span className="platform-badge-icon" style={{ width: size, height: size }} aria-hidden="true">
      <PlatformIcon name={name} size={size} />
    </span>
  );
}
