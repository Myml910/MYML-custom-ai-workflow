/**
 * MarkupToolbar.tsx
 *
 * Floating markup tools for arrows and structured shape annotations.
 */

import React from 'react';
import { t, type Language } from '../../../i18n/translations';
import { ToolButton, ToolDivider, ToolGroup } from '../../ui';

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
    canvasTheme: _canvasTheme = 'dark',
    language = 'zh',
    activeTool,
    filled,
    onSelectArrow,
    onSelectRectangle,
    onSelectEllipse,
    onToggleFilled
}) => {
    const fillDisabled = activeTool === 'arrow';

    const label = {
        arrow: t(language, 'arrowMarkup'),
        rectangle: t(language, 'rectangleMarkup'),
        ellipse: t(language, 'ellipseMarkup'),
        fill: t(language, 'fillMarkup'),
        tools: t(language, 'markupTools'),
    };

    return (
        <ToolGroup
            orientation="vertical"
            className="absolute left-[calc(100%+16px)] top-1/2 z-30 -translate-y-1/2"
            aria-label={label.tools}
        >
            <ToolButton
                type="button"
                onClick={onSelectArrow}
                active={activeTool === 'arrow'}
                title={label.arrow}
                aria-label={label.arrow}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
            </ToolButton>

            <ToolButton
                type="button"
                onClick={onSelectRectangle}
                active={activeTool === 'rectangle'}
                title={label.rectangle}
                aria-label={label.rectangle}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="6" width="14" height="12" rx="1" />
                </svg>
            </ToolButton>

            <ToolButton
                type="button"
                onClick={onSelectEllipse}
                active={activeTool === 'ellipse'}
                title={label.ellipse}
                aria-label={label.ellipse}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="12" rx="7" ry="5" />
                </svg>
            </ToolButton>

            <ToolDivider orientation="horizontal" />

            <ToolButton
                type="button"
                onClick={fillDisabled ? undefined : onToggleFilled}
                disabled={fillDisabled}
                active={filled && !fillDisabled}
                title={label.fill}
                aria-label={label.fill}
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="6" width="14" height="12" rx="1" fill={filled && !fillDisabled ? 'currentColor' : 'none'} />
                    <rect x="5" y="6" width="14" height="12" rx="1" />
                </svg>
            </ToolButton>
        </ToolGroup>
    );
};
