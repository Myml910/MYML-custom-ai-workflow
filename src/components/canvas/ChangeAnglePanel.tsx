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
            className={`p-4 rounded-2xl shadow-2xl cursor-default w-[500px] transition-all duration-200 ${isDark ? 'bg-[#111111] border border-neutral-800' : 'bg-white border border-neutral-200'}`}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    3D Camera Control
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-all duration-200 ${iconButtonClass}`}
                    >
                        <RotateCcw size={12} />
                        Reset
                    </button>
                    <button
                        onClick={onClose}
                        className={`p-1.5 rounded-lg transition-all duration-200 ${iconButtonClass}`}
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
                className={`group w-full mt-4 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2.5 transition-all duration-200 ${isLoading
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

