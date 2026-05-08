/**
 * HistoryPanel.tsx
 *
 * Panel for browsing generated image and video history.
 * Assets are grouped by date and displayed in a grid.
 * Clicking an asset applies it to the selected node.
 *
 * Uses infinite scroll with pagination for performance.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Trash2, Maximize2, Minimize2, Image as ImageIcon, Video } from 'lucide-react';
import { Language, t } from '../i18n/translations';

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE = 18; // 6 columns × 3 rows

// ============================================================================
// TYPES
// ============================================================================

interface AssetMetadata {
    id: string;
    filename: string;
    prompt: string;
    createdAt: string;
    type: string;
    url: string;
    model?: string;
}

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectAsset: (type: 'images' | 'videos', url: string, prompt: string, model?: string) => void;
    panelY?: number;
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
    isOpen,
    onClose,
    onSelectAsset,
    panelY = 200,
    canvasTheme = 'dark',
    language = 'zh'
}) => {
    const [activeTab, setActiveTab] = useState<'images' | 'videos'>('images');
    const [assets, setAssets] = useState<AssetMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [imageTotalCount, setImageTotalCount] = useState<number>(0);
    const [videoTotalCount, setVideoTotalCount] = useState<number>(0);
    const [isExpanded, setIsExpanded] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

    const isDark = canvasTheme === 'dark';

    useEffect(() => {
        if (isOpen) {
            setAssets([]);
            setOffset(0);
            setHasMore(true);
            fetchAssets(0, true);
            fetchCounts();
        } else {
            setIsExpanded(false);
        }
    }, [isOpen, activeTab]);

    const fetchCounts = async () => {
        try {
            const [imgRes, vidRes] = await Promise.all([
                fetch('/api/assets/images?limit=1', { credentials: 'include' }),
                fetch('/api/assets/videos?limit=1', { credentials: 'include' })
            ]);

            if (imgRes.ok) {
                const imgData = await imgRes.json();
                setImageTotalCount(imgData.total);
            }

            if (vidRes.ok) {
                const vidData = await vidRes.json();
                setVideoTotalCount(vidData.total);
            }
        } catch (error) {
            console.error('Failed to fetch asset counts:', error);
        }
    };

    useEffect(() => {
        if (!loadMoreTriggerRef.current || loading) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const target = entries[0];
                if (target.isIntersecting && hasMore && !loadingMore && !loading) {
                    loadMoreAssets();
                }
            },
            { threshold: 0.1, root: scrollContainerRef.current }
        );

        observer.observe(loadMoreTriggerRef.current);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, offset, isExpanded]);

    const fetchAssets = async (pageOffset: number, isInitial: boolean = false) => {
        if (isInitial) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const response = await fetch(
                `/api/assets/${activeTab}?limit=${PAGE_SIZE}&offset=${pageOffset}`,
                { credentials: 'include' }
            );

            if (response.ok) {
                const data = await response.json();

                if (isInitial) {
                    setAssets(data.assets);
                } else {
                    setAssets(prev => [...prev, ...data.assets]);
                }

                setHasMore(data.hasMore);
                setOffset(pageOffset + data.assets.length);

                if (activeTab === 'images') {
                    setImageTotalCount(data.total);
                } else {
                    setVideoTotalCount(data.total);
                }
            }
        } catch (error) {
            console.error('Failed to fetch assets:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMoreAssets = useCallback(() => {
        if (!loadingMore && hasMore) {
            fetchAssets(offset, false);
        }
    }, [offset, loadingMore, hasMore, activeTab]);

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/assets/${activeTab}/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                setAssets(prev => prev.filter(a => a.id !== id));

                if (activeTab === 'images') {
                    setImageTotalCount(prev => prev - 1);
                } else {
                    setVideoTotalCount(prev => prev - 1);
                }
            }
        } catch (error) {
            console.error('Failed to delete asset:', error);
        }

        setDeleteConfirm(null);
    };

    const handleSelectAsset = (asset: AssetMetadata) => {
        const fullUrl = asset.url;
        onSelectAsset(activeTab, fullUrl, asset.prompt || '', asset.model);
    };

    const groupedAssets = assets.reduce((groups, asset) => {
        const date = new Date(asset.createdAt).toLocaleDateString('en-CA');

        if (!groups[date]) {
            groups[date] = [];
        }

        groups[date].push(asset);
        return groups;
    }, {} as Record<string, AssetMetadata[]>);

    const sortedDates = Object.keys(groupedAssets).sort((a, b) =>
        new Date(b).getTime() - new Date(a).getTime()
    );

    if (!isOpen) return null;

    return (
        <>
            {/* Main Panel */}
            <div
                className={`fixed backdrop-blur-md border rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.34)] z-40 flex flex-col overflow-hidden motion-panel-in transition-[background-color,border-color,box-shadow] duration-200 ${
                    isExpanded
                        ? 'left-24 right-24 top-20 bottom-20 max-h-none'
                        : 'left-20 w-[700px] max-h-[500px]'
                } ${
                    isDark
                        ? 'bg-[#101210]/96 border-neutral-800'
                        : 'bg-white/95 border-neutral-200'
                }`}
                style={isExpanded ? undefined : { top: panelY }}
            >
                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <div className="flex items-center gap-6">
                        <button
                            className={`text-sm font-medium transition-colors duration-150 pb-1 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                                activeTab === 'images'
                                    ? isDark
                                        ? 'text-[#D8FF00] border-b border-[#D8FF00]/70'
                                        : 'text-lime-600 border-b border-lime-600'
                                    : isDark
                                        ? 'text-neutral-500 hover:text-white'
                                        : 'text-neutral-400 hover:text-neutral-900'
                            }`}
                            onClick={() => setActiveTab('images')}
                        >
                            <ImageIcon size={16} />
                            {t(language, 'imageHistory')} ({imageTotalCount})
                        </button>

                        <button
                            className={`text-sm font-medium transition-colors duration-150 pb-1 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                                activeTab === 'videos'
                                    ? isDark
                                        ? 'text-[#D8FF00] border-b border-[#D8FF00]/70'
                                        : 'text-lime-600 border-b border-lime-600'
                                    : isDark
                                        ? 'text-neutral-500 hover:text-white'
                                        : 'text-neutral-400 hover:text-neutral-900'
                            }`}
                            onClick={() => setActiveTab('videos')}
                        >
                            <Video size={16} />
                            {t(language, 'videoHistory')} ({videoTotalCount})
                        </button>
                    </div>

                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        aria-label={isExpanded ? 'Collapse history panel' : 'Expand history panel'}
                        aria-expanded={isExpanded}
                        className={`p-2 rounded-lg transition-[background-color,color,transform] duration-150 motion-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                            isDark
                                ? 'text-neutral-500 hover:text-neutral-100 hover:bg-[#1A1D1A]'
                                : 'text-neutral-400 hover:text-lime-600 hover:bg-lime-50'
                        }`}
                        title={isExpanded ? 'Collapse panel' : 'Expand panel'}
                    >
                        {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                </div>

                {/* Content */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto p-4"
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: isDark ? '#525252 #171717' : '#d4d4d4 #fafafa'
                    }}
                >
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className={`animate-spin ${isDark ? 'text-[#D8FF00]' : 'text-lime-600'}`} size={24} />
                        </div>
                    ) : assets.length === 0 ? (
                        <div className={`flex flex-col items-center justify-center h-40 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                            <div className={`w-16 h-16 rounded-lg flex items-center justify-center mb-3 ${isDark ? 'bg-[#151815] border border-neutral-800' : 'bg-neutral-100'}`}>
                                {activeTab === 'images' ? <ImageIcon size={24} /> : <Video size={24} />}
                            </div>

                            <p>
                                {activeTab === 'images'
                                    ? t(language, 'noImagesFound')
                                    : t(language, 'noVideosFound')}
                            </p>

                            <p className="text-xs mt-1">
                                {activeTab === 'images'
                                    ? t(language, 'generatedImagesAppearHere')
                                    : t(language, 'generatedVideosAppearHere')}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {sortedDates.map(date => (
                                <div key={date}>
                                    <h3 className={`text-sm mb-3 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                                        {date}
                                    </h3>

                                    <div className={`grid gap-3 ${isExpanded ? 'grid-cols-5' : 'grid-cols-3'}`}>
                                        {groupedAssets[date].map(asset => (
                                            <div
                                                key={asset.id}
                                                onClick={() => handleSelectAsset(asset)}
                                                className={`aspect-square rounded-lg overflow-hidden cursor-pointer transition-[border-color,background-color,opacity,transform] duration-150 active:scale-[0.99] group relative border ${
                                                    isDark
                                                        ? 'bg-[#151815] border-neutral-800 hover:border-[#D8FF00]/35'
                                                        : 'bg-white border-neutral-200 hover:border-lime-500'
                                                }`}
                                            >
                                                {activeTab === 'images' ? (
                                                    <img
                                                        src={asset.url}
                                                        alt={asset.prompt || t(language, 'generatedImage')}
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <video
                                                        src={asset.url}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        preload="metadata"
                                                        onMouseEnter={(e) => e.currentTarget.play()}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.pause();
                                                            e.currentTarget.currentTime = 0;
                                                        }}
                                                    />
                                                )}

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteConfirm(asset.id);
                                                    }}
                                                    aria-label={t(language, 'delete')}
                                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                                                    title={t(language, 'delete')}
                                                >
                                                    <Trash2 size={14} className="text-white" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {hasMore && (
                                <div
                                    ref={loadMoreTriggerRef}
                                    className="flex items-center justify-center py-4"
                                >
                                    {loadingMore && (
                                        <Loader2 className={`animate-spin ${isDark ? 'text-[#D8FF00]' : 'text-lime-600'}`} size={20} />
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 motion-modal-overlay-in">
                    <div className={`border rounded-xl p-6 w-[340px] shadow-[0_18px_44px_rgba(0,0,0,0.42)] motion-modal-dialog-in ${isDark ? 'bg-[#101210] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                        <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                            {t(language, 'deleteAsset')}
                        </h3>

                        <p className={`text-sm mb-6 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                            {t(language, 'deleteAssetConfirm')}
                        </p>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className={`px-4 py-2 rounded-lg text-sm transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                                    isDark
                                        ? 'bg-[#151815] hover:bg-[#1A1D1A] text-white border border-neutral-800'
                                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                                }`}
                            >
                                {t(language, 'cancel')}
                            </button>

                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                            >
                                {t(language, 'delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
