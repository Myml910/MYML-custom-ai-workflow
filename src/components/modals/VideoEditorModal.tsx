/**
 * VideoEditorModal.tsx
 * 
 * Full-screen video editor modal with timeline trimming controls.
 * Allows users to set trim start/end points and export to library.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, Pause, Download, SkipBack, SkipForward } from 'lucide-react';
import { t, type Language } from '../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface VideoEditorModalProps {
    isOpen: boolean;
    nodeId: string | null;
    videoUrl?: string;
    initialTrimStart?: number;
    initialTrimEnd?: number;
    onClose: () => void;
    onExport: (nodeId: string, trimStart: number, trimEnd: number, videoUrl: string) => void;
}

// ============================================================================
// HELPER: Format time as MM:SS.ms
// ============================================================================

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const getCurrentLanguage = (): Language => {
    if (typeof window === 'undefined') return 'zh';
    return (localStorage.getItem('myml-language') as Language) || 'zh';
};

const getInferredTheme = (): 'dark' | 'light' => {
    if (typeof document === 'undefined') return 'dark';
    return document.querySelector('.bg-neutral-50.text-neutral-900') ? 'light' : 'dark';
};

// ============================================================================
// COMPONENT
// ============================================================================

export const VideoEditorModal: React.FC<VideoEditorModalProps> = ({
    isOpen,
    nodeId,
    videoUrl,
    initialTrimStart = 0,
    initialTrimEnd,
    onClose,
    onExport
}) => {
    // --- State ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [trimStart, setTrimStart] = useState(initialTrimStart);
    const [trimEnd, setTrimEnd] = useState(initialTrimEnd ?? 0);
    const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null);

    // --- Effects ---

    // Reset state when modal opens with new video
    useEffect(() => {
        if (isOpen && videoUrl) {
            setTrimStart(initialTrimStart);
            setCurrentTime(initialTrimStart);
            setIsPlaying(false);
            setDuration(0); // Reset duration to trigger re-detection
        }
    }, [isOpen, videoUrl, initialTrimStart]);

    // Load video duration - simplified effect
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isOpen || !videoUrl) return;

        const handleLoadedMetadata = () => {
            const dur = video.duration;
            console.log('[VideoEditor] Video metadata loaded, duration:', dur);
            if (dur && dur > 0 && !isNaN(dur)) {
                setDuration(dur);
                setTrimEnd(prev => prev === 0 ? dur : prev);
            }
        };

        const handleTimeUpdate = () => {
            const time = video.currentTime;
            setCurrentTime(time);
            // Loop within trim range (only if trimEnd is set)
            if (trimEnd > 0 && time >= trimEnd) {
                video.currentTime = trimStart;
                video.pause();
                setIsPlaying(false);
            }
        };

        // If video is already loaded, immediately get duration
        if (video.readyState >= 1 && video.duration > 0) {
            handleLoadedMetadata();
        }

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [isOpen, videoUrl, trimStart, trimEnd]);


    // --- Handlers ---

    const togglePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            video.pause();
        } else {
            // Start from trim start if at the end
            if (video.currentTime >= trimEnd || video.currentTime < trimStart) {
                video.currentTime = trimStart;
            }
            video.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying, trimStart, trimEnd]);

    const handleTimelineMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'playhead') => {
        e.preventDefault();
        setIsDragging(type);
    }, []);

    const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging || !timelineRef.current || !videoRef.current) return;

        const rect = timelineRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const time = (x / rect.width) * duration;

        if (isDragging === 'start') {
            const newStart = Math.max(0, Math.min(time, trimEnd - 0.1));
            setTrimStart(newStart);
            videoRef.current.currentTime = newStart;
            setCurrentTime(newStart);
        } else if (isDragging === 'end') {
            const newEnd = Math.max(trimStart + 0.1, Math.min(time, duration));
            setTrimEnd(newEnd);
        } else if (isDragging === 'playhead') {
            const newTime = Math.max(trimStart, Math.min(time, trimEnd));
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    }, [isDragging, duration, trimStart, trimEnd]);

    const handleTimelineMouseUp = useCallback(() => {
        setIsDragging(null);
    }, []);

    const handleExportClick = useCallback(() => {
        if (!nodeId || !videoUrl) return;
        onExport(nodeId, trimStart, trimEnd, videoUrl);
    }, [nodeId, videoUrl, trimStart, trimEnd, onExport]);

    const jumpToStart = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = trimStart;
            setCurrentTime(trimStart);
        }
    }, [trimStart]);

    const jumpToEnd = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = trimEnd - 0.1;
            setCurrentTime(trimEnd - 0.1);
        }
    }, [trimEnd]);

    // --- Render ---

    if (!isOpen) return null;

    const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
    const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
    const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const trimDuration = trimEnd - trimStart;
    const language = getCurrentLanguage();
    const isDark = getInferredTheme() === 'dark';
    const overlayClass = isDark ? 'bg-neutral-950/80' : 'bg-neutral-900/35';
    const shellClass = isDark
        ? 'bg-[#101210] border-neutral-800 text-neutral-100'
        : 'bg-white border-neutral-200 text-neutral-900';
    const panelClass = isDark ? 'bg-[#151815] border-neutral-800' : 'bg-neutral-50 border-neutral-200';
    const dividerClass = isDark ? 'border-neutral-800' : 'border-neutral-200';
    const mutedTextClass = isDark ? 'text-neutral-400' : 'text-neutral-600';
    const helperTextClass = isDark ? 'text-neutral-500' : 'text-neutral-500';
    const iconButtonClass = isDark
        ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';
    const secondaryButtonClass = isDark
        ? 'border-neutral-700 bg-[#1A1D1A] text-neutral-200 hover:bg-neutral-800'
        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100';
    const primaryButtonClass = isDark
        ? 'bg-[#D8FF00] text-neutral-950 hover:bg-[#c8ed00]'
        : 'bg-lime-600 text-neutral-50 hover:bg-lime-700';
    const timelineBaseClass = isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-200';
    const timelineTrackClass = isDark ? 'bg-neutral-800' : 'bg-neutral-200';

    return (
        <div
            className={`fixed inset-0 z-[9999] ${overlayClass} p-4 flex`}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
            onMouseLeave={handleTimelineMouseUp}
        >
            <div className={`${shellClass} border rounded-xl shadow-xl overflow-hidden flex flex-col w-full min-h-0`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b ${dividerClass}`}>
                    <h2 className="text-base font-semibold">{t(language, 'videoEditor')}</h2>
                    <button
                        onClick={onClose}
                        aria-label={t(language, 'closeVideoEditorModal')}
                        title={t(language, 'closeVideoEditorModal')}
                        className={`w-9 h-9 inline-flex items-center justify-center rounded-lg ${iconButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Main Content - scrollable to ensure timeline is visible */}
                <div className="flex-1 flex flex-col items-center p-8 gap-6 overflow-y-auto min-h-0">
                    {/* Video Preview - limit height to ensure timeline fits */}
                    {videoUrl ? (
                        <div className="relative w-full max-w-4xl flex-shrink-0">
                            <video
                                ref={videoRef}
                                src={videoUrl}
                                className={`w-full max-h-[50vh] object-contain rounded-lg border mx-auto ${panelClass}`}
                                onClick={togglePlayPause}
                                title={t(language, 'videoPreviewTitle')}
                            />
                            {/* Play/Pause Overlay */}
                            <button
                                type="button"
                                className="absolute inset-0 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 rounded-lg"
                                onClick={togglePlayPause}
                                aria-label={isPlaying ? t(language, 'pausePreview') : t(language, 'playPreview')}
                                title={isPlaying ? t(language, 'pausePreview') : t(language, 'playPreview')}
                            >
                                {!isPlaying && (
                                    <span className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-neutral-950/70 text-neutral-100' : 'bg-white/80 text-neutral-900'} border ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>
                                        <Play className="w-8 h-8 ml-1" />
                                    </span>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className={`${helperTextClass} text-center`}>
                            <p>{t(language, 'noVideoConnected')}</p>
                            <p className="text-sm mt-2">{t(language, 'connectVideoNodeToEdit')}</p>
                        </div>
                    )}

                    {/* Timeline Controls - show even while loading */}
                    {videoUrl && (
                        <div className="w-full max-w-4xl space-y-4 flex-shrink-0">
                            {/* Playback Controls */}
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={jumpToStart}
                                    aria-label={t(language, 'jumpToTrimStart')}
                                    title={t(language, 'jumpToTrimStart')}
                                    className={`w-9 h-9 inline-flex items-center justify-center rounded-lg ${iconButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                                >
                                    <SkipBack size={20} />
                                </button>
                                <button
                                    onClick={togglePlayPause}
                                    aria-label={isPlaying ? t(language, 'pausePreview') : t(language, 'playPreview')}
                                    title={isPlaying ? t(language, 'pausePreview') : t(language, 'playPreview')}
                                    className={`w-11 h-11 inline-flex items-center justify-center rounded-full ${primaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                                >
                                    {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
                                </button>
                                <button
                                    onClick={jumpToEnd}
                                    aria-label={t(language, 'jumpToTrimEnd')}
                                    title={t(language, 'jumpToTrimEnd')}
                                    className={`w-9 h-9 inline-flex items-center justify-center rounded-lg ${iconButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                                >
                                    <SkipForward size={20} />
                                </button>
                            </div>

                            <div
                                ref={timelineRef}
                                className={`relative h-16 border ${timelineBaseClass} rounded-lg cursor-pointer select-none`}
                                onMouseDown={(e) => handleTimelineMouseDown(e, 'playhead')}
                                role="slider"
                                aria-label={t(language, 'trimTimelineLabel')}
                                aria-valuemin={0}
                                aria-valuemax={duration}
                                aria-valuenow={currentTime}
                                aria-valuetext={formatTime(currentTime)}
                            >
                                {/* Full Duration Bar */}
                                <div className={`absolute inset-y-0 left-0 right-0 ${timelineTrackClass} rounded-lg`} />

                                {/* Selected Range */}
                                <div
                                    className="absolute inset-y-0 bg-[#D8FF00]/20 border-y-2 border-[#D8FF00]/70"
                                    style={{
                                        left: `${startPercent}%`,
                                        right: `${100 - endPercent}%`
                                    }}
                                />

                                {/* Start Handle */}
                                <div
                                    className="absolute top-0 bottom-0 w-3 bg-emerald-500 cursor-ew-resize flex items-center justify-center rounded-l-lg hover:bg-emerald-400 transition-colors duration-150"
                                    style={{ left: `calc(${startPercent}% - 6px)` }}
                                    onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'start'); }}
                                    role="slider"
                                    aria-label={t(language, 'trimStartHandle')}
                                    aria-valuemin={0}
                                    aria-valuemax={duration}
                                    aria-valuenow={trimStart}
                                    aria-valuetext={formatTime(trimStart)}
                                >
                                    <div className="w-0.5 h-8 bg-emerald-100 rounded" />
                                </div>

                                {/* End Handle */}
                                <div
                                    className="absolute top-0 bottom-0 w-3 bg-red-500 cursor-ew-resize flex items-center justify-center rounded-r-lg hover:bg-red-400 transition-colors duration-150"
                                    style={{ left: `calc(${endPercent}% - 6px)` }}
                                    onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, 'end'); }}
                                    role="slider"
                                    aria-label={t(language, 'trimEndHandle')}
                                    aria-valuemin={0}
                                    aria-valuemax={duration}
                                    aria-valuenow={trimEnd}
                                    aria-valuetext={formatTime(trimEnd)}
                                >
                                    <div className="w-0.5 h-8 bg-red-100 rounded" />
                                </div>

                                {/* Playhead */}
                                <div
                                    className={`absolute top-0 bottom-0 w-0.5 ${isDark ? 'bg-neutral-100' : 'bg-neutral-900'}`}
                                    style={{ left: `${playheadPercent}%` }}
                                    aria-label={t(language, 'playheadHandle')}
                                >
                                    <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 ${isDark ? 'bg-neutral-100' : 'bg-neutral-900'} rounded-full`} />
                                </div>
                            </div>

                            {/* Time Display */}
                            <div className={`flex justify-between text-sm ${mutedTextClass}`}>
                                <span className="text-emerald-500">{t(language, 'start')}: {formatTime(trimStart)}</span>
                                <span>{t(language, 'current')}: {formatTime(currentTime)}</span>
                                <span className="text-red-500">{t(language, 'end')}: {formatTime(trimEnd)}</span>
                            </div>

                            {/* Trim Duration */}
                            <div className={`text-center ${helperTextClass} text-sm`}>
                                {t(language, 'selectedDuration')}: <span className={isDark ? 'text-[#D8FF00] font-medium' : 'text-lime-700 font-medium'}>{formatTime(trimDuration)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`flex items-center justify-end gap-2 px-6 py-4 border-t ${dividerClass}`}>
                    <button
                        onClick={onClose}
                        className={`h-9 px-4 rounded-lg border text-sm font-semibold ${secondaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                    >
                        {t(language, 'cancel')}
                    </button>
                    <button
                        onClick={handleExportClick}
                        disabled={!videoUrl}
                        className={`h-9 px-5 rounded-lg text-sm font-semibold flex items-center gap-2 ${primaryButtonClass} disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                    >
                        <Download size={18} />
                        {t(language, 'exportToLibrary')}
                    </button>
                </div>
            </div>
        </div>
    );
};
