import React from 'react';

type BadgeVariant = 'neutral' | 'accent' | 'danger' | 'success' | 'warning';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] text-[var(--myml-text-muted)]',
  accent: 'border-[var(--myml-accent-muted)] bg-[var(--myml-accent-soft)] text-[var(--myml-accent)]',
  danger: 'border-red-500/30 bg-red-500/12 text-red-300',
  success: 'border-green-400/25 bg-green-400/10 text-green-300',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
};

export const Badge: React.FC<BadgeProps> = ({ className = '', variant = 'neutral', ...props }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${variantClass[variant]} ${className}`}
    {...props}
  />
);
