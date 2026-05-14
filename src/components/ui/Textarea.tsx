import React from 'react';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`myml-focus-ring myml-input-surface w-full resize-none rounded-[var(--myml-radius-control)] px-3 py-2 text-sm leading-5 outline-none placeholder:text-[var(--myml-text-faint)] transition-[background-color,border-color,box-shadow,color] duration-[var(--myml-motion-base)] ${className}`}
      {...props}
    />
  )
);

Textarea.displayName = 'Textarea';
