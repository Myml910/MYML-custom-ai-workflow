import React from 'react';

type ToolButtonSize = 'sm' | 'md' | 'lg';
type ToolButtonTone = 'default' | 'danger';

export interface ToolButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: ToolButtonSize;
  tone?: ToolButtonTone;
}

const sizeClass: Record<ToolButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
};

export const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(
  ({ active = false, className = '', size = 'md', tone = 'default', type = 'button', disabled, ...props }, ref) => {
    const activeClass = tone === 'danger'
      ? 'border-[var(--myml-danger)] bg-[var(--myml-danger-soft)] text-[var(--myml-danger)] ring-1 ring-[var(--myml-danger-soft)]'
      : 'border-[var(--myml-border-active)] bg-[var(--myml-editor-control-active)] text-[var(--myml-accent)] shadow-[var(--myml-shadow-accent)] ring-1 ring-[var(--myml-border-active)]';

    const idleClass = tone === 'danger'
      ? 'border-transparent bg-transparent text-[var(--myml-danger)] hover:border-[var(--myml-danger)] hover:bg-[var(--myml-danger-soft)]'
      : 'border-transparent bg-transparent text-[var(--myml-text-muted)] hover:border-[var(--myml-border-subtle)] hover:bg-[var(--myml-editor-control-hover)] hover:text-[var(--myml-text-primary)]';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`myml-focus-ring inline-flex shrink-0 items-center justify-center rounded-[var(--myml-radius-control)] border transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--myml-motion-base)] ease-[var(--myml-ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[var(--myml-text-faint)] disabled:opacity-50 disabled:shadow-none disabled:ring-0 disabled:active:scale-100 ${
          active ? activeClass : idleClass
        } ${sizeClass[size]} ${className}`}
        {...props}
      />
    );
  }
);

ToolButton.displayName = 'ToolButton';
