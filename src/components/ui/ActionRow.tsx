import React from 'react';

export const ActionRow: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div className={`flex min-w-0 items-center justify-between gap-2 ${className}`} {...props} />
);
