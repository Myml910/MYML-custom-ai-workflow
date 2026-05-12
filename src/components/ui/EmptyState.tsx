import React from 'react';

interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  className = '',
  ...props
}) => (
  <div
    className={`myml-surface flex flex-col items-center justify-center rounded-[var(--myml-radius-card)] px-4 py-10 text-center ${className}`}
    {...props}
  >
    {icon && <div className="mb-3 text-[var(--myml-text-faint)]">{icon}</div>}
    <p className="text-sm font-medium leading-5 text-[var(--myml-text-muted)]">{title}</p>
    {description && <p className="mt-1 text-[11px] leading-4 text-[var(--myml-text-faint)]">{description}</p>}
  </div>
);
