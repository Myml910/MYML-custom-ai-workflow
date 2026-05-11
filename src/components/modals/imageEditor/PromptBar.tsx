/**
 * PromptBar.tsx
 *
 * Prompt input bar with model, aspect ratio, and resolution dropdowns.
 * Contains batch count controls and generate button.
 */

import React, { useRef, useEffect } from 'react';
import { ChevronDown, Check, Banana, Image as ImageIcon, Crop, Monitor } from 'lucide-react';
import { ImageModel, IMAGE_MODELS } from './imageEditor.types';
import { OpenAIIcon, KlingIcon } from '../../icons/BrandIcons';
import { t, type Language } from '../../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface PromptBarProps {
    canvasTheme?: 'dark' | 'light';
    language?: Language;

    // Prompt state
    prompt: string;
    setPrompt: (prompt: string) => void;

    // Model state
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    showModelDropdown: boolean;
    setShowModelDropdown: (show: boolean) => void;

    // Aspect ratio state
    selectedAspectRatio: string;
    onAspectChange: (ratio: string) => void;
    showAspectDropdown: boolean;
    setShowAspectDropdown: (show: boolean) => void;

    // Resolution state
    selectedResolution: string;
    onResolutionChange: (res: string) => void;
    showResolutionDropdown: boolean;
    setShowResolutionDropdown: (show: boolean) => void;

    // Batch count
    batchCount: number;
    setBatchCount: (count: number) => void;

    // Actions
    onGenerate: () => void;

    // Flags
    hasInputImage: boolean;
    isGenerating?: boolean;
    promptError?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PromptBar: React.FC<PromptBarProps> = ({
    canvasTheme = 'dark',
    language = 'zh',
    prompt,
    setPrompt,
    selectedModel,
    onModelChange,
    showModelDropdown,
    setShowModelDropdown,
    selectedAspectRatio,
    onAspectChange,
    showAspectDropdown,
    setShowAspectDropdown,
    selectedResolution,
    onResolutionChange,
    showResolutionDropdown,
    setShowResolutionDropdown,
    batchCount,
    setBatchCount,
    onGenerate,
    hasInputImage,
    isGenerating = false,
    promptError
}) => {
    // --- Refs ---
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const aspectDropdownRef = useRef<HTMLDivElement>(null);
    const resolutionDropdownRef = useRef<HTMLDivElement>(null);

    // --- Derived State ---
    const currentModel = IMAGE_MODELS.find(m => m.id === selectedModel) || IMAGE_MODELS[0];
    const availableModels = hasInputImage
        ? IMAGE_MODELS.filter(m => m.supportsImageToImage)
        : IMAGE_MODELS;

    const isDark = canvasTheme === 'dark';

    const text = {
        imageToImage: t(language, 'imageToImage'),
        textToImage: t(language, 'textToImage'),
        size: t(language, 'size'),
        quality: t(language, 'quality'),
        batch: t(language, 'batch'),
        generate: t(language, 'generate'),
        promptPlaceholder: t(language, 'imageEditPromptPlaceholder'),
        recommended: t(language, 'recommended'),
        generating: t(language, 'generating'),
        emptyPrompt: t(language, 'enterEditPromptError'),
        notConfigured: t(language, 'notConfigured'),
        notConnected: t(language, 'notConnected'),
        comingSoon: t(language, 'comingSoon'),
        selectModel: t(language, 'selectImageModel'),
        selectAspectRatio: t(language, 'selectAspectRatio'),
        selectResolution: t(language, 'selectResolution'),
        decreaseBatch: t(language, 'decreaseBatch'),
        increaseBatch: t(language, 'increaseBatch'),
    };

    const barClass = isDark
        ? 'bg-[#151815]/95 border-neutral-800 shadow-[0_12px_32px_rgba(0,0,0,0.28)]'
        : 'bg-white/95 border-neutral-200 shadow-[0_12px_32px_rgba(15,23,42,0.10)]';

    const dropdownClass = isDark
        ? 'bg-[#1A1D1A] border-neutral-800 shadow-[0_14px_34px_rgba(0,0,0,0.32)] rounded-lg transition-[opacity,transform] duration-150 motion-menu-in'
        : 'bg-white border-neutral-200 shadow-[0_14px_34px_rgba(15,23,42,0.12)] rounded-lg transition-[opacity,transform] duration-150 motion-menu-in';

    const dropdownHeaderClass = isDark
        ? 'bg-[#151815] border-neutral-800 text-neutral-400'
        : 'bg-neutral-50 border-neutral-200 text-neutral-500';

    const dropdownSectionClass = isDark
        ? 'bg-[#151815] text-neutral-500 border-neutral-800'
        : 'bg-neutral-50 text-neutral-500 border-neutral-200';

    const dropdownItemClass = (active: boolean) => {
        if (active) {
            return isDark
                ? 'text-[#D8FF00] bg-[#D8FF00]/10'
                : 'text-lime-700 bg-lime-50';
        }

        return isDark
            ? 'text-neutral-300 hover:bg-neutral-800 hover:text-[#D8FF00]'
            : 'text-neutral-700 hover:bg-neutral-100 hover:text-lime-600';
    };

    const isModelDisabled = (model?: ImageModel) =>
        Boolean(model?.disabled || model?.status === 'disabled' || model?.status === 'comingSoon');

    const getModelDisabledReason = (model?: ImageModel) => {
        const reason = model?.disabledReason;
        if (reason === 'notConfigured') return text.notConfigured;
        if (reason === 'notConnected') return text.notConnected;
        if (model?.status === 'comingSoon') return text.comingSoon;
        return reason || text.notConnected;
    };

    const modelDropdownItemClass = (active: boolean, disabled: boolean) => {
        if (disabled) {
            return isDark
                ? 'text-neutral-600 bg-transparent opacity-70 cursor-not-allowed'
                : 'text-neutral-400 bg-transparent opacity-70 cursor-not-allowed';
        }

        return dropdownItemClass(active);
    };

    const disabledModelBadgeClass = isDark
        ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
        : 'bg-neutral-100 text-neutral-500 border border-neutral-200';

    const recommendedBadgeClass = isDark
        ? 'bg-[#D8FF00]/12 text-[#D8FF00] border border-[#D8FF00]/20'
        : 'bg-lime-50 text-lime-700 border border-lime-200';

    const compactButtonClass = isDark
        ? 'bg-[#1A1D1A] hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-[#D8FF00]'
        : 'bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-600 hover:text-lime-700';

    const modelButtonClass = isDark
        ? 'text-neutral-400 hover:bg-neutral-800 hover:text-[#D8FF00] border border-neutral-800'
        : 'text-neutral-600 hover:bg-neutral-100 hover:text-lime-700 border border-neutral-200';

    const batchClass = isDark
        ? 'bg-[#1A1D1A] border-neutral-800 text-neutral-300'
        : 'bg-neutral-50 border-neutral-200 text-neutral-700';

    const batchButtonClass = isDark
        ? 'text-neutral-400 hover:text-[#D8FF00] disabled:text-neutral-600 disabled:hover:text-neutral-600'
        : 'text-neutral-500 hover:text-lime-700 disabled:text-neutral-300 disabled:hover:text-neutral-300';

    const generateButtonClass = isDark
        ? 'bg-[#D8FF00] hover:bg-[#e4ff3a] text-neutral-950'
        : 'bg-lime-600 hover:bg-lime-700 text-neutral-50';
    const disabledGenerateClass = isDark
        ? 'disabled:bg-neutral-800 disabled:text-neutral-500'
        : 'disabled:bg-neutral-200 disabled:text-neutral-500';

    const accentTextClass = isDark ? 'text-[#D8FF00]' : 'text-lime-700';
    const errorTextClass = isDark ? 'text-red-400' : 'text-red-600';
    const inputTextClass = isDark
        ? 'text-neutral-200 placeholder-neutral-600'
        : 'text-neutral-900 placeholder-neutral-400';
    const isGenerateDisabled = isGenerating || prompt.trim().length === 0 || isModelDisabled(currentModel);
    const displayedPromptError = promptError || (prompt.trim().length === 0 ? text.emptyPrompt : '');

    // --- Effects ---

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
            if (aspectDropdownRef.current && !aspectDropdownRef.current.contains(event.target as Node)) {
                setShowAspectDropdown(false);
            }
            if (resolutionDropdownRef.current && !resolutionDropdownRef.current.contains(event.target as Node)) {
                setShowResolutionDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setShowModelDropdown, setShowAspectDropdown, setShowResolutionDropdown]);

    const renderProviderIcon = (model: ImageModel, size = 11) => {
        if (model.provider === 'google') {
            return <Banana size={size} className="text-amber-400" />;
        }

        if (model.provider === 'openai') {
            return <OpenAIIcon size={size} className="text-emerald-400" />;
        }

        if (model.provider === 'kling') {
            return <KlingIcon size={size + 3} />;
        }

        return <ImageIcon size={size} className="text-neutral-400" />;
    };

    const renderModelGroup = (provider: ImageModel['provider'], label: string, showBorder = false) => {
        const providerModels = availableModels.filter(m => m.provider === provider);

        if (providerModels.length === 0) return null;

        return (
            <>
                <div
                    className={`px-3 py-1.5 text-[10px] font-bold ${
                        showBorder ? 'border-t ' : ''
                    } ${dropdownSectionClass}`}
                >
                    {label}
                </div>
                {providerModels.map(model => (
                    <button
                        key={model.id}
                        disabled={isModelDisabled(model)}
                        title={isModelDisabled(model) ? getModelDisabledReason(model) : model.name}
                        aria-label={isModelDisabled(model) ? `${model.name}: ${getModelDisabledReason(model)}` : model.name}
                        onClick={() => {
                            if (isModelDisabled(model)) return;
                            onModelChange(model.id);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${modelDropdownItemClass(currentModel.id === model.id, isModelDisabled(model))}`}
                    >
                        <span className="flex items-center gap-2 min-w-0">
                            {renderProviderIcon(model, 12)}
                            <span className="truncate">{model.name}</span>
                            {isModelDisabled(model) && (
                                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-lg ${disabledModelBadgeClass}`}>
                                    {getModelDisabledReason(model)}
                                </span>
                            )}
                            {model.recommended && (
                                <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded-lg flex-shrink-0 ${recommendedBadgeClass}`}
                                >
                                    {text.recommended}
                                </span>
                            )}
                        </span>
                        {currentModel.id === model.id && <Check size={12} className={accentTextClass} />}
                    </button>
                ))}
            </>
        );
    };

    return (
        <div
            className={`w-full backdrop-blur-sm rounded-xl border pointer-events-auto flex items-center px-3 py-2.5 gap-3 transition-colors duration-150 ${barClass}`}
        >
            {/* Left - Model Dropdown */}
            <div className="relative flex-shrink-0" ref={modelDropdownRef}>
                <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className={`flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${modelButtonClass}`}
                    title={text.selectModel}
                    aria-label={text.selectModel}
                >
                    {renderProviderIcon(currentModel, 11)}
                    <span className="font-medium whitespace-nowrap">{currentModel.name}</span>
                    <ChevronDown size={10} className="opacity-50" />
                </button>

                {showModelDropdown && (
                    <div className={`absolute bottom-full mb-2 left-0 w-56 border overflow-hidden z-50 ${dropdownClass}`}>
                        <div className={`px-3 py-1.5 text-[10px] font-bold border-b ${dropdownHeaderClass}`}>
                            {hasInputImage ? text.imageToImage : text.textToImage}
                        </div>

                        {renderModelGroup('custom', 'Custom')}
                        {renderModelGroup('openai', 'OpenAI', true)}
                        {renderModelGroup('google', 'Google', true)}
                        {renderModelGroup('kling', 'Kling AI', true)}
                    </div>
                )}
            </div>

            {/* Prompt Input - Takes remaining space */}
            <div className="relative flex-1 min-w-0">
                {displayedPromptError && (
                    <div className={`absolute left-0 bottom-full mb-2 text-xs font-medium ${errorTextClass}`}>
                        {displayedPromptError}
                    </div>
                )}
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={text.promptPlaceholder}
                    aria-label={text.promptPlaceholder}
                    className={`w-full bg-transparent text-sm outline-none focus-visible:ring-0 ${inputTextClass}`}
                />
            </div>

            {/* Right - Compact Controls Group */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Aspect Ratio */}
                <div className="relative" ref={aspectDropdownRef}>
                    <button
                        onClick={() => setShowAspectDropdown(!showAspectDropdown)}
                        className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${compactButtonClass}`}
                        title={text.selectAspectRatio}
                        aria-label={text.selectAspectRatio}
                    >
                        <Crop size={10} className={accentTextClass} />
                        <span>{selectedAspectRatio}</span>
                    </button>

                    {showAspectDropdown && (
                        <div className={`absolute bottom-full mb-2 right-0 w-28 border overflow-hidden z-50 max-h-60 overflow-y-auto ${dropdownClass}`}>
                            <div className={`px-3 py-2 text-[10px] font-bold ${dropdownSectionClass}`}>
                                {text.size}
                            </div>
                            {(currentModel.aspectRatios || []).map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => onAspectChange(ratio)}
                                    aria-label={`${text.selectAspectRatio}: ${ratio}`}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${dropdownItemClass(selectedAspectRatio === ratio)}`}
                                >
                                    <span>{ratio}</span>
                                    {selectedAspectRatio === ratio && <Check size={12} className={accentTextClass} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Resolution */}
                <div className="relative" ref={resolutionDropdownRef}>
                    <button
                        onClick={() => setShowResolutionDropdown(!showResolutionDropdown)}
                        className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${compactButtonClass}`}
                        title={text.selectResolution}
                        aria-label={text.selectResolution}
                    >
                        <Monitor size={10} className={accentTextClass} />
                        <span>{selectedResolution}</span>
                    </button>

                    {showResolutionDropdown && (
                        <div className={`absolute bottom-full mb-2 right-0 w-24 border overflow-hidden z-50 ${dropdownClass}`}>
                            <div className={`px-3 py-2 text-[10px] font-bold ${dropdownSectionClass}`}>
                                {text.quality}
                            </div>
                            {(currentModel.resolutions || ['1K']).map(res => (
                                <button
                                    key={res}
                                    onClick={() => onResolutionChange(res)}
                                    aria-label={`${text.selectResolution}: ${res}`}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${dropdownItemClass(selectedResolution === res)}`}
                                >
                                    <span>{res}</span>
                                    {selectedResolution === res && <Check size={12} className={accentTextClass} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Batch Count */}
                <div className={`flex items-center rounded-lg px-2 py-1.5 gap-1 text-[11px] font-medium border ${batchClass}`}>
                    <span className="hidden sm:inline text-[10px] opacity-70">{text.batch}</span>
                    <button
                        className={`h-5 w-5 rounded-lg transition-colors duration-150 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${batchButtonClass}`}
                        onClick={() => setBatchCount(Math.max(1, batchCount - 1))}
                        disabled={batchCount <= 1}
                        title={text.decreaseBatch}
                        aria-label={text.decreaseBatch}
                    >
                        -
                    </button>
                    <span className="w-3 text-center">{batchCount}</span>
                    <button
                        className={`h-5 w-5 rounded-lg transition-colors duration-150 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${batchButtonClass}`}
                        onClick={() => setBatchCount(Math.min(4, batchCount + 1))}
                        disabled={batchCount >= 4}
                        title={text.increaseBatch}
                        aria-label={text.increaseBatch}
                    >
                        +
                    </button>
                </div>

                {/* Generate Button */}
                <button
                    onClick={onGenerate}
                    disabled={isGenerateDisabled}
                    title={isModelDisabled(currentModel) ? getModelDisabledReason(currentModel) : text.generate}
                    aria-label={text.generate}
                    className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${generateButtonClass} ${disabledGenerateClass} disabled:opacity-80 disabled:cursor-not-allowed`}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M12 2v20M2 12h20" />
                    </svg>
                    {isGenerating ? text.generating : text.generate}
                </button>
            </div>
        </div>
    );
};
