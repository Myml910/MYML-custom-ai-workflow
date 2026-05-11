/**
 * TikTokImportModal.tsx
 * 
 * Modal overlay for importing TikTok videos without watermark.
 * Allows users to paste a TikTok URL and download the video to the canvas.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, CheckCircle, AlertCircle, Link2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface TikTokImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVideoImported: (videoUrl: string, videoInfo: TikTokVideoInfo) => void;
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
    onVideoImported
}) => {
    // --- State ---
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<ImportStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [videoInfo, setVideoInfo] = useState<TikTokVideoInfo | null>(null);
    const [importedVideoUrl, setImportedVideoUrl] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);

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
            setError('Please enter a TikTok URL');
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
                throw new Error(data.error || 'Failed to import video');
            }

            // Success!
            const info: TikTokVideoInfo = {
                title: data.title || 'TikTok Video',
                author: data.author || 'Unknown',
                duration: data.duration || 0,
                cover: data.cover || null,
                trimmed: data.trimmed || false
            };

            setVideoInfo(info);
            setImportedVideoUrl(data.videoUrl);
            setStatus('success');

        } catch (err: any) {
            console.error('TikTok import error:', err);
            setError(err.message || 'Failed to import video');
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 motion-modal-overlay-in"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#151815] border border-neutral-800 rounded-xl w-[500px] shadow-[0_18px_44px_rgba(0,0,0,0.42)] overflow-hidden motion-modal-dialog-in">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#1A1D1A] border border-neutral-800 flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#D8FF00]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-semibold leading-5 text-neutral-100">Import TikTok Video</h2>
                            <p className="text-xs leading-4 text-neutral-500">Download without watermark</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close TikTok import modal"
                        className="group flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-[background-color,color] duration-150 hover:bg-[#1A1D1A] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                    >
                        <X size={18} className="transition-colors" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* URL Input */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-neutral-300">
                            TikTok Video URL
                        </label>
                        <div className="relative">
                            <Link2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Paste TikTok video URL here (Ctrl+V)"
                                disabled={status === 'loading' || status === 'success'}
                                className="w-full bg-[#101210] border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-[#D8FF00]/60 focus:ring-2 focus:ring-[#D8FF00]/20 transition-[background-color,border-color,box-shadow,opacity] duration-150 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                            />
                        </div>
                        <p className="text-xs text-neutral-500">
                            Supports tiktok.com, vm.tiktok.com, and vt.tiktok.com links
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
                                    Try again
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {status === 'loading' && (
                        <div className="mt-6 flex flex-col items-center gap-3 py-4">
                            <Loader2 size={32} className="text-[#D8FF00] animate-spin" />
                            <p className="text-neutral-400 text-sm">Downloading video...</p>
                            <p className="text-neutral-500 text-xs">This may take a moment</p>
                        </div>
                    )}

                    {/* Success State */}
                    {status === 'success' && videoInfo && importedVideoUrl && (
                        <div className="mt-6 space-y-4">
                            <div className="flex items-start gap-3 p-3 bg-emerald-500/[0.08] border border-emerald-500/40 rounded-lg">
                                <CheckCircle size={20} className="text-emerald-300 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-emerald-300 font-medium">Video downloaded successfully!</p>
                                    <p className="text-xs text-neutral-400 mt-1 truncate" title={videoInfo.title}>
                                        {videoInfo.title}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        By @{videoInfo.author} - {Math.round(videoInfo.duration)}s
                                        {videoInfo.trimmed && ' - Trimmed'}
                                    </p>
                                </div>
                            </div>

                            {/* Video Preview */}
                            <div className="aspect-video bg-black rounded-lg overflow-hidden">
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
                <div className="px-5 py-4 border-t border-neutral-800 bg-[#101210] flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="h-9 px-4 rounded-lg border border-neutral-700 bg-[#151815] text-sm font-medium text-neutral-300 transition-[background-color,border-color,color] duration-150 hover:border-neutral-600 hover:bg-[#1A1D1A] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                    >
                        Cancel
                    </button>

                    {status === 'success' ? (
                        <button
                            onClick={handleAddToCanvas}
                            className="flex h-9 items-center gap-2 px-5 bg-[#D8FF00] hover:bg-[#e4ff3a] text-black text-sm font-semibold rounded-lg transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40"
                        >
                            <CheckCircle size={18} />
                            Add to Canvas
                        </button>
                    ) : (
                        <button
                            onClick={handleImport}
                            disabled={status === 'loading' || !url.trim()}
                            className="flex h-9 items-center gap-2 px-5 bg-[#D8FF00] hover:bg-[#e4ff3a] text-black text-sm font-semibold rounded-lg transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:cursor-not-allowed disabled:border disabled:border-neutral-700 disabled:bg-neutral-800 disabled:text-neutral-500"
                        >
                            {status === 'loading' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Import Video
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
