/**
 * MarkupToolbar.tsx
 *
 * Floating markup tools for arrows and structured shape annotations.
 */

import React from 'react';
import { Language } from '../../../i18n/translations';

interface MarkupToolbarProps {
    canvasTheme?: 'dark' | 'light';
    language?: Language;
    activeTool: 'arrow' | 'rectangle' | 'ellipse' | null;
    filled: boolean;
    onSelectArrow: () => void;
    onSelectRectangle: () => void;
    onSelectEllipse: () => void;
    onToggleFilled: () => void;
}

export const MarkupToolbar: React.FC<MarkupToolbarProps> = ({
    canvasTheme = 'dark',
    language = 'zh',
    activeTool,
    filled,
    onSelectArrow,
    onSelectRectangle,
    onSelectEllipse,
    onToggleFilled
}) => {
    const isDark = canvasTheme === 'dark';
    const fillDisabled = activeTool === 'arrow';

    const label = {
        arrow: language === 'zh' ? '箭头标记' : 'Arrow',
        rectangle: language === 'zh' ? '矩形标记' : 'Rectangle',
        ellipse: language === 'zh' ? '椭圆标记' : 'Ellipse',
        fill: language === 'zh' ? '填充标记' : 'Fill'
    };

    const panelClass = isDark
        ? 'border-neutral-800 bg-[#111111]/95 shadow-[0_18px_45px_rgba(0,0,0,0.45)]'
        : 'border-neutral-200 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.14)]';

    const dividerClass = isDark ? 'bg-neutral-800' : 'bg-neutral-200';

    const buttonClass = (active: boolean, disabled = false) => {
        if (disabled) {
            return isDark
                ? 'cursor-not-allowed text-neutral-600 opacity-55'
                : 'cursor-not-allowed text-neutral-300 opacity-65';
        }

        if (active) {
            return isDark
                ? 'bg-[#D8FF00] text-black shadow-[0_0_14px_rgba(216,255,0,0.2)]'
                : 'bg-[#D8FF00] text-black shadow-sm';
        }

        return isDark
            ? 'text-neutral-300 hover:bg-neutral-800 hover:text-[#D8FF00]'
            : 'text-neutral-700 hover:bg-neutral-100 hover:text-lime-700';
    };

    return (
        <div
            className={`pointer-events-auto absolute left-[calc(100%+16px)] top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border p-1.5 backdrop-blur-sm transition-colors ${panelClass}`}
            aria-label={language === 'zh' ? '标记工具' : 'Markup tools'}
        >
            <button
                type="button"
                onClick={onSelectArrow}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${buttonClass(activeTool === 'arrow')}`}
                title={label.arrow}
                aria-label={label.arrow}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
            </button>

            <button
                type="button"
                onClick={onSelectRectangle}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${buttonClass(activeTool === 'rectangle')}`}
                title={label.rectangle}
                aria-label={label.rectangle}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="6" width="14" height="12" rx="1" />
                </svg>
            </button>

            <button
                type="button"
                onClick={onSelectEllipse}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${buttonClass(activeTool === 'ellipse')}`}
                title={label.ellipse}
                aria-label={label.ellipse}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="12" rx="7" ry="5" />
                </svg>
            </button>

            <div className={`my-1 h-px w-7 ${dividerClass}`} />

            <button
                type="button"
                onClick={fillDisabled ? undefined : onToggleFilled}
                disabled={fillDisabled}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${buttonClass(filled && !fillDisabled, fillDisabled)}`}
                title={label.fill}
                aria-label={label.fill}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="6" width="14" height="12" rx="1" fill={filled && !fillDisabled ? 'currentColor' : 'none'} />
                    <rect x="5" y="6" width="14" height="12" rx="1" />
                </svg>
            </button>
        </div>
    );
};
