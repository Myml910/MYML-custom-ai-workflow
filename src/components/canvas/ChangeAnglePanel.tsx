/**
 * ChangeAnglePanel.tsx
 * 
 * Panel for adjusting image viewing angle with 3D orbit camera control.
 * Users drag balls on arcs to adjust rotation, tilt, and zoom.
 */

import React, { useState, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { OrbitCameraControl } from './OrbitCameraControl';

// ============================================================================
// TYPES
// ============================================================================

interface AngleSettings {
    rotation: number;  // -180 to 180 degrees
    tilt: number;      // -90 to 90 degrees
    zoom: number;      // -100 to 100
    wideAngle: boolean;
}

interface ChangeAnglePanelProps {
    imageUrl: string;
    settings: AngleSettings;
    onSettingsChange: (settings: AngleSettings) => void;
    onClose: () => void;
    onGenerate: () => void;
    isLoading?: boolean;
    canvasTheme?: 'dark' | 'light';
}

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS: AngleSettings = {
    rotation: 0,
    tilt: 0,
    zoom: 0,
    wideAngle: false
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ChangeAnglePanel: React.FC<ChangeAnglePanelProps> = ({
    imageUrl,
    settings,
    onSettingsChange,
    onClose,
    onGenerate,
    isLoading = false,
    canvasTheme = 'dark'
}) => {
    const isDark = canvasTheme === 'dark';
    const accentTextClass = isDark ? 'text-[#D8FF00]' : 'text-lime-600';
    const accentButtonClass = isDark
        ? 'bg-[#D8FF00] text-black hover:bg-[#e4ff3a] active:scale-[0.98] shadow-[0_0_18px_rgba(216,255,0,0.18)]'
        : 'bg-lime-600 text-white hover:bg-lime-500 active:scale-[0.98] shadow-[0_8px_18px_rgba(132,204,22,0.22)]';
    const iconButtonClass = isDark
        ? 'hover:bg-neutral-800 text-neutral-400 hover:text-[#D8FF00]'
        : 'hover:bg-lime-50 text-neutral-500 hover:text-lime-700';

    // --- Event Handlers ---
    const handleRotationChange = useCallback((value: number) => {
        onSettingsChange({ ...settings, rotation: value });
    }, [settings, onSettingsChange]);

    const handleTiltChange = useCallback((value: number) => {
        onSettingsChange({ ...settings, tilt: value });
    }, [settings, onSettingsChange]);

    const handleZoomChange = useCallback((value: number) => {
        onSettingsChange({ ...settings, zoom: value });
    }, [settings, onSettingsChange]);

    const handleReset = useCallback(() => {
        onSettingsChange(DEFAULT_SETTINGS);
    }, [onSettingsChange]);

    // --- Render ---
    return (
        <div
            className={`w-[500px] cursor-default rounded-xl border p-4 shadow-[0_18px_44px_rgba(0,0,0,0.34)] transition-[background-color,border-color,box-shadow] duration-150 ${isDark ? 'bg-[#151815] border-neutral-800' : 'bg-white border-neutral-200'}`}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    3D Camera Control
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        onClick={handleReset}
                        className={`flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs transition-[background-color,color,transform] duration-150 ${iconButtonClass}`}
                    >
                        <RotateCcw size={12} />
                        Reset
                    </button>
                    <button
                        onClick={onClose}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-150 ${iconButtonClass}`}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* 3D Orbit Camera Control */}
            <OrbitCameraControl
                imageUrl={imageUrl}
                rotation={settings.rotation}
                tilt={settings.tilt}
                zoom={settings.zoom}
                onRotationChange={handleRotationChange}
                onTiltChange={handleTiltChange}
                onZoomChange={handleZoomChange}
                canvasTheme={canvasTheme}
            />

            {/* Camera Distance / Zoom */}
            <div className={`mt-4 p-3 rounded-xl border ${isDark ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                        Camera Distance
                    </span>
                    <span className={`text-xs font-semibold ${accentTextClass}`}>
                        Zoom: {settings.zoom}
                    </span>
                </div>

                <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={settings.zoom}
                    onChange={(e) => handleZoomChange(Number(e.target.value))}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isDark ? 'bg-neutral-800 accent-[#D8FF00]' : 'bg-neutral-200 accent-lime-600'}`}
                />

                <div className={`flex items-center justify-between mt-2 text-[11px] ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                    <span>Farther</span>
                    <span>Same distance</span>
                    <span>Closer</span>
                </div>
            </div>

            {/* Generate Button */}
            <button
                onClick={onGenerate}
                disabled={isLoading}
                className={`group mt-4 flex h-10 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-lg text-sm font-semibold transition-[background-color,color,opacity,transform] duration-150 ${isLoading
                    ? 'bg-neutral-700/50 text-neutral-500 opacity-50 cursor-not-allowed'
                    : accentButtonClass
                    }`}
            >
                {isLoading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                        Generating...
                    </>
                ) : (
                    <>
                        <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                        Generate New Angle
                    </>
                )}
            </button>
        </div>
    );
};

export default ChangeAnglePanel;

