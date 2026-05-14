import React from 'react';

export const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`myml-focus-ring inline-flex h-[var(--myml-density-control)] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--myml-radius-control)] border border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] px-2.5 text-xs font-medium leading-none text-[var(--myml-text-secondary)] transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--myml-motion-base)] hover:border-[var(--myml-border-active)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)] active:scale-[0.98] ${className}`}
      {...props}
    />
  )
);

SelectTrigger.displayName = 'SelectTrigger';
