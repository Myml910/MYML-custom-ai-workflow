/**
 * DrawingToolbar.tsx
 *
 * Sub-toolbar for brush/eraser tools with settings panels.
 * Only visible when drawing mode is active.
 */

import React from 'react';
import { t, type Language } from '../../../i18n/translations';
import { ToolButton, ToolGroup } from '../../ui';

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

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
    canvasTheme: _canvasTheme = 'dark',
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
    const text = {
        brush: t(language, 'brush'),
        eraser: t(language, 'eraser'),
        brushWidth: t(language, 'brushWidth'),
        eraserWidth: t(language, 'eraserWidth'),
        presetColors: t(language, 'presetColors'),
        presetColorOption: t(language, 'presetColorOption'),
        customColor: t(language, 'customColor'),
    };

    const panelClass = 'rounded-[var(--myml-radius-panel)] border border-[var(--myml-editor-toolbar-border)] bg-[var(--myml-editor-toolbar)] shadow-[var(--myml-shadow-floating)] transition-[opacity,transform] duration-[var(--myml-motion-base)] motion-menu-in';
    const labelClass = 'text-[var(--myml-text-secondary)]';
    const rangeClass = 'h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--myml-editor-control)] accent-[var(--myml-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45';
    const colorInputClass = 'h-10 w-full cursor-pointer rounded-[var(--myml-radius-control)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-input)] transition-colors duration-[var(--myml-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45';

    return (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50">
            <ToolGroup>
                <div className="relative">
                    <ToolButton
                        onClick={() => {
                            setDrawingTool('brush');
                            if (drawingTool === 'brush') {
                                setShowToolSettings(!showToolSettings);
                            } else {
                                setShowToolSettings(true);
                            }
                        }}
                        active={drawingTool === 'brush'}
                        title={text.brush}
                        aria-label={text.brush}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                    </ToolButton>

                    {showToolSettings && drawingTool === 'brush' && (
                        <div className={`absolute left-1/2 top-full z-50 mt-2 min-w-[220px] -translate-x-1/2 p-4 ${panelClass}`}>
                            <div className="mb-4">
                                <div className={`mb-2 flex items-center justify-between gap-4 text-sm ${labelClass}`}>
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

                            <div className="mb-3">
                                <div className={`mb-2 text-sm ${labelClass}`}>{text.presetColors}</div>
                                <div className="flex gap-2">
                                    {presetColors.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => setBrushColor(color)}
                                            className={`w-8 h-8 rounded-lg border-2 transition-[border-color,box-shadow] duration-[var(--myml-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${
                                                brushColor === color
                                                    ? 'border-[var(--myml-text-primary)] ring-2 ring-[var(--myml-focus-ring)]'
                                                    : 'border-transparent hover:border-[var(--myml-border-default)]'
                                            }`}
                                            style={{ backgroundColor: color }}
                                            title={`${text.presetColorOption}: ${color}`}
                                            aria-label={`${text.presetColorOption}: ${color}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className={`mb-2 text-sm ${labelClass}`}>{text.customColor}</div>
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

                <div className="relative">
                    <ToolButton
                        onClick={() => {
                            setDrawingTool('eraser');
                            if (drawingTool === 'eraser') {
                                setShowToolSettings(!showToolSettings);
                            } else {
                                setShowToolSettings(true);
                            }
                        }}
                        active={drawingTool === 'eraser'}
                        title={text.eraser}
                        aria-label={text.eraser}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                            <path d="M22 21H7" />
                            <path d="m5 11 9 9" />
                        </svg>
                    </ToolButton>

                    {showToolSettings && drawingTool === 'eraser' && (
                        <div className={`absolute left-1/2 top-full z-50 mt-2 min-w-[220px] -translate-x-1/2 p-4 ${panelClass}`}>
                            <div>
                                <div className={`mb-2 flex items-center justify-between gap-4 text-sm ${labelClass}`}>
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
            </ToolGroup>
        </div>
    );
};
