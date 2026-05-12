import React from 'react';

export interface EditorStatusBarProps extends React.HTMLAttributes<HTMLDivElement> {}

export const EditorStatusBar = React.forwardRef<HTMLDivElement, EditorStatusBarProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`inline-flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--myml-radius-control)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-section)] px-2.5 text-[11px] font-medium leading-none text-[var(--myml-text-muted)] ${className}`}
      {...props}
    />
  )
);

EditorStatusBar.displayName = 'EditorStatusBar';

