import React from 'react';

type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const variantClass: Record<IconButtonVariant, string> = {
  primary:
    'border-[var(--myml-accent)] bg-[var(--myml-accent)] text-[var(--myml-accent-contrast)] hover:bg-[var(--myml-accent-hover)] hover:shadow-[var(--myml-shadow-accent)]',
  secondary:
    'border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] text-[var(--myml-text-secondary)] hover:border-[var(--myml-border-active)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)]',
  ghost:
    'border-transparent bg-transparent text-[var(--myml-text-muted)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)]',
  danger:
    'border-transparent bg-transparent text-[var(--myml-text-muted)] hover:bg-red-500/18 hover:text-red-300',
};

const sizeClass: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-9 w-9',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className = '', variant = 'ghost', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`myml-focus-ring inline-flex shrink-0 items-center justify-center rounded-[var(--myml-radius-control)] border transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--myml-motion-base)] ease-[var(--myml-ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    />
  )
);

IconButton.displayName = 'IconButton';
