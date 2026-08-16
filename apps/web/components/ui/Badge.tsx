type BadgeVariant = 'success' | 'warning' | 'muted' | 'danger' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

export function Badge({ children, variant = 'muted' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
