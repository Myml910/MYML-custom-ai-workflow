import React from 'react';

interface PanelSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  meta?: React.ReactNode;
}

export const PanelSection: React.FC<PanelSectionProps> = ({ title, meta, className = '', children, ...props }) => (
  <section className={`myml-section p-3 ${className}`} {...props}>
    {(title || meta) && (
      <div className="mb-2 flex items-center justify-between gap-3">
        {title && <h4 className="text-[11px] font-semibold leading-none text-[var(--myml-text-muted)]">{title}</h4>}
        {meta && <span className="text-[10px] leading-none text-[var(--myml-text-faint)]">{meta}</span>}
      </div>
    )}
    {children}
  </section>
);
