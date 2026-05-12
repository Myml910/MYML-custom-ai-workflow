import React from 'react';

type ToolButtonSize = 'sm' | 'md' | 'lg';

export interface ToolButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: ToolButtonSize;
}

const sizeClass: Record<ToolButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
};

export const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(
  ({ active = false, className = '', size = 'md', type = 'button', disabled, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`myml-focus-ring inline-flex shrink-0 items-center justify-center rounded-[var(--myml-radius-control)] border transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--myml-motion-base)] ease-[var(--myml-ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${
        active
          ? 'border-[var(--myml-border-active)] bg-[var(--myml-editor-control-active)] text-[var(--myml-accent)] shadow-[var(--myml-shadow-accent)]'
          : 'border-transparent bg-transparent text-[var(--myml-text-muted)] hover:bg-[var(--myml-editor-control-hover)] hover:text-[var(--myml-text-primary)]'
      } ${sizeClass[size]} ${className}`}
      {...props}
    />
  )
);

ToolButton.displayName = 'ToolButton';

