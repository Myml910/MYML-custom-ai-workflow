/**
 * DrawingToolbar.tsx
 *
 * Sub-toolbar for brush/eraser tools with settings panels.
 * Only visible when drawing mode is active.
 */

import React from 'react';
import { t, type Language } from '../../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface DrawingToolbarProps {
    canvasTheme?: 'dark' | 'light';
    language?: Language;

    drawingTool: 'brush' | 'eraser';
    setDrawingTool: (tool: 'brush' | 'eraser') => void;
    brushWidth: number;
    setBrushWidth: (width: number) => void;
    eraserWidth: number;
    setEraserWidth: (width: number) => void;
    brushColor: string;
    setBrushColor: (color: string) => void;
    showToolSettings: boolean;
    setShowToolSettings: (show: boolean) => void;
    presetColors: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
    canvasTheme = 'dark',
    language = 'zh',
    drawingTool,
    setDrawingTool,
    brushWidth,
    setBrushWidth,
    eraserWidth,
    setEraserWidth,
    brushColor,
    setBrushColor,
    showToolSettings,
    setShowToolSettings,
    presetColors
}) => {
    const isDark = canvasTheme === 'dark';

    const text = {
        brush: t(language, 'brush'),
        eraser: t(language, 'eraser'),
        brushWidth: t(language, 'brushWidth'),
        eraserWidth: t(language, 'eraserWidth'),
        presetColors: t(language, 'presetColors'),
        presetColorOption: t(language, 'presetColorOption'),
        customColor: t(language, 'customColor'),
    };

    const toolbarClass = isDark
        ? 'bg-[#151815]/95 border-neutral-800 shadow-[0_12px_32px_rgba(0,0,0,0.28)]'
        : 'bg-white/95 border-neutral-200 shadow-[0_12px_32px_rgba(15,23,42,0.10)]';

    const panelClass = isDark
        ? 'bg-[#1A1D1A] border-neutral-800 shadow-[0_14px_34px_rgba(0,0,0,0.32)] rounded-lg transition-[opacity,transform] duration-150 motion-menu-in'
        : 'bg-white border-neutral-200 shadow-[0_14px_34px_rgba(15,23,42,0.12)] rounded-lg transition-[opacity,transform] duration-150 motion-menu-in';

    const labelClass = isDark ? 'text-neutral-300' : 'text-neutral-700';

    const rangeClass = isDark
        ? 'w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#D8FF00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45'
        : 'w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-lime-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/40';

    const colorInputClass = isDark
        ? 'w-full h-10 rounded-lg cursor-pointer border border-neutral-700 bg-neutral-900 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45'
        : 'w-full h-10 rounded-lg cursor-pointer border border-neutral-200 bg-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/40';

    const getButtonClass = (active: boolean) => {
        if (active) {
            return isDark
                ? 'bg-[#D8FF00]/12 text-[#D8FF00] ring-1 ring-[#D8FF00]/35'
                : 'bg-lime-50 text-lime-700 ring-1 ring-lime-500/35';
        }

        return isDark
            ? 'text-neutral-400 hover:bg-neutral-800 hover:text-[#D8FF00]'
            : 'hover:bg-neutral-100 text-neutral-500 hover:text-lime-600';
    };

    const buttonBaseClass = 'w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45';

    return (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50">
            <div
                className={`backdrop-blur-sm rounded-xl border px-2 py-1.5 flex items-center gap-1 transition-colors duration-150 ${toolbarClass}`}
            >
                {/* Brush Button with Settings Panel */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setDrawingTool('brush');
                            if (drawingTool === 'brush') {
                                setShowToolSettings(!showToolSettings);
                            } else {
                                setShowToolSettings(true);
                            }
                        }}
                        className={`${buttonBaseClass} ${getButtonClass(drawingTool === 'brush')}`}
                        title={text.brush}
                        aria-label={text.brush}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                    </button>

                    {/* Brush Settings Panel */}
                    {showToolSettings && drawingTool === 'brush' && (
                        <div className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 border p-4 z-50 min-w-[220px] ${panelClass}`}>
                            {/* Brush Width */}
                            <div className="mb-4">
                                <div className={`flex items-center justify-between text-sm mb-2 ${labelClass}`}>
                                    <span>{text.brushWidth}</span>
                                    <span>{brushWidth}</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="20"
                                    value={brushWidth}
                                    onChange={(e) => setBrushWidth(parseInt(e.target.value))}
                                    className={rangeClass}
                                    aria-label={text.brushWidth}
                                />
                            </div>

                            {/* Preset Colors */}
                            <div className="mb-3">
                                <div className={`text-sm mb-2 ${labelClass}`}>{text.presetColors}</div>
                                <div className="flex gap-2">
                                    {presetColors.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => setBrushColor(color)}
                                            className={`w-8 h-8 rounded-lg border-2 transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${
                                                brushColor === color
                                                    ? isDark
                                                        ? 'border-neutral-100 ring-2 ring-[#D8FF00]/55'
                                                        : 'border-white ring-2 ring-lime-500/55'
                                                    : isDark
                                                        ? 'border-transparent hover:border-neutral-500'
                                                        : 'border-transparent hover:border-neutral-300'
                                            }`}
                                            style={{ backgroundColor: color }}
                                            title={`${text.presetColorOption}: ${color}`}
                                            aria-label={`${text.presetColorOption}: ${color}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Custom Color */}
                            <div>
                                <div className={`text-sm mb-2 ${labelClass}`}>{text.customColor}</div>
                                <input
                                    type="color"
                                    value={brushColor}
                                    onChange={(e) => setBrushColor(e.target.value)}
                                    className={colorInputClass}
                                    aria-label={text.customColor}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Eraser Button with Settings Panel */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setDrawingTool('eraser');
                            if (drawingTool === 'eraser') {
                                setShowToolSettings(!showToolSettings);
                            } else {
                                setShowToolSettings(true);
                            }
                        }}
                        className={`${buttonBaseClass} ${getButtonClass(drawingTool === 'eraser')}`}
                        title={text.eraser}
                        aria-label={text.eraser}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                            <path d="M22 21H7" />
                            <path d="m5 11 9 9" />
                        </svg>
                    </button>

                    {/* Eraser Settings Panel */}
                    {showToolSettings && drawingTool === 'eraser' && (
                        <div className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 border p-4 z-50 min-w-[220px] ${panelClass}`}>
                            {/* Eraser Width */}
                            <div>
                                <div className={`flex items-center justify-between text-sm mb-2 ${labelClass}`}>
                                    <span>{text.eraserWidth}</span>
                                    <span>{eraserWidth}</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="50"
                                    value={eraserWidth}
                                    onChange={(e) => setEraserWidth(parseInt(e.target.value))}
                                    className={rangeClass}
                                    aria-label={text.eraserWidth}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
