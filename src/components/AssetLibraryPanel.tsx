import React, { useState, useEffect } from 'react';
import { Loader2, X, Trash2 } from 'lucide-react';
import { Language, t } from '../i18n/translations';

interface LibraryAsset {
    id: string;
    name: string;
    category: string;
    url: string;
    type: 'image' | 'video';
}

interface AssetLibraryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectAsset: (url: string, type: 'image' | 'video') => void;
    panelY?: number;
    variant?: 'panel' | 'modal';
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

const ASSET_CATEGORIES = [
    'all',
    'character',
    'scene',
    'item',
    'style',
    'soundEffect',
    'others'
] as const;

type AssetCategoryKey = typeof ASSET_CATEGORIES[number];

const CATEGORY_VALUE_MAP: Record<AssetCategoryKey, string> = {
    all: 'All',
    character: 'Character',
    scene: 'Scene',
    item: 'Item',
    style: 'Style',
    soundEffect: 'Sound Effect',
    others: 'Others'
};

export const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({
    isOpen,
    onClose,
    onSelectAsset,
    panelY = 100,
    variant = 'panel',
    canvasTheme = 'dark',
    language = 'zh'
}) => {
    const [selectedCategory, setSelectedCategory] = useState<AssetCategoryKey>('all');
    const [assets, setAssets] = useState<LibraryAsset[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLibrary();
        }
    }, [isOpen]);

    const fetchLibrary = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/library', { credentials: 'include' });
            if (res.ok) {
                setAssets(await res.json());
            }
        } catch (error) {
            console.error('Failed to load library:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAsset = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            const res = await fetch(`/api/library/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (res.ok) {
                setAssets(prev => prev.filter(a => a.id !== id));
            } else {
                console.error('Failed to delete asset');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    if (!isOpen) return null;

    const isDark = canvasTheme === 'dark';

    if (variant === 'modal') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm motion-modal-overlay-in">
                <div
                    className={`flex flex-col w-[800px] h-[600px] border rounded-xl shadow-[0_18px_44px_rgba(0,0,0,0.42)] overflow-hidden transition-colors duration-200 motion-modal-dialog-in ${
                        isDark ? 'bg-[#101210] border-neutral-800' : 'bg-white border-neutral-200'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                        <h2 className={`text-base font-semibold leading-5 ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                            {t(language, 'assets')}
                        </h2>

                        <button
                            onClick={onClose}
                            aria-label={t(language, 'closeAssetLibrary')}
                            className={`p-2 rounded-lg transition-[background-color,color,transform] duration-150 motion-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                                isDark
                                    ? 'hover:bg-[#1A1D1A] text-neutral-400 hover:text-neutral-100'
                                    : 'hover:bg-lime-50 text-neutral-500 hover:text-lime-600'
                            }`}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <AssetLibraryContent
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        assets={assets}
                        loading={loading}
                        onSelectAsset={onSelectAsset}
                        onDeleteAsset={handleDeleteAsset}
                        variant={variant}
                        canvasTheme={canvasTheme}
                        language={language}
                    />
                </div>

                <div className="absolute inset-0 -z-10" onClick={onClose} />
            </div>
        );
    }

    return (
        <div
            className={`fixed left-20 z-40 w-[700px] backdrop-blur-md border rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.34)] flex flex-col max-h-[500px] overflow-hidden motion-panel-in transition-[background-color,border-color,box-shadow] duration-200 ${
                isDark ? 'bg-[#101210]/96 border-neutral-800' : 'bg-white/95 border-neutral-200'
            }`}
            style={{ top: Math.min(window.innerHeight - 510, Math.max(20, panelY)) }}
        >
            <AssetLibraryContent
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                assets={assets}
                loading={loading}
                onSelectAsset={onSelectAsset}
                onDeleteAsset={handleDeleteAsset}
                variant={variant}
                canvasTheme={canvasTheme}
                language={language}
            />
        </div>
    );
};

interface AssetLibraryContentProps {
    selectedCategory: AssetCategoryKey;
    setSelectedCategory: (category: AssetCategoryKey) => void;
    assets: LibraryAsset[];
    loading: boolean;
    onSelectAsset: (url: string, type: 'image' | 'video') => void;
    onDeleteAsset: (id: string, e: React.MouseEvent) => void;
    variant?: 'panel' | 'modal';
    canvasTheme?: 'dark' | 'light';
    language: Language;
}

