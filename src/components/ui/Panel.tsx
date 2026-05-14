import React from 'react';

export const Panel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`myml-panel overflow-hidden backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-panel)] ${className}`}
      {...props}
    />
  )
);

Panel.displayName = 'Panel';

export const PanelHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div
    className={`flex min-h-12 items-center justify-between gap-3 border-b border-[var(--myml-border-subtle)] px-4 py-3 ${className}`}
    {...props}
  />
);

export const PanelBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`p-[var(--myml-density-panel-pad)] ${className}`} {...props} />
  )
);

PanelBody.displayName = 'PanelBody';

export const PanelFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div
    className={`flex items-center justify-end gap-2 border-t border-[var(--myml-border-subtle)] px-4 py-3 ${className}`}
    {...props}
  />
);
