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
            const res = await fetch('/api/library');
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
                method: 'DELETE'
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm motion-modal-overlay-in">
                <div
                    className={`flex flex-col w-[800px] h-[600px] border rounded-2xl shadow-2xl overflow-hidden transition-colors duration-300 motion-modal-dialog-in ${
                        isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                        <h2 className={`text-lg font-medium pl-2 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                            {t(language, 'assets')}
                        </h2>

                        <button
                            onClick={onClose}
                            className={`p-2 rounded-lg transition-all duration-200 motion-press ${
                                isDark
                                    ? 'hover:bg-[#D8FF00]/10 text-neutral-400 hover:text-[#D8FF00]'
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
            className={`fixed left-20 z-40 w-[700px] backdrop-blur-xl border rounded-2xl shadow-2xl flex flex-col max-h-[500px] overflow-hidden motion-panel-in transition-colors ${
                isDark ? 'bg-[#0a0a0a]/95 border-neutral-800' : 'bg-white/95 border-neutral-200'
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
        <div className="p-4 flex flex-col gap-4 h-full overflow-hidden">
            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide shrink-0">
                {ASSET_CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border motion-press ${
                            selectedCategory === cat
                                ? isDark
                                    ? 'bg-[#D8FF00] text-black border-[#D8FF00]'
                                    : 'bg-lime-600 text-white border-lime-600'
                                : isDark
                                    ? 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-[#D8FF00]'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100 hover:text-lime-600'
                        }`}
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
                    <div className={`col-span-full flex flex-col items-center justify-center gap-2 py-10 text-sm ${
                        isDark ? 'text-neutral-400' : 'text-neutral-500'
                    }`}>
                        <Loader2 className={`animate-spin ${isDark ? 'text-[#D8FF00]' : 'text-lime-600'}`} size={22} />
                        <span>{language === 'zh' ? '加载中...' : 'Loading...'}</span>
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-neutral-500 text-sm">
                        {t(language, 'noAssetsFound')}
                    </div>
                ) : (
                    filteredAssets.map((asset: LibraryAsset) => (
                        <div
                            key={asset.id}
                            className={`group relative aspect-square rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 ${
                                isDark
                                    ? 'bg-neutral-900 border-neutral-800 hover:border-[#D8FF00]/50'
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

                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none">
                                <span className="text-white text-xs font-medium truncate">
                                    {asset.name}
                                </span>
                            </div>

                            {/* Delete Button or Confirmation */}
                            {deleteConfirmId === asset.id ? (
                                <div
                                    className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 z-20 motion-fade-in"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <span className="text-white text-xs font-medium">
                                        {t(language, 'deleteAssetConfirm')}
                                    </span>

                                    <div className="flex gap-2">
                                        <button
                                            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
                                            onClick={(e) => handleConfirmDelete(e, asset.id)}
                                        >
                                            {t(language, 'delete')}
                                        </button>

                                        <button
                                            className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded transition-colors"
                                            onClick={handleCancelDelete}
                                        >
                                            {t(language, 'cancel')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    className="absolute top-1 right-1 p-1.5 bg-black/60 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 z-10"
                                    onClick={(e) => handleDeleteClick(e, asset.id)}
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
