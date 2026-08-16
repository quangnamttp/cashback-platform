import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', icon, children, className = '', ...props }: ButtonProps) {
  const variantClass = {
    primary: 'button-primary',
    secondary: 'button-secondary',
    ghost: 'button-ghost',
  }[variant];

  return (
    <button className={`button ${variantClass} ${className}`.trim()} {...props}>
      {icon ? <span className="button-icon">{icon}</span> : null}
      {children}
    </button>
  );
}
