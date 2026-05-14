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
import { PromptInput, ToolGroup } from '../../ui';

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
    canvasTheme: _canvasTheme = 'dark',
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

    const dropdownClass = 'rounded-[var(--myml-radius-card)] border border-[var(--myml-editor-toolbar-border)] bg-[var(--myml-editor-toolbar)] shadow-[var(--myml-shadow-floating)] transition-[opacity,transform] duration-[var(--myml-motion-base)] motion-menu-in';
    const dropdownHeaderClass = 'bg-[var(--myml-surface-section)] border-[var(--myml-border-subtle)] text-[var(--myml-text-muted)]';
    const dropdownSectionClass = 'bg-[var(--myml-surface-section)] text-[var(--myml-text-faint)] border-[var(--myml-border-subtle)]';

    const dropdownItemClass = (active: boolean) => {
        if (active) {
            return 'text-[var(--myml-accent)] bg-[var(--myml-editor-control-active)]';
        }

        return 'text-[var(--myml-text-secondary)] hover:bg-[var(--myml-editor-control-hover)] hover:text-[var(--myml-text-primary)]';
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
            return 'text-[var(--myml-text-faint)] bg-transparent opacity-70 cursor-not-allowed';
        }

        return dropdownItemClass(active);
    };

    const disabledModelBadgeClass = 'border border-[var(--myml-border-subtle)] bg-[var(--myml-editor-control)] text-[var(--myml-text-faint)]';
    const recommendedBadgeClass = 'border border-[var(--myml-accent-muted)] bg-[var(--myml-accent-soft)] text-[var(--myml-accent)]';
    const compactButtonClass = 'border border-[var(--myml-border-default)] bg-[var(--myml-editor-control)] text-[var(--myml-text-secondary)] hover:bg-[var(--myml-editor-control-hover)] hover:text-[var(--myml-accent)]';
    const modelButtonClass = 'border border-[var(--myml-border-default)] text-[var(--myml-text-secondary)] hover:bg-[var(--myml-editor-control-hover)] hover:text-[var(--myml-accent)]';
    const batchClass = 'border-[var(--myml-border-default)] bg-[var(--myml-editor-control)] text-[var(--myml-text-secondary)]';
    const batchButtonClass = 'text-[var(--myml-text-muted)] hover:text-[var(--myml-accent)] disabled:text-[var(--myml-text-faint)] disabled:hover:text-[var(--myml-text-faint)]';
    const generateButtonClass = 'bg-[var(--myml-accent)] text-[var(--myml-accent-contrast)] hover:bg-[var(--myml-accent-hover)] hover:shadow-[var(--myml-shadow-accent)]';
    const disabledGenerateClass = 'disabled:bg-[var(--myml-editor-control)] disabled:text-[var(--myml-text-faint)]';
    const accentTextClass = 'text-[var(--myml-accent)]';
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
        <ToolGroup className="w-full min-w-0 gap-2.5 px-3 py-2.5">
            {/* Left - Model Dropdown */}
            <div className="relative shrink-0" ref={modelDropdownRef}>
                <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${modelButtonClass}`}
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
            <PromptInput
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={text.promptPlaceholder}
                    aria-label={text.promptPlaceholder}
                    error={displayedPromptError}
                />

            {/* Right - Compact Controls Group */}
            <div className="flex shrink-0 items-center gap-1.5">
                {/* Aspect Ratio */}
                <div className="relative" ref={aspectDropdownRef}>
                    <button
                        onClick={() => setShowAspectDropdown(!showAspectDropdown)}
                        className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${compactButtonClass}`}
                        title={text.selectAspectRatio}
                        aria-label={text.selectAspectRatio}
                    >
                        <Crop size={10} className={accentTextClass} />
                        <span className="whitespace-nowrap">{selectedAspectRatio}</span>
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
                        className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${compactButtonClass}`}
                        title={text.selectResolution}
                        aria-label={text.selectResolution}
                    >
                        <Monitor size={10} className={accentTextClass} />
                        <span className="whitespace-nowrap">{selectedResolution}</span>
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
                <div className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[11px] font-medium ${batchClass}`}>
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
                    className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[11px] font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 ${generateButtonClass} ${disabledGenerateClass} disabled:cursor-not-allowed disabled:opacity-80`}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M12 2v20M2 12h20" />
                    </svg>
                    {isGenerating ? text.generating : text.generate}
                </button>
            </div>
        </ToolGroup>
    );
};