const AssetLibraryContent: React.FC<AssetLibraryContentProps> = ({
    selectedCategory,
    setSelectedCategory,
    assets,
    loading,
    onSelectAsset,
    onDeleteAsset,
    canvasTheme = 'dark',
    language
}) => {
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const isDark = canvasTheme === 'dark';

    const selectedCategoryValue = CATEGORY_VALUE_MAP[selectedCategory];

    const filteredAssets = assets.filter((asset: LibraryAsset) =>
        selectedCategory === 'all' || asset.category === selectedCategoryValue
    );

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteConfirmId(id);
    };

    const handleConfirmDelete = (e: React.MouseEvent, id: string) => {
        onDeleteAsset(id, e);
        setDeleteConfirmId(null);
    };

    const handleCancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteConfirmId(null);
    };

    return (
        <div className="p-4 flex flex-col gap-3 h-full overflow-hidden">
            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide shrink-0">
                {ASSET_CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`h-7 px-3 rounded-lg text-[11px] font-semibold leading-none whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 border motion-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                            selectedCategory === cat
                                ? isDark
                                    ? 'bg-[#D8FF00]/90 text-black border-[#D8FF00]/70'
                                    : 'bg-lime-600 text-white border-lime-600'
                                : isDark
                                    ? 'bg-[#151815] text-neutral-400 border-neutral-800 hover:bg-[#1A1D1A] hover:text-neutral-100 hover:border-[#D8FF00]/30'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100 hover:text-lime-600'
                        }`}
                        aria-pressed={selectedCategory === cat}
                    >
                        {t(language, cat)}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div
                className="flex-1 overflow-y-auto pr-2 grid gap-3 pb-4 content-start grid-cols-4"
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: isDark ? '#525252 #171717' : '#d4d4d4 #fafafa'
                }}
            >
                {loading ? (
                    <div className={`col-span-full flex flex-col items-center justify-center gap-2 py-10 rounded-lg border text-sm ${
                        isDark ? 'bg-[#151815] border-neutral-800 text-neutral-400' : 'bg-neutral-50 border-neutral-200 text-neutral-500'
                    }`}>
                        <Loader2 className={`animate-spin ${isDark ? 'text-[#D8FF00]' : 'text-lime-600'}`} size={22} />
                        <span>{t(language, 'loading')}</span>
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className={`col-span-full text-center py-10 rounded-lg border text-sm ${isDark ? 'bg-[#151815] border-neutral-800 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-500'}`}>
                        {t(language, 'noAssetsFound')}
                    </div>
                ) : (
                    filteredAssets.map((asset: LibraryAsset) => (
                        <div
                            key={asset.id}
                            className={`group relative aspect-square rounded-lg overflow-hidden border cursor-pointer transition-[border-color,background-color,opacity] duration-150 ${
                                isDark
                                    ? 'bg-[#151815] border-neutral-800 hover:border-[#D8FF00]/35'
                                    : 'bg-white border-neutral-200 hover:border-lime-500'
                            }`}
                            onClick={() => onSelectAsset(asset.url, asset.type)}
                        >
                            <img
                                src={asset.url}
                                alt={asset.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.onerror = null;
                                    target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48LcG9lyxpbmU+PC9zdmc+';
                                    target.classList.add('p-8', 'opacity-50');
                                }}
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                                <span className="text-neutral-100 text-[11px] font-semibold leading-4 truncate">
                                    {asset.name}
                                </span>
                            </div>

                            {/* Delete Button or Confirmation */}
                            {deleteConfirmId === asset.id ? (
                                <div
                                    className={`absolute inset-0 flex flex-col items-center justify-center gap-2 z-20 motion-fade-in ${isDark ? 'bg-black/80' : 'bg-white/92'}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                        {t(language, 'deleteAssetConfirm')}
                                    </span>

                                    <div className="flex gap-2">
                                        <button
                                            className="h-7 px-2 rounded-md bg-red-500 hover:bg-red-600 text-white text-[11px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                                            onClick={(e) => handleConfirmDelete(e, asset.id)}
                                            aria-label={`${t(language, 'delete')} ${asset.name}`}
                                        >
                                            {t(language, 'delete')}
                                        </button>

                                        <button
                                            className={`h-7 px-2 rounded-md text-[11px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${isDark ? 'bg-neutral-700 hover:bg-neutral-600 text-white' : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-900'}`}
                                            onClick={handleCancelDelete}
                                            aria-label={t(language, 'cancel')}
                                        >
                                            {t(language, 'cancel')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center bg-black/55 text-white rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] hover:bg-red-500/80 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                                    onClick={(e) => handleDeleteClick(e, asset.id)}
                                    aria-label={`${t(language, 'delete')} ${asset.name}`}
                                    title={t(language, 'delete')}
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
