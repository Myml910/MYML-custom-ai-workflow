import React from 'react';

export const FloatingToolbar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`myml-popover inline-flex flex-nowrap items-center gap-[var(--myml-density-toolbar-gap)] whitespace-nowrap px-1.5 py-1 ${className}`}
      {...props}
    />
  )
);

FloatingToolbar.displayName = 'FloatingToolbar';

export const ToolbarSeparator: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div className={`h-5 w-px shrink-0 bg-[var(--myml-border-default)] ${className}`} {...props} />
);
