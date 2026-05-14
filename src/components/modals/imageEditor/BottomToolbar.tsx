/**
 * BottomToolbar.tsx
 *
 * Floating tools palette at the bottom of the image editor.
 * Contains mode toggles and undo/redo buttons.
 */

import React from 'react';
import { t, type Language } from '../../../i18n/translations';
import { ToolButton, ToolDivider, ToolGroup } from '../../ui';

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
    canvasTheme: _canvasTheme = 'dark',
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
    const text = {
        select: t(language, 'selectTool'),
        drawingMode: t(language, 'drawingMode'),
        addText: t(language, 'addText'),
        crop: t(language, 'crop'),
        undo: t(language, 'undo'),
        redo: t(language, 'redo'),
    };

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
        <ToolGroup>
            {/* Select Mode */}
            <ToolButton
                onClick={handleSelectModeClick}
                active={isSelectMode}
                title={text.select}
                aria-label={text.select}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    <path d="M13 13l6 6" />
                </svg>
            </ToolButton>

            {/* Drawing Mode (Pen) */}
            <ToolButton
                onClick={handleDrawingModeClick}
                active={isDrawingMode}
                title={text.drawingMode}
                aria-label={text.drawingMode}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
            </ToolButton>

            {/* Text Tool */}
            <ToolButton
                onClick={handleTextModeClick}
                active={isTextMode}
                title={text.addText}
                aria-label={text.addText}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7V4h16v3" />
                    <path d="M9 20h6" />
                    <path d="M12 4v16" />
                </svg>
            </ToolButton>

            {/* Crop Tool */}
            <ToolButton
                onClick={handleCropModeClick}
                active={isCropMode}
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
            </ToolButton>

            <ToolDivider />

            {/* Undo */}
            <ToolButton
                onClick={handleUndo}
                disabled={historyStackLength === 0}
                title={`${text.undo} (Ctrl+Z)`}
                aria-label={`${text.undo} (Ctrl+Z)`}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                </svg>
            </ToolButton>

            {/* Redo */}
            <ToolButton
                onClick={handleRedo}
                disabled={redoStackLength === 0}
                title={`${text.redo} (Ctrl+Shift+Z)`}
                aria-label={`${text.redo} (Ctrl+Shift+Z)`}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                </svg>
            </ToolButton>
        </ToolGroup>
    );
};
