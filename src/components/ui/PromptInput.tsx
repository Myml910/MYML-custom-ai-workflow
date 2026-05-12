import React from 'react';

export interface PromptInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const PromptInput = React.forwardRef<HTMLInputElement, PromptInputProps>(
  ({ className = '', error, ...props }, ref) => (
    <div className="relative min-w-0 flex-1">
      {error && (
        <div className="absolute bottom-full left-0 mb-2 whitespace-nowrap text-xs font-medium text-[var(--myml-danger)]">
          {error}
        </div>
      )}
      <input
        ref={ref}
        className={`myml-focus-ring h-9 w-full rounded-[var(--myml-radius-control)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-input)] px-3 text-sm text-[var(--myml-text-primary)] outline-none placeholder:text-[var(--myml-text-faint)] transition-[background-color,border-color,box-shadow,color] duration-[var(--myml-motion-base)] focus:border-[var(--myml-border-active)] ${className}`}
        {...props}
      />
    </div>
  )
);

PromptInput.displayName = 'PromptInput';

