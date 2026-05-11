/**
 * BottomToolbar.tsx
 *
 * Floating tools palette at the bottom of the image editor.
 * Contains mode toggles and undo/redo buttons.
 */

import React from 'react';
import { t, type Language } from '../../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface BottomToolbarProps {
    canvasTheme?: 'dark' | 'light';
    language?: Language;

    // Mode states
    isSelectMode: boolean;
    setIsSelectMode: (mode: boolean) => void;
    isDrawingMode: boolean;
    setIsDrawingMode: (mode: boolean) => void;
    setIsArrowMode: (mode: boolean) => void;
    setIsShapeMode: (mode: boolean) => void;
    isTextMode: boolean;
    setIsTextMode: (mode: boolean) => void;
    isCropMode: boolean;
    setIsCropMode: (mode: boolean) => void;
    onCropModeEnter: () => void;

    // Mode helpers
    setShowToolSettings: (show: boolean) => void;
    setSelectedElementId: (id: string | null) => void;
    setDrawingTool: (tool: 'brush' | 'eraser') => void;
    setShowTextSettings: (show: boolean) => void;

    // History
    historyStackLength: number;
    redoStackLength: number;
    handleUndo: () => void;
    handleRedo: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BottomToolbar: React.FC<BottomToolbarProps> = ({
    canvasTheme = 'dark',
    language = 'zh',
    isSelectMode,
    setIsSelectMode,
    isDrawingMode,
    setIsDrawingMode,
    setIsArrowMode,
    setIsShapeMode,
    isTextMode,
    setIsTextMode,
    isCropMode,
    setIsCropMode,
    onCropModeEnter,
    setShowToolSettings,
    setSelectedElementId,
    setDrawingTool,
    setShowTextSettings,
    historyStackLength,
    redoStackLength,
    handleUndo,
    handleRedo
}) => {
    const isDark = canvasTheme === 'dark';

    const text = {
        select: t(language, 'selectTool'),
        drawingMode: t(language, 'drawingMode'),
        addText: t(language, 'addText'),
        crop: t(language, 'crop'),
        undo: t(language, 'undo'),
        redo: t(language, 'redo'),
    };

    const toolbarClass = isDark
        ? 'bg-[#151815]/95 border-neutral-800 shadow-[0_12px_32px_rgba(0,0,0,0.28)]'
        : 'bg-white/95 border-neutral-200 shadow-[0_12px_32px_rgba(15,23,42,0.10)]';

    const dividerClass = isDark ? 'bg-neutral-800' : 'bg-neutral-200';

    const getButtonClass = (active: boolean, disabled = false) => {
        if (disabled) {
            return isDark
                ? 'cursor-not-allowed text-neutral-600 opacity-70'
                : 'cursor-not-allowed text-neutral-400 opacity-70';
        }

        if (active) {
            return isDark
                ? 'bg-[#D8FF00]/12 text-[#D8FF00] ring-1 ring-[#D8FF00]/35'
                : 'bg-lime-50 text-lime-700 ring-1 ring-lime-500/35';
        }

        return isDark
            ? 'text-neutral-400 hover:bg-neutral-800 hover:text-[#D8FF00]'
            : 'hover:bg-neutral-100 text-neutral-500 hover:text-lime-600';
    };

    const buttonBaseClass = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45';

    // --- Handler Functions ---

    const handleSelectModeClick = () => {
        setIsSelectMode(!isSelectMode);
        if (!isSelectMode) {
            setIsDrawingMode(false);
            setIsArrowMode(false);
            setIsShapeMode(false);
            setIsTextMode(false);
            setIsCropMode(false);
            setShowToolSettings(false);
            setShowTextSettings(false);
        }
        setSelectedElementId(null);
    };

    const handleDrawingModeClick = () => {
        setIsDrawingMode(!isDrawingMode);
        if (!isDrawingMode) {
            setDrawingTool('brush');
            setShowToolSettings(false);
            setShowTextSettings(false);
            setIsArrowMode(false);
            setIsShapeMode(false);
            setIsSelectMode(false);
            setIsTextMode(false);
            setIsCropMode(false);
        }
    };

    const handleTextModeClick = () => {
        setIsTextMode(!isTextMode);
        if (!isTextMode) {
            setIsDrawingMode(false);
            setIsSelectMode(false);
            setIsArrowMode(false);
            setIsShapeMode(false);
            setIsCropMode(false);
            setShowToolSettings(false);
            setShowTextSettings(true);
        } else {
            setShowTextSettings(false);
        }
    };

    const handleCropModeClick = () => {
        setIsCropMode(!isCropMode);
        if (!isCropMode) {
            setIsDrawingMode(false);
            setIsSelectMode(false);
            setIsArrowMode(false);
            setIsShapeMode(false);
            setIsTextMode(false);
            setShowToolSettings(false);
            setShowTextSettings(false);
            onCropModeEnter();
        }
    };

    return (
        <div
            className={`pointer-events-auto inline-flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-xl border px-2 py-1.5 backdrop-blur-sm transition-colors duration-150 ${toolbarClass}`}
        >
            {/* Select Mode */}
            <button
                onClick={handleSelectModeClick}
                className={`${buttonBaseClass} ${getButtonClass(isSelectMode)}`}
                title={text.select}
                aria-label={text.select}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    <path d="M13 13l6 6" />
                </svg>
            </button>

            {/* Drawing Mode (Pen) */}
            <button
                onClick={handleDrawingModeClick}
                className={`${buttonBaseClass} ${getButtonClass(isDrawingMode)}`}
                title={text.drawingMode}
                aria-label={text.drawingMode}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
            </button>

            {/* Text Tool */}
            <button
                onClick={handleTextModeClick}
                className={`${buttonBaseClass} ${getButtonClass(isTextMode)}`}
                title={text.addText}
                aria-label={text.addText}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7V4h16v3" />
                    <path d="M9 20h6" />
                    <path d="M12 4v16" />
                </svg>
            </button>

            {/* Crop Tool */}
            <button
                onClick={handleCropModeClick}
                className={`${buttonBaseClass} ${getButtonClass(isCropMode)}`}
                title={text.crop}
                aria-label={text.crop}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2v4" />
                    <path d="M18 22v-4" />
                    <path d="M2 6h4" />
                    <path d="M22 18h-4" />
                    <rect x="6" y="6" width="12" height="12" />
                </svg>
            </button>

            <div className={`mx-1 h-6 w-px shrink-0 ${dividerClass}`}></div>

            {/* Undo */}
            <button
                onClick={handleUndo}
                disabled={historyStackLength === 0}
                className={`${buttonBaseClass} ${getButtonClass(false, historyStackLength === 0)}`}
                title={`${text.undo} (Ctrl+Z)`}
                aria-label={`${text.undo} (Ctrl+Z)`}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                </svg>
            </button>

            {/* Redo */}
            <button
                onClick={handleRedo}
                disabled={redoStackLength === 0}
                className={`${buttonBaseClass} ${getButtonClass(false, redoStackLength === 0)}`}
                title={`${text.redo} (Ctrl+Shift+Z)`}
                aria-label={`${text.redo} (Ctrl+Shift+Z)`}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                </svg>
            </button>
        </div>
    );
};
