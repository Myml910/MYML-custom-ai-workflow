import React from 'react';

export const Surface = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`myml-surface rounded-[var(--myml-radius-card)] transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-base)] ${className}`}
      {...props}
    />
  )
);

Surface.displayName = 'Surface';
