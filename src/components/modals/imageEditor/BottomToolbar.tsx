/**
 * BottomToolbar.tsx
 * 
 * Floating tools palette at the bottom of the image editor.
 * Contains mode toggles and undo/redo buttons.
 */

import React from 'react';
import { Language } from '../../../i18n/translations';

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
    isArrowMode: boolean;
    setIsArrowMode: (mode: boolean) => void;
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
    isArrowMode,
    setIsArrowMode,
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
        select: language === 'zh' ? '选择' : 'Select',
        drawingMode: language === 'zh' ? '绘制模式' : 'Drawing Mode',
        arrow: language === 'zh' ? '箭头' : 'Arrow',
        addText: language === 'zh' ? '添加文字' : 'Add Text',
        crop: language === 'zh' ? '裁剪' : 'Crop',
        undo: language === 'zh' ? '撤销' : 'Undo',
        redo: language === 'zh' ? '重做' : 'Redo',
    };

    const toolbarClass = isDark
        ? 'bg-[#111111]/95 border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.45)]'
        : 'bg-white/95 border-neutral-200 shadow-[0_18px_45px_rgba(15,23,42,0.12)]';

    const dividerClass = isDark ? 'bg-neutral-800' : 'bg-neutral-200';

    const getButtonClass = (active: boolean, disabled = false) => {
        if (disabled) {
            return 'opacity-50 cursor-not-allowed text-neutral-500';
        }

        if (active) {
            return isDark
                ? 'bg-[#D8FF00] text-black shadow-[0_0_14px_rgba(216,255,0,0.18)]'
                : 'bg-lime-600 text-white shadow-sm';
        }

        return isDark
            ? 'text-neutral-400 hover:bg-neutral-800 hover:text-[#D8FF00]'
            : 'hover:bg-neutral-100 text-neutral-500 hover:text-lime-600';
    };

    // --- Handler Functions ---

    const handleSelectModeClick = () => {
        setIsSelectMode(!isSelectMode);
        if (!isSelectMode) {
            setIsDrawingMode(false);
            setIsArrowMode(false);
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
            setIsSelectMode(false);
            setIsTextMode(false);
            setIsCropMode(false);
        }
    };

    const handleArrowModeClick = () => {
        setIsArrowMode(!isArrowMode);
        if (!isArrowMode) {
            setIsDrawingMode(false);
            setIsSelectMode(false);
            setIsTextMode(false);
            setIsCropMode(false);
            setShowToolSettings(false);
            setShowTextSettings(false);
        }
    };

    const handleTextModeClick = () => {
        setIsTextMode(!isTextMode);
        if (!isTextMode) {
            setIsDrawingMode(false);
            setIsSelectMode(false);
            setIsArrowMode(false);
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
            setIsTextMode(false);
            setShowToolSettings(false);
            setShowTextSettings(false);
            onCropModeEnter();
        }
    };

    return (
        <div
            className={`backdrop-blur-sm rounded-xl border px-2 py-1.5 flex items-center gap-1 pointer-events-auto transition-all duration-200 ${toolbarClass}`}
        >
            {/* Select Mode */}
            <button
                onClick={handleSelectModeClick}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(isSelectMode)}`}
                title={text.select}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    <path d="M13 13l6 6" />
                </svg>
            </button>

            {/* Drawing Mode (Pen) */}
            <button
                onClick={handleDrawingModeClick}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(isDrawingMode)}`}
                title={text.drawingMode}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
            </button>

            {/* Arrow Tool */}
            <button
                onClick={handleArrowModeClick}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(isArrowMode)}`}
                title={text.arrow}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
            </button>

            {/* Text Tool */}
            <button
                onClick={handleTextModeClick}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(isTextMode)}`}
                title={text.addText}
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
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(isCropMode)}`}
                title={text.crop}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2v4" />
                    <path d="M18 22v-4" />
                    <path d="M2 6h4" />
                    <path d="M22 18h-4" />
                    <rect x="6" y="6" width="12" height="12" />
                </svg>
            </button>

            <div className={`w-px h-6 mx-1 ${dividerClass}`}></div>

            {/* Undo */}
            <button
                onClick={handleUndo}
                disabled={historyStackLength === 0}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(false, historyStackLength === 0)}`}
                title={`${text.undo} (Ctrl+Z)`}
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
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(false, redoStackLength === 0)}`}
                title={`${text.redo} (Ctrl+Shift+Z)`}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                </svg>
            </button>
        </div>
    );
};
