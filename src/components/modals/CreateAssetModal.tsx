import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { NodeData } from '../../types';
import { Language, t, TranslationKey } from '../../i18n/translations';

interface CreateAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodeToSnapshot: NodeData | null;
    onSave: (name: string, category: string) => Promise<void>;
    language?: Language;
    canvasTheme?: 'dark' | 'light';
}

const CATEGORIES: { value: string; labelKey: TranslationKey }[] = [
    { value: 'Character', labelKey: 'character' },
    { value: 'Scene', labelKey: 'scene' },
    { value: 'Item', labelKey: 'item' },
    { value: 'Style', labelKey: 'style' },
    { value: 'Sound Effect', labelKey: 'soundEffect' },
    { value: 'Others', labelKey: 'others' }
];

export const CreateAssetModal: React.FC<CreateAssetModalProps> = ({
    isOpen,
    onClose,
    nodeToSnapshot,
    onSave,
    language = 'zh',
    canvasTheme = 'dark'
}) => {
    const [name, setName] = useState(t(language, 'defaultAssetName'));
    const [category, setCategory] = useState(CATEGORIES[0].value);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const isDark = canvasTheme !== 'light';

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setStatus('idle');
            setName(t(language, 'defaultAssetName'));
            setCategory(CATEGORIES[0].value);
        }
    }, [isOpen, language]);

    if (!isOpen || !nodeToSnapshot) return null;

    const activeCategory = CATEGORIES.find(cat => cat.value === category) || CATEGORIES[0];

    const handleSubmit = async () => {
        if (!name.trim()) return;

        setStatus('saving');
        try {
            await onSave(name, category);
            setStatus('success');
            setTimeout(() => {
                onClose();
            }, 1000);
        } catch (e) {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 2000);
        }
    };

    return (
        <div className={`fixed inset-0 ${isDark ? 'bg-black/80' : 'bg-neutral-900/35'} backdrop-blur-sm z-50 flex items-center justify-center p-4 motion-modal-overlay-in`}>
            <div className={`${isDark ? 'bg-[#151815] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'} flex w-[600px] flex-col overflow-hidden rounded-xl border shadow-[0_18px_44px_rgba(0,0,0,0.32)] motion-modal-dialog-in`}>

                {/* Header */}
                <div className="px-6 pt-6 pb-2">
                    <div className={`flex flex-nowrap items-center gap-4 border-b ${isDark ? 'border-neutral-700' : 'border-neutral-200'} pb-2`}>
                        <button className={`${isDark ? 'text-[#D8FF00] border-[#D8FF00]' : 'text-lime-600 border-lime-600'} -mb-2.5 shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm font-semibold`}>
                            {t(language, 'createAsset')}
                        </button>
                        <button
                            className={`${isDark ? 'text-neutral-500' : 'text-neutral-400'} shrink-0 cursor-not-allowed whitespace-nowrap pb-2 text-sm font-medium opacity-40`}
                            disabled
                            title={t(language, 'comingSoon')}
                        >
                            {t(language, 'addToExisting')}
                        </button>
                    </div>
                </div>

                <div className="p-6 flex gap-6">
                    {/* Left: Cover Image */}
                    <div className="w-1/2 flex flex-col gap-2">
                        <label className={`text-sm font-medium ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>{t(language, 'cover')} <span className="text-red-400">*</span></label>
                        <div className={`aspect-[3/4] rounded-lg overflow-hidden border ${isDark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-neutral-100'} relative group`}>
                            <img
                                src={nodeToSnapshot.resultUrl || ''}
                                alt={t(language, 'cover')}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://placehold.co/400x600/1a1a1a/FFF?text=Error';
                                }}
                            />
                        </div>
                    </div>

                    {/* Right: Form */}
                    <div className="w-1/2 flex flex-col gap-6">

                        {/* Name Input */}
                        <div className="flex flex-col gap-2">
                            <label className={`text-sm font-medium ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>{t(language, 'name')} <span className="text-red-400">*</span></label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className={`h-9 w-full rounded-lg border px-3 text-sm transition-colors focus:outline-none focus:ring-1 ${isDark ? 'bg-[#101210] border-neutral-700 text-neutral-100 focus:border-[#D8FF00] focus:ring-[#D8FF00]/30' : 'bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-lime-500 focus:ring-lime-500/25'}`}
                                placeholder={t(language, 'assetNamePlaceholder')}
                            />
                        </div>

                        {/* Category Dropdown */}
                        <div className="flex flex-col gap-2 relative">
                            <label className={`text-sm font-medium ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>{t(language, 'category')} <span className="text-red-400">*</span></label>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-sm transition-colors focus:outline-none ${isDark ? 'bg-[#101210] border-neutral-700 text-neutral-100 hover:bg-[#1A1D1A]' : 'bg-white border-neutral-300 text-neutral-900 hover:bg-neutral-50'}`}
                            >
                                <span>{t(language, activeCategory.labelKey)}</span>
                                <ChevronDown size={16} className={isDark ? 'text-neutral-400' : 'text-neutral-500'} />
                            </button>

                            {isDropdownOpen && (
                                <div className={`absolute left-0 right-0 top-[70px] z-10 rounded-lg border py-1 shadow-[0_14px_32px_rgba(0,0,0,0.28)] ${isDark ? 'bg-[#151815] border-neutral-700' : 'bg-white border-neutral-200'}`}>
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat.value}
                                            onClick={() => {
                                                setCategory(cat.value);
                                                setIsDropdownOpen(false);
                                            }}
                                            className={`group flex h-8 w-full items-center justify-between px-3 text-left text-sm transition-colors ${isDark ? 'hover:bg-[#1A1D1A]' : 'hover:bg-neutral-100'}`}
                                        >
                                            <span className={isDark ? 'text-neutral-300 group-hover:text-white' : 'text-neutral-700 group-hover:text-neutral-950'}>{t(language, cat.labelKey)}</span>
                                            {category === cat.value && <Check size={14} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className={`flex flex-nowrap justify-end gap-2 border-t p-4 ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <button
                        onClick={onClose}
                        className={`h-9 shrink-0 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-[background-color,color,transform] duration-150 motion-press ${isDark ? 'text-neutral-400 hover:text-[#D8FF00] hover:bg-[#D8FF00]/10' : 'text-neutral-600 hover:text-lime-700 hover:bg-lime-50'}`}
                    >
                        {t(language, 'cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={status === 'saving' || status === 'success'}
                        className={`flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-5 text-sm font-semibold transition-[background-color,color,opacity,transform] duration-150 ${status === 'saving' || status === 'success' ? '' : 'motion-press'} ${status === 'success' ? 'bg-green-600 text-white' :
                                status === 'error' ? 'bg-red-600 text-white' :
                                    status === 'saving' ? 'bg-neutral-700 text-neutral-300' :
                                        'bg-[#D8FF00] hover:bg-[#e4ff3a] text-black'
                            }`}
                    >
                        {status === 'saving' && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {status === 'success' && <Check size={16} />}
                        {status === 'idle' && t(language, 'create')}
                        {status === 'saving' && t(language, 'saving')}
                        {status === 'success' && t(language, 'saved')}
                        {status === 'error' && t(language, 'failed')}
                    </button>
                </div>

            </div>
        </div>
    );
};
