import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClass =
  'myml-focus-ring inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--myml-radius-control)] border font-semibold transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--myml-motion-base)] ease-[var(--myml-ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'border-[var(--myml-accent)] bg-[var(--myml-accent)] text-black hover:bg-[var(--myml-accent-hover)] hover:shadow-[var(--myml-shadow-accent)]',
  secondary:
    'border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] text-[var(--myml-text-secondary)] hover:border-[var(--myml-border-active)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)]',
  ghost:
    'border-transparent bg-transparent text-[var(--myml-text-muted)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)]',
  danger:
    'border-red-500/30 bg-[var(--myml-danger-soft)] text-red-300 hover:border-red-400/50 hover:bg-red-500 hover:text-white',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[11px] leading-none',
  md: 'h-8 px-3 text-xs leading-none',
  lg: 'h-9 px-4 text-sm leading-none',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    />
  )
);

Button.displayName = 'Button';
