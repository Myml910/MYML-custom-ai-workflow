import React from 'react';

type StatusDotTone = 'idle' | 'running' | 'success' | 'warning' | 'danger' | 'accent';

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusDotTone;
}

const toneClass: Record<StatusDotTone, string> = {
  idle: 'bg-[var(--myml-node-status-idle)]',
  running: 'bg-[var(--myml-node-status-running)]',
  success: 'bg-[var(--myml-node-status-success)]',
  warning: 'bg-[var(--myml-warning)]',
  danger: 'bg-[var(--myml-danger)]',
  accent: 'bg-[var(--myml-accent)]',
};

export const StatusDot: React.FC<StatusDotProps> = ({ tone = 'idle', className = '', ...props }) => (
  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${toneClass[tone]} ${className}`} {...props} />
);
