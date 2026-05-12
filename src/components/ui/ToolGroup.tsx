import React from 'react';

export interface ToolGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export const ToolGroup = React.forwardRef<HTMLDivElement, ToolGroupProps>(
  ({ className = '', orientation = 'horizontal', ...props }, ref) => (
    <div
      ref={ref}
      className={`pointer-events-auto inline-flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-[var(--myml-radius-panel)] border border-[var(--myml-editor-toolbar-border)] bg-[var(--myml-editor-toolbar)] p-1.5 shadow-[var(--myml-shadow-floating)] backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-base)] ${
        orientation === 'vertical' ? 'flex-col' : ''
      } ${className}`}
      {...props}
    />
  )
);

ToolGroup.displayName = 'ToolGroup';

export const ToolDivider: React.FC<{ className?: string; orientation?: 'horizontal' | 'vertical' }> = ({
  className = '',
  orientation = 'vertical',
}) => (
  <div
    className={`shrink-0 bg-[var(--myml-border-default)] ${
      orientation === 'vertical' ? 'mx-1 h-6 w-px' : 'my-1 h-px w-7'
    } ${className}`}
  />
);

