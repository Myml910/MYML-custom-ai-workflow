import React from 'react';

export const SegmentedControl: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div
    className={`inline-flex min-h-8 items-center gap-1 rounded-[var(--myml-radius-control)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-input)] p-1 ${className}`}
    {...props}
  />
);
