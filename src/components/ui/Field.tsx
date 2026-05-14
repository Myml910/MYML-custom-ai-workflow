import React from 'react';

interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, className = '', children, ...props }) => (
  <div className={`space-y-1.5 ${className}`} {...props}>
    {(label || hint) && (
      <div className="flex items-center justify-between gap-3">
        {label && <label className="text-[11px] font-medium leading-none text-[var(--myml-text-muted)]">{label}</label>}
        {hint && <span className="text-[10px] leading-none text-[var(--myml-text-faint)]">{hint}</span>}
      </div>
    )}
    {children}
  </div>
);
