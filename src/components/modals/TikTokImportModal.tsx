/**
 * TikTokImportModal.tsx
 * 
 * Modal overlay for importing TikTok videos without watermark.
 * Allows users to paste a TikTok URL and download the video to the canvas.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, CheckCircle, AlertCircle, Link2 } from 'lucide-react';
import { Language, t } from '../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface TikTokImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVideoImported: (videoUrl: string, videoInfo: TikTokVideoInfo) => void;
    language?: Language;
    canvasTheme?: 'dark' | 'light';
}

export interface TikTokVideoInfo {
    title: string;
    author: string;
    duration: number;
    cover: string | null;
    trimmed: boolean;
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

// ============================================================================
// COMPONENT
// ============================================================================

export const TikTokImportModal: React.FC<TikTokImportModalProps> = ({
    isOpen,
    onClose,
    onVideoImported,
    language = 'zh',
    canvasTheme = 'dark'
}) => {
    // --- State ---
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<ImportStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [videoInfo, setVideoInfo] = useState<TikTokVideoInfo | null>(null);
    const [importedVideoUrl, setImportedVideoUrl] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);
    const isDark = canvasTheme === 'dark';
    const overlayClass = isDark ? 'bg-black/60' : 'bg-neutral-950/35';
    const dialogClass = isDark
        ? 'bg-[#151815] border-neutral-800 text-neutral-100'
        : 'bg-white border-neutral-200 text-neutral-900';
    const headerBorderClass = isDark ? 'border-neutral-800' : 'border-neutral-200';
    const headerIconClass = isDark ? 'bg-[#1A1D1A] border-neutral-800' : 'bg-neutral-100 border-neutral-200';
    const titleClass = isDark ? 'text-neutral-100' : 'text-neutral-900';
    const bodyTextClass = isDark ? 'text-neutral-300' : 'text-neutral-700';
    const helperTextClass = 'text-neutral-500';
    const closeHoverClass = isDark ? 'hover:bg-[#1A1D1A] hover:text-neutral-100' : 'hover:bg-neutral-100 hover:text-neutral-900';
    const secondaryButtonClass = isDark
        ? 'border-neutral-700 bg-[#151815] text-neutral-300 hover:border-neutral-600 hover:bg-[#1A1D1A] hover:text-neutral-100'
        : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950';
    const disabledPrimaryClass = isDark
        ? 'disabled:border-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-500'
        : 'disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400';

    // --- Effects ---

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setUrl('');
            setStatus('idle');
            setError(null);
            setVideoInfo(null);
            setImportedVideoUrl(null);
        }
    }, [isOpen]);

    // --- Event Handlers ---

    const handleImport = async () => {
        if (!url.trim()) {
            setError(t(language, 'enterTikTokUrlError'));
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            const response = await fetch('/api/tiktok/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ url: url.trim(), enableTrim: true })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t(language, 'failedImportVideoError'));
            }

            // Success!
            const info: TikTokVideoInfo = {
                title: data.title || t(language, 'tiktokVideoFallbackTitle'),
                author: data.author || t(language, 'unknownAuthor'),
                duration: data.duration || 0,
                cover: data.cover || null,
                trimmed: data.trimmed || false
            };

            setVideoInfo(info);
            setImportedVideoUrl(data.videoUrl);
            setStatus('success');

        } catch (err: any) {
            console.error('TikTok import error:', err);
            setError(err.message || t(language, 'failedImportVideoError'));
            setStatus('error');
        }
    };

    const handleAddToCanvas = () => {
        if (importedVideoUrl && videoInfo) {
            onVideoImported(importedVideoUrl, videoInfo);
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && status === 'idle') {
            handleImport();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    // --- Render ---

    if (!isOpen) return null;

    return (
        <div
            className={`fixed inset-0 ${overlayClass} backdrop-blur-sm z-50 flex items-center justify-center p-4 motion-modal-overlay-in`}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className={`border rounded-xl w-[500px] shadow-[0_18px_44px_rgba(0,0,0,0.18)] overflow-hidden motion-modal-dialog-in ${dialogClass}`}>

                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${headerBorderClass}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${headerIconClass}`}>
                            <svg className="w-5 h-5 text-[#D8FF00]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className={`text-base font-semibold leading-5 ${titleClass}`}>{t(language, 'importTikTokVideoTitle')}</h2>
                            <p className={`text-xs leading-4 ${helperTextClass}`}>{t(language, 'importTikTokDesc')}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={t(language, 'closeTikTokImportModal')}
                        className={`group flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${closeHoverClass}`}
                    >
                        <X size={18} className="transition-colors" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* URL Input */}
                    <div className="space-y-3">
                        <label className={`text-sm font-medium ${bodyTextClass}`}>
                            {t(language, 'tiktokVideoUrl')}
                        </label>
                        <div className="relative">
                            <Link2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t(language, 'pasteTikTokUrlPlaceholder')}
                                disabled={status === 'loading' || status === 'success'}
                                className={`w-full border rounded-lg pl-10 pr-4 py-3 placeholder-neutral-500 focus:outline-none focus:border-[#D8FF00]/60 focus:ring-2 focus:ring-[#D8FF00]/20 transition-[background-color,border-color,box-shadow,opacity] duration-150 disabled:cursor-not-allowed ${
                                    isDark
                                        ? 'bg-[#101210] border-neutral-700 text-neutral-100 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500'
                                        : 'bg-white border-neutral-200 text-neutral-900 disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400'
                                }`}
                            />
                        </div>
                        <p className="text-xs text-neutral-500">
                            {t(language, 'tiktokUrlSupportHint')}
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && status === 'error' && (
                        <div className="mt-4 p-3 bg-red-500/[0.08] border border-red-500/50 rounded-lg flex items-start gap-3">
                            <AlertCircle size={20} className="text-red-300 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-red-300">{error}</p>
                                <button
                                    onClick={() => {
                                        setStatus('idle');
                                        setError(null);
                                    }}
                                    className="text-xs text-red-300/70 hover:text-red-300 mt-1 underline transition-colors"
                                >
                                    {t(language, 'tryAgain')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {status === 'loading' && (
                        <div className="mt-6 flex flex-col items-center gap-3 py-4">
                            <Loader2 size={32} className="text-[#D8FF00] animate-spin" />
                            <p className={`${bodyTextClass} text-sm`}>{t(language, 'downloadingVideo')}</p>
                            <p className="text-neutral-500 text-xs">{t(language, 'mayTakeMoment')}</p>
                        </div>
                    )}

                    {/* Success State */}
                    {status === 'success' && videoInfo && importedVideoUrl && (
                        <div className="mt-6 space-y-4">
                            <div className="flex items-start gap-3 p-3 bg-emerald-500/[0.08] border border-emerald-500/40 rounded-lg">
                                <CheckCircle size={20} className="text-emerald-300 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-emerald-300 font-medium">{t(language, 'videoDownloadSuccess')}</p>
                                    <p className="text-xs text-neutral-400 mt-1 truncate" title={videoInfo.title}>
                                        {videoInfo.title}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        {t(language, 'byAuthor')} @{videoInfo.author} - {Math.round(videoInfo.duration)}s
                                        {videoInfo.trimmed && ` - ${t(language, 'trimmed')}`}
                                    </p>
                                </div>
                            </div>

                            {/* Video Preview */}
                            <div className={`${isDark ? 'bg-black' : 'bg-neutral-100'} aspect-video rounded-lg overflow-hidden`}>
                                <video
                                    src={importedVideoUrl}
                                    className="w-full h-full object-contain"
                                    controls
                                    autoPlay
                                    muted
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`flex flex-nowrap justify-end gap-2 border-t px-5 py-4 ${headerBorderClass} ${isDark ? 'bg-[#101210]' : 'bg-neutral-50'}`}>
                    <button
                        onClick={onClose}
                        className={`h-9 shrink-0 whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${secondaryButtonClass}`}
                    >
                        {t(language, 'cancel')}
                    </button>

                    {status === 'success' ? (
                        <button
                            onClick={handleAddToCanvas}
                            className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#D8FF00] px-5 text-sm font-semibold text-black transition-[background-color,opacity] duration-150 hover:bg-[#e4ff3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40"
                        >
                            <CheckCircle size={18} />
                            {t(language, 'addToCanvas')}
                        </button>
                    ) : (
                        <button
                            onClick={handleImport}
                            disabled={status === 'loading' || !url.trim()}
                            className={`flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#D8FF00] px-5 text-sm font-semibold text-black transition-[background-color,opacity] duration-150 hover:bg-[#e4ff3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:cursor-not-allowed disabled:border ${disabledPrimaryClass}`}
                        >
                            {status === 'loading' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    {t(language, 'importing')}
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    {t(language, 'importVideo')}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
