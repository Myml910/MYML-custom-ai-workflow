import React from 'react';

export interface EditorShellProps extends React.HTMLAttributes<HTMLDivElement> {}

export const EditorShell = React.forwardRef<HTMLDivElement, EditorShellProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`fixed inset-0 z-[9999] flex flex-col bg-[var(--myml-editor-bg)] text-[var(--myml-text-primary)] ${className}`}
      {...props}
    />
  )
);

EditorShell.displayName = 'EditorShell';

export interface EditorTopBarProps extends React.HTMLAttributes<HTMLDivElement> {}

export const EditorTopBar = React.forwardRef<HTMLDivElement, EditorTopBarProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`flex h-14 shrink-0 items-center justify-between border-b border-[var(--myml-border-subtle)] bg-[var(--myml-surface-floating)] px-4 shadow-[var(--myml-shadow-floating)] ${className}`}
      {...props}
    />
  )
);

EditorTopBar.displayName = 'EditorTopBar';
