/**
 * DrawingToolbar.tsx
 * 
 * Sub-toolbar for brush/eraser tools with settings panels.
 * Only visible when drawing mode is active.
 */

import React from 'react';
import { Language } from '../../../i18n/translations';

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
        brush: language === 'zh' ? '画笔' : 'Brush',
        eraser: language === 'zh' ? '橡皮擦' : 'Eraser',
        brushWidth: language === 'zh' ? '画笔粗细' : 'Brush Width',
        eraserWidth: language === 'zh' ? '橡皮擦大小' : 'Eraser Width',
        presetColors: language === 'zh' ? '预设颜色' : 'Preset Colors',
        customColor: language === 'zh' ? '自定义颜色' : 'Custom Color',
    };

    const toolbarClass = isDark
        ? 'bg-[#111111]/95 border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.45)]'
        : 'bg-white/95 border-neutral-200 shadow-[0_18px_45px_rgba(15,23,42,0.12)]';

    const panelClass = isDark
        ? 'bg-[#1a1a1a] border-neutral-800 shadow-2xl rounded-xl transition-all duration-200 animate-in fade-in zoom-in-95 duration-150'
        : 'bg-white border-neutral-200 shadow-2xl rounded-xl transition-all duration-200 animate-in fade-in zoom-in-95 duration-150';

    const labelClass = isDark ? 'text-neutral-300' : 'text-neutral-700';

    const rangeClass = isDark
        ? 'w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#D8FF00]'
        : 'w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-lime-600';

    const colorInputClass = isDark
        ? 'w-full h-10 rounded-lg cursor-pointer border border-neutral-700 bg-neutral-900 transition-all duration-200'
        : 'w-full h-10 rounded-lg cursor-pointer border border-neutral-200 bg-white transition-all duration-200';

    const getButtonClass = (active: boolean) => {
        if (active) {
            return isDark
                ? 'bg-[#D8FF00] text-black shadow-[0_0_14px_rgba(216,255,0,0.18)]'
                : 'bg-lime-600 text-white shadow-sm';
        }

        return isDark
            ? 'text-neutral-400 hover:bg-neutral-800 hover:text-[#D8FF00]'
            : 'hover:bg-neutral-100 text-neutral-500 hover:text-lime-600';
    };

    return (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50">
            <div
                className={`backdrop-blur-sm rounded-xl border px-2 py-1.5 flex items-center gap-1 transition-all duration-200 ${toolbarClass}`}
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
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(drawingTool === 'brush')}`}
                        title={text.brush}
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
                                            className={`w-8 h-8 rounded-lg border-2 transition-all duration-200 ${
                                                brushColor === color
                                                    ? isDark
                                                        ? 'border-white ring-2 ring-[#D8FF00] scale-110 shadow-[0_0_10px_rgba(216,255,0,0.25)]'
                                                        : 'border-white ring-2 ring-lime-600 scale-110 shadow-sm'
                                                    : isDark
                                                        ? 'border-transparent hover:border-neutral-500'
                                                        : 'border-transparent hover:border-neutral-300'
                                            }`}
                                            style={{ backgroundColor: color }}
                                            title={color}
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
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${getButtonClass(drawingTool === 'eraser')}`}
                        title={text.eraser}
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
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
