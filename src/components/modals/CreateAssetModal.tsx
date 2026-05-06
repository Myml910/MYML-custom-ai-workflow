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
            <div className={`${isDark ? 'bg-[#121212] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'} border rounded-2xl w-[600px] shadow-2xl overflow-hidden flex flex-col motion-modal-dialog-in`}>

                {/* Header */}
                <div className="px-6 pt-6 pb-2">
                    <div className={`flex items-center gap-6 border-b ${isDark ? 'border-neutral-700' : 'border-neutral-200'} pb-2`}>
                        <button className={`${isDark ? 'text-[#D8FF00] border-[#D8FF00]' : 'text-lime-600 border-lime-600'} font-medium border-b-2 pb-2 -mb-2.5`}>
                            {t(language, 'createAsset')}
                        </button>
                        <button
                            className={`${isDark ? 'text-neutral-500' : 'text-neutral-400'} font-medium pb-2 opacity-40 cursor-not-allowed`}
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
                                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 transition-colors ${isDark ? 'bg-[#1a1a1a] border-neutral-700 text-white focus:border-[#D8FF00] focus:ring-[#D8FF00]/30' : 'bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-lime-500 focus:ring-lime-500/25'}`}
                                placeholder={t(language, 'assetNamePlaceholder')}
                            />
                        </div>

                        {/* Category Dropdown */}
                        <div className="flex flex-col gap-2 relative">
                            <label className={`text-sm font-medium ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>{t(language, 'category')} <span className="text-red-400">*</span></label>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className={`w-full border rounded-lg px-3 py-2 focus:outline-none flex items-center justify-between transition-colors ${isDark ? 'bg-[#1a1a1a] border-neutral-700 text-white hover:bg-[#252525]' : 'bg-white border-neutral-300 text-neutral-900 hover:bg-neutral-50'}`}
                            >
                                <span>{t(language, activeCategory.labelKey)}</span>
                                <ChevronDown size={16} className={isDark ? 'text-neutral-400' : 'text-neutral-500'} />
                            </button>

                            {isDropdownOpen && (
                                <div className={`absolute top-[70px] left-0 right-0 border rounded-lg shadow-xl z-10 py-1 ${isDark ? 'bg-[#1a1a1a] border-neutral-700' : 'bg-white border-neutral-200'}`}>
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat.value}
                                            onClick={() => {
                                                setCategory(cat.value);
                                                setIsDropdownOpen(false);
                                            }}
                                            className={`w-full px-3 py-2 text-left flex items-center justify-between group ${isDark ? 'hover:bg-[#252525]' : 'hover:bg-neutral-100'}`}
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
                <div className={`p-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-200'} flex justify-end gap-2`}>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg transition-all duration-200 motion-press ${isDark ? 'text-neutral-400 hover:text-[#D8FF00] hover:bg-[#D8FF00]/10' : 'text-neutral-600 hover:text-lime-700 hover:bg-lime-50'}`}
                    >
                        {t(language, 'cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={status === 'saving' || status === 'success'}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all duration-200 ${status === 'saving' || status === 'success' ? '' : 'motion-press'} ${status === 'success' ? 'bg-green-600 text-white' :
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
