/**
 * StoryboardGeneratorModal.tsx
 * 
 * Modal overlay for creating AI-powered storyboard scenes.
 * Multi-step workflow: Character Selection → Story Input → Script Review → Generate
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Loader2, Film, Users, PenTool, Sparkles, Check, Edit3, Wand2, Eye, ChevronDown } from 'lucide-react';
import { CharacterAsset, SceneScript, StoryboardState } from '../../hooks/useStoryboardGenerator';
import { StoryInput } from '../StoryInput';

// ============================================================================
// IMAGE MODELS (Copied from NodeControls.tsx for model selection)
// ============================================================================

const IMAGE_MODELS = [
    { id: 'custom-image-gpt-image-2', name: 'T8star GPT Image 2', provider: 'custom' },
    { id: 'gpt-image-1.5', name: 'GPT Image 1.5', provider: 'openai' },
    { id: 'gemini-pro', name: 'Nano Banana Pro', provider: 'google' },
    { id: 'kling-v1-5', name: 'Kling V1.5', provider: 'kling' },
    { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling' },
];

// ============================================================================
// TYPES
// ============================================================================

interface StoryboardGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    state: StoryboardState;
    onSetStep: (step: StoryboardState['step']) => void;
    onToggleCharacter: (character: CharacterAsset) => void;
    onSetSceneCount: (count: number) => void;
    onSetStory: (story: string) => void;
    onUpdateScript: (index: number, updates: Partial<SceneScript>) => void;
    onGenerateScripts: () => Promise<void>;
    onBrainstormStory: () => Promise<void>;
    onOptimizeStory: () => Promise<void>;
    onGenerateComposite: () => Promise<void>;
    onRegenerateComposite: () => Promise<void>;
    onCreateNodes: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const StoryboardGeneratorModal: React.FC<StoryboardGeneratorModalProps> = ({
    isOpen,
    onClose,
    state,
    onSetStep,
    onToggleCharacter,
    onSetSceneCount,
    onSetStory,
    onUpdateScript,
    onGenerateScripts,
    onBrainstormStory,
    onOptimizeStory,
    onGenerateComposite,
    onRegenerateComposite,
    onCreateNodes
}) => {
    const [characterAssets, setCharacterAssets] = useState<(CharacterAsset & { category: string })[]>([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    const [editingScriptIndex, setEditingScriptIndex] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

    // Mention picker state
    const [showMentionPicker, setShowMentionPicker] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionStartPos, setMentionStartPos] = useState(0);
    const textareaRef = useRef<HTMLDivElement>(null);


    // Step definitions for progress bar
    const stepDefinitions = [
        { id: 'characters', label: 'Characters', icon: Users },
        { id: 'story', label: 'Story', icon: PenTool },
        { id: 'scripts', label: 'Scripts', icon: Film },
        { id: 'preview', label: 'Preview', icon: Eye },
        { id: 'generate', label: 'Generate', icon: Sparkles }
    ];

    const currentStepIndex = stepDefinitions.findIndex(s => s.id === state.step);


    // Auto-generate preview when entering preview step
    useEffect(() => {
        if (state.step === 'preview' && !state.compositeImageUrl && !state.isGeneratingPreview) {
            onGenerateComposite();
        }
    }, [state.step, state.compositeImageUrl, state.isGeneratingPreview, onGenerateComposite]);


    // Fetch character assets from library
    useEffect(() => {
        if (!isOpen) return;

        const fetchAssets = async () => {
            setIsLoadingAssets(true);
            try {
                const response = await fetch('/api/library', { credentials: 'include' });
                if (response.ok) {
                    const assets = await response.json();
                    // Filter to show all image assets and include category info
                    const imageAssets = assets
                        .filter((a: any) => a.type === 'image')
                        .map((a: any) => ({
                            id: a.id,
                            name: a.name,
                            url: a.url,
                            description: a.description || '',
                            category: a.category || 'Others'
                        }));
                    setCharacterAssets(imageAssets);
                    setSelectedCategory('All');
                }
            } catch (error) {
                console.error('[StoryboardModal] Failed to fetch assets:', error);
            } finally {
                setIsLoadingAssets(false);
            }
        };

        fetchAssets();
    }, [isOpen]);

    // Get unique categories from loaded assets (exclude Sound Effect)
    const availableCategories = useMemo(() => {
        const categories = new Set(characterAssets.map(a => a.category));
        categories.delete('Sound Effect'); // Audio files can't be used as image references
        return ['All', ...Array.from(categories).sort()];
    }, [characterAssets]);

    // Filter assets by selected category
    const filteredAssets = useMemo(() => {
        if (selectedCategory === 'All') return characterAssets;
        return characterAssets.filter(a => a.category === selectedCategory);
    }, [characterAssets, selectedCategory]);

    // Filter mention suggestions based on current filter text
    const mentionSuggestions = useMemo(() => {
        if (!showMentionPicker || state.selectedCharacters.length === 0) return [];
        const filter = mentionFilter.toLowerCase();
        return state.selectedCharacters.filter(c =>
            c.name.toLowerCase().includes(filter)
        );
    }, [showMentionPicker, mentionFilter, state.selectedCharacters]);

    // Handle story change with mention detection
    const handleStoryChange = useCallback((value: string) => {
        // Calculate cursor position for mention detection
        let cursorPos = value.length;
        if (textareaRef.current) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && textareaRef.current.contains(sel.anchorNode)) {
                try {
                    const range = sel.getRangeAt(0);
                    const preCaretRange = range.cloneRange();
                    preCaretRange.selectNodeContents(textareaRef.current);
                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                    cursorPos = preCaretRange.toString().length;
                } catch (e) {
                    console.warn('Failed to calculate cursor position', e);
                }
            }
        }

        const textBeforeCursor = value.substring(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex !== -1) {
            // Check if @ is at start or preceded by space/newline
            const charBefore = textBeforeCursor[atIndex - 1];
            if (atIndex === 0 || charBefore === ' ' || charBefore === '\n') {
                const filterText = textBeforeCursor.substring(atIndex + 1);
                // Only show if no space after @ (user is still typing the mention)
                if (!filterText.includes(' ')) {
                    setShowMentionPicker(true);
                    setMentionFilter(filterText);
                    setMentionStartPos(atIndex);
                    setMentionIndex(0);
                } else {
                    setShowMentionPicker(false);
                }
            } else {
                setShowMentionPicker(false);
            }
        } else {
            setShowMentionPicker(false);
        }

        onSetStory(value);
    }, [onSetStory]);

    // Insert a mention at the current position
    const insertMention = useCallback((asset: CharacterAsset) => {
        const value = state.story;
        const beforeMention = value.substring(0, mentionStartPos);
        const afterMention = value.substring(mentionStartPos + mentionFilter.length + 1); // +1 for @
        const newValue = beforeMention + '@' + asset.name + ' ' + afterMention;
        onSetStory(newValue);
        setShowMentionPicker(false);
        setMentionFilter('');

        // Focus input after mention
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                // Move cursor to end logic handled by StoryInput fallback or browser default
            }
        }, 0);
    }, [state.story, mentionStartPos, mentionFilter, onSetStory]);

    // Handle keyboard navigation for mention picker
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!showMentionPicker || mentionSuggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMentionIndex(prev => (prev + 1) % mentionSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertMention(mentionSuggestions[mentionIndex]);
        } else if (e.key === 'Escape') {
            setShowMentionPicker(false);
        }
    }, [showMentionPicker, mentionSuggestions, mentionIndex, insertMention]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-modal-overlay-in"
            />

            {/* Modal */}
            <div className="relative bg-[#151815] rounded-xl shadow-[0_18px_44px_rgba(0,0,0,0.42)] w-full max-w-2xl max-h-[85vh] overflow-hidden border border-neutral-800 flex flex-col motion-modal-dialog-in">
                {/* Header */}
                <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#1A1D1A] border border-neutral-800 flex items-center justify-center">
                            <Film size={19} className="text-[#D8FF00]" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold leading-5 text-neutral-100">Storyboard Generator</h2>
                            <p className="text-xs leading-4 text-neutral-500">Create scenes with AI</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close storyboard generator"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-[background-color,color] duration-150 hover:bg-[#1A1D1A] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 group"
                    >
                        <X size={18} className="transition-colors" />
                    </button>
                </div>

                {/* Step Indicator - Redesigned with connected dots */}
                <div className="px-5 py-4 border-b border-neutral-800">
                    <div className="flex items-center justify-between relative">
                        {/* Progress line background */}
                        <div className="absolute top-3 left-0 right-0 h-0.5 bg-neutral-800" />
                        {/* Progress line filled */}
                        <div
                            className="absolute top-3 left-0 right-0 h-0.5 origin-left bg-[#D8FF00]/70 transition-transform duration-300 ease-out"
                            style={{ transform: `scaleX(${currentStepIndex / (stepDefinitions.length - 1)})` }}
                        />

                        {stepDefinitions.map((step, index) => {
                            // Determine if step is accessible
                            let isAccessible = false;
                            if (index <= currentStepIndex) isAccessible = true;
                            else if (step.id === 'scripts' && state.scripts.length > 0) isAccessible = true;
                            else if ((step.id === 'preview' || step.id === 'generate') && state.compositeImageUrl) isAccessible = true;

                            const isCompleted = isAccessible && index < currentStepIndex;
                            const isCurrent = index === currentStepIndex;

                            return (
                                <button
                                    key={step.id}
                                    onClick={() => isAccessible && onSetStep(step.id as StoryboardState['step'])}
                                    disabled={!isAccessible}
                                    className="flex flex-col items-center gap-1.5 relative z-10 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 rounded-lg"
                                >
                                    {/* Step dot */}
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-[background-color,color,box-shadow] duration-150 ${isCurrent
                                        ? 'bg-[#D8FF00] text-black shadow-[0_0_8px_rgba(216,255,0,0.14)]'
                                        : isCompleted
                                            ? 'bg-emerald-500 text-white'
                                            : isAccessible
                                                ? 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600 cursor-pointer'
                                                : 'bg-neutral-800 text-neutral-600'
                                        }`}>
                                        {isCompleted ? (
                                            <Check size={12} strokeWidth={3} />
                                        ) : (
                                            <step.icon size={12} />
                                        )}
                                    </div>
                                    {/* Step label */}
                                    <span className={`text-[10px] font-medium transition-colors duration-200 ${isCurrent
                                        ? 'text-[#D8FF00]'
                                        : isCompleted
                                            ? 'text-emerald-400'
                                            : isAccessible
                                                ? 'text-neutral-400 group-hover:text-neutral-300'
                                                : 'text-neutral-600'
                                        }`}>
                                        {step.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Characters Step Header - Fixed outside scroll area */}
                {state.step === 'characters' && (
                    <div className="px-5 pt-5 pb-4 border-b border-neutral-800">
                        <h3 className="text-neutral-100 font-semibold mb-2">Select Reference Images</h3>
                        <p className="text-neutral-400 text-sm mb-4">
                            Choose up to 3 reference images from your Asset Library to guide the AI.
                        </p>

                        {/* Category Dropdown */}
                        {characterAssets.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 bg-[#101210] border border-neutral-700 rounded-lg text-sm text-neutral-100 hover:border-neutral-600 hover:bg-[#1A1D1A] transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="text-neutral-400">Category:</span>
                                        <span className="font-medium">{selectedCategory}</span>
                                        <span className="text-neutral-500 text-xs">({filteredAssets.length} items)</span>
                                    </span>
                                    <ChevronDown size={16} className={`text-neutral-400 transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isCategoryDropdownOpen && (
                                    <div className="absolute z-20 w-full mt-1 bg-[#151815] border border-neutral-700 rounded-lg shadow-[0_16px_36px_rgba(0,0,0,0.38)] overflow-hidden">
                                        {availableCategories.map(category => (
                                            <button
                                                key={category}
                                                onClick={() => {
                                                    setSelectedCategory(category);
                                                    setIsCategoryDropdownOpen(false);
                                                }}
                                                className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${selectedCategory === category
                                                    ? 'bg-[#D8FF00]/[0.08] text-[#D8FF00]'
                                                    : 'text-neutral-300 hover:bg-[#1A1D1A]'
                                                    }`}
                                            >
                                                <span className="flex items-center justify-between">
                                                    <span>{category}</span>
                                                    <span className="text-xs opacity-60">
                                                        {category === 'All'
                                                            ? characterAssets.length
                                                            : characterAssets.filter(a => a.category === category).length}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* Error Message */}
                    {state.error && (
                        <div className="mb-4 p-3 bg-red-500/[0.08] border border-red-500/50 rounded-lg text-red-300 text-sm">
                            {state.error}
                        </div>
                    )}

                    {/* Step 1: Character Selection - Grid Only */}
                    {state.step === 'characters' && (

                        <div>
                            {isLoadingAssets ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 text-[#D8FF00] animate-spin" />
                                </div>
                            ) : characterAssets.length === 0 ? (
                                <div className="text-center py-12 text-neutral-500">
                                    <Users size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>No images found in Asset Library</p>
                                    <p className="text-xs mt-1">Add image assets to your library to use them as character references</p>
                                </div>
                            ) : filteredAssets.length === 0 ? (
                                <div className="text-center py-12 text-neutral-500">
                                    <Users size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>No images in "{selectedCategory}" category</p>
                                    <p className="text-xs mt-1">Try selecting a different category</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-4">
                                    {filteredAssets.map(character => {
                                        const isSelected = state.selectedCharacters.some(c => c.id === character.id);
                                        return (
                                            <button
                                                key={character.id}
                                                onClick={() => onToggleCharacter(character)}
                                                className={`relative aspect-square rounded-lg overflow-hidden transition-[box-shadow,filter,opacity] duration-150 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${isSelected
                                                    ? 'ring-2 ring-[#D8FF00]/60 ring-offset-2 ring-offset-[#151815]'
                                                    : ''
                                                    }`}
                                            >
                                                {/* Image */}
                                                <img
                                                    src={character.url}
                                                    alt={character.name}
                                                    className={`w-full h-full object-cover transition-[filter] duration-150 ${isSelected ? 'brightness-100' : 'brightness-90 group-hover:brightness-100'
                                                        }`}
                                                />

                                                {/* Frosted glass name label */}
                                                <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-black/40 border-t border-white/10 p-2.5">
                                                    <p className="text-white text-xs font-medium truncate">
                                                        {character.name}
                                                    </p>
                                                </div>

                                                {/* Selection indicator */}
                                                <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-[background-color,opacity,transform] duration-150 ${isSelected
                                                    ? 'bg-[#D8FF00] opacity-100'
                                                    : 'bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 border border-white/20'
                                                    }`}>
                                                    <Check size={12} className="text-black" strokeWidth={3} />
                                                </div>

                                                {/* Hover overlay */}
                                                <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${isSelected
                                                    ? 'bg-[#D8FF00]/[0.08] opacity-100'
                                                    : 'bg-white/5 opacity-0 group-hover:opacity-100'
                                                    }`} />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Story Input */}
                    {state.step === 'story' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Write Your Story</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Describe the story you want to visualize. AI will break it into {state.sceneCount} scenes.
                            </p>

                            {/* Selected Reference Images - clickable to insert @ mention */}
                            {state.selectedCharacters.length > 0 && (
                                <div className="mb-4 p-3 bg-[#101210] rounded-lg border border-neutral-800">
                                    <p className="text-xs text-neutral-400 mb-2">
                                        Selected references — click to insert @mention in story:
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {state.selectedCharacters.map(asset => (
                                            <button
                                                key={asset.id}
                                                onClick={() => {
                                                    const mention = `@${asset.name}`;
                                                    onSetStory(state.story + (state.story.endsWith(' ') || state.story === '' ? '' : ' ') + mention + ' ');
                                                }}
                                                className="flex items-center gap-2 px-2 py-1.5 bg-[#151815] hover:bg-[#1A1D1A] border border-neutral-800 rounded-lg transition-[background-color,border-color,color] duration-150 group"
                                            >
                                                <img
                                                    src={asset.url}
                                                    alt={asset.name}
                                                    className="w-6 h-6 rounded object-cover"
                                                />
                                                <span className="text-xs text-neutral-300 group-hover:text-white">
                                                    @{asset.name}
                                                </span>
                                                <span className="text-[10px] text-neutral-500 px-1.5 py-0.5 bg-neutral-900 rounded">
                                                    {asset.category || 'Others'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Scene Count Slider */}
                            <div className="mb-4">
                                <label className="block text-sm text-neutral-300 mb-2">
                                    Number of Scenes: <span className="text-[#D8FF00] font-medium">{state.sceneCount}</span>
                                </label>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={state.sceneCount}
                                    onChange={(e) => onSetSceneCount(parseInt(e.target.value))}
                                    className="w-full accent-[#D8FF00]"
                                />
                                <div className="flex justify-between text-xs text-neutral-500 mt-1">
                                    <span>1</span>
                                    <span>10</span>
                                </div>
                            </div>

                            {/* Brainstorm with AI Button */}
                            <button
                                onClick={onBrainstormStory}
                                disabled={state.isBrainstorming}
                                className="mb-3 flex items-center gap-2 text-sm text-[#D8FF00] hover:text-[#e4ff3a] transition-colors group disabled:cursor-not-allowed disabled:text-neutral-600"
                            >
                                {state.isBrainstorming ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Brainstorming...</span>
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
                                        <span className="underline decoration-dashed underline-offset-2">Brainstorm with AI</span>
                                        <span className="text-neutral-500 text-xs">(let AI write a story for you)</span>
                                    </>
                                )}
                            </button>

                            {/* Story Textarea with Mention Picker */}
                            <div className="relative">
                                <StoryInput
                                    inputRef={textareaRef}
                                    value={state.story}
                                    onChange={handleStoryChange}
                                    onKeyDown={handleKeyDown}
                                    onBlur={() => {
                                        // Delay closing to allow click on mention
                                        setTimeout(() => setShowMentionPicker(false), 150);
                                    }}
                                    placeholder={state.selectedCharacters.length > 0
                                        ? `Type @ to mention assets like @${state.selectedCharacters[0]?.name}...`
                                        : "Once upon a time, in a magical forest..."}
                                    assets={state.selectedCharacters}
                                    className="min-h-[12rem]"
                                />

                                {/* Mention Picker Dropdown */}
                                {showMentionPicker && mentionSuggestions.length > 0 && (
                                    <div className="absolute left-4 top-10 w-64 bg-[#151815] border border-neutral-700 rounded-lg shadow-[0_16px_36px_rgba(0,0,0,0.38)] overflow-hidden z-50">
                                        <div className="text-[10px] text-neutral-500 px-3 py-1 border-b border-neutral-700/50 bg-[#101210]">
                                            Select reference (↑↓ to navigate, Enter to select)
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {mentionSuggestions.map((asset, index) => (
                                                <button
                                                    key={asset.id}
                                                    onClick={() => insertMention(asset)}
                                                    onMouseEnter={() => setMentionIndex(index)}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${index === mentionIndex
                                                        ? 'bg-[#D8FF00]/[0.08] text-[#D8FF00]'
                                                        : 'hover:bg-[#1A1D1A] text-neutral-300'
                                                        }`}
                                                >
                                                    <img
                                                        src={asset.url}
                                                        alt={asset.name}
                                                        className="w-7 h-7 rounded object-cover flex-shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">@{asset.name}</div>
                                                        <div className="text-[10px] text-neutral-400">{asset.category || 'Others'}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-start mt-2">
                                <p className="text-xs text-neutral-500">
                                    Tip: Be descriptive about scenes, actions, and emotions for better results.
                                </p>
                                <button
                                    onClick={onOptimizeStory}
                                    disabled={state.isOptimizing || !state.story.trim()}
                                    className={`text-xs flex items-center gap-1.5 transition-colors ${state.story.trim() ? 'text-[#D8FF00] hover:text-[#e4ff3a]' : 'text-neutral-600 cursor-not-allowed'
                                        }`}
                                >
                                    {state.isOptimizing ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Wand2 size={12} />
                                    )}
                                    Optimize with AI
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Script Review */}
                    {state.step === 'scripts' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Review & Edit Scripts</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                AI generated {state.scripts.length} scene scripts. Click to edit.
                            </p>

                            <div className="space-y-3">
                                {state.isGenerating ? (
                                    // SKELETON LOADERS
                                    Array.from({ length: state.sceneCount }).map((_, i) => (
                                        <div key={i} className="bg-[#101210] border border-neutral-800 rounded-lg p-4 relative overflow-hidden">
                                            {/* Shimmer Effect */}
                                            <div className="absolute inset-0 bg-neutral-800/20 animate-[pulse_2s_infinite]" />

                                            <div className="flex items-center justify-between mb-3">
                                                <div className="h-4 w-20 bg-neutral-800/50 rounded animate-pulse" />
                                                <div className="flex gap-2">
                                                    <div className="h-4 w-16 bg-neutral-800/50 rounded animate-pulse" />
                                                    <div className="h-4 w-16 bg-neutral-800/50 rounded animate-pulse" />
                                                </div>
                                            </div>

                                            <div className="space-y-2 mb-2">
                                                <div className="h-3 w-full bg-neutral-800/50 rounded animate-pulse" />
                                                <div className="h-3 w-5/6 bg-neutral-800/50 rounded animate-pulse" />
                                                <div className="h-3 w-4/6 bg-neutral-800/50 rounded animate-pulse" />
                                            </div>

                                            <div className="flex items-center justify-center text-[#D8FF00]/60 text-xs font-medium gap-2 pt-2">
                                                <Loader2 size={12} className="animate-spin" />
                                                Creating Scene {i + 1}...
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    // ACTUAL CONTENTS
                                    state.scripts.map((script, index) => (
                                        <div
                                            key={index}
                                            className="bg-[#101210] border border-neutral-700 rounded-lg p-4"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[#D8FF00] text-sm font-medium">
                                                    Scene {script.sceneNumber}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                                    <span className="px-2 py-0.5 bg-neutral-800 rounded">
                                                        {script.cameraAngle}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-neutral-800 rounded">
                                                        {script.mood}
                                                    </span>
                                                </div>
                                            </div>

                                            {editingScriptIndex === index ? (
                                                <StoryInput
                                                    value={script.description}
                                                    onChange={(val) => onUpdateScript(index, { description: val })}
                                                    onBlur={() => setEditingScriptIndex(null)}
                                                    assets={state.selectedCharacters}
                                                    className="w-full bg-neutral-800 border border-neutral-600 rounded-lg p-2 min-h-[5rem]"
                                                // autoFocus is trickier with contentEditable, handled by ref usually but let's test
                                                />
                                            ) : (
                                                <div
                                                    onClick={() => setEditingScriptIndex(index)}
                                                    className="cursor-pointer hover:bg-[#1A1D1A] rounded-lg -m-2 p-2 transition-colors group relative"
                                                >
                                                    <StoryInput
                                                        value={script.description}
                                                        onChange={() => { }}
                                                        assets={state.selectedCharacters}
                                                        readOnly
                                                        className="bg-transparent border-none p-0 min-h-0 h-auto overflow-visible"
                                                    />
                                                    <Edit3 size={12} className="absolute top-2 right-2 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            )}
                                        </div>
                                    )))}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: PREVIEW COMPOSITE */}
                    {state.step === 'preview' && (
                        <div className="flex flex-col h-full">
                            <h3 className="text-white font-medium mb-2">Preview Storyboard</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Review the composite storyboard. This image will be used as a reference to generate individual scenes with consistent characters and environments.
                            </p>

                            <div className="flex-1 bg-[#101210] rounded-lg border border-neutral-700 overflow-hidden flex items-center justify-center p-4 relative group">
                                {state.isGeneratingPreview ? (
                                    <div className="text-center">
                                        <Loader2 size={48} className="animate-spin text-[#D8FF00] mx-auto mb-4" />
                                        <p className="text-neutral-100 font-medium">Generating Preview...</p>
                                        <p className="text-neutral-400 text-sm mt-2">Creating a cohesive storyboard with Nano Banana Pro</p>
                                    </div>
                                ) : state.compositeImageUrl ? (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <img
                                            src={state.compositeImageUrl}
                                            alt="Storyboard Composite"
                                            className="max-h-full max-w-full object-contain rounded shadow-lg"
                                        />
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={onRegenerateComposite}
                                                className="bg-black/70 hover:bg-black/90 text-neutral-100 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm flex items-center gap-2 border border-white/10 transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                                            >
                                                <Wand2 size={12} />
                                                Regenerate
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-neutral-500">
                                        <p>No preview available</p>
                                        <button
                                            onClick={onGenerateComposite}
                                            className="mt-4 text-[#D8FF00] hover:text-[#e4ff3a] text-sm underline transition-colors"
                                        >
                                            Generate Preview
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 5: GENERATE (Summary now, since model selection is removed) */}
                    {state.step === 'generate' && (
                        <div>
                            <h3 className="text-white font-medium mb-2">Ready to Generate</h3>
                            <p className="text-neutral-400 text-sm mb-4">
                                Determine the final output. The individual scenes will be extracted from your preview image.
                            </p>

                            <div className="bg-[#101210] border border-neutral-700 rounded-lg p-4">
                                <h4 className="text-neutral-100 text-sm font-medium mb-2">Summary</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="text-neutral-400">Characters:</div>
                                    <div className="text-neutral-100">
                                        {state.selectedCharacters.length > 0
                                            ? state.selectedCharacters.map(c => c.name).join(', ')
                                            : 'None selected'}
                                    </div>
                                    <div className="text-neutral-400">Scenes:</div>
                                    <div className="text-neutral-100">{state.scripts.length}</div>
                                    <div className="text-neutral-400">Model:</div>
                                    <div className="text-neutral-100">Nano Banana Pro</div>
                                    <div className="text-neutral-400">Preview:</div>
                                    <div className="text-neutral-100">{state.compositeImageUrl ? 'Generated' : 'Not available'}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-neutral-800 bg-[#101210] flex items-center justify-between">
                    {/* Back Button */}
                    <button
                        onClick={() => {
                            if (state.step === 'story') onSetStep('characters');
                            else if (state.step === 'scripts') onSetStep('story');
                            else if (state.step === 'preview') onSetStep('scripts');
                            else if (state.step === 'generate') onSetStep('preview');
                        }}
                        disabled={state.step === 'characters'}
                        className={`flex h-9 items-center gap-2 px-4 rounded-lg border text-sm font-medium transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${state.step === 'characters'
                            ? 'border-neutral-800 bg-neutral-900 text-neutral-600 cursor-not-allowed'
                            : 'border-neutral-700 bg-[#151815] text-neutral-300 hover:border-neutral-600 hover:bg-[#1A1D1A] hover:text-neutral-100'
                            }`}
                    >
                        <ChevronLeft size={16} />
                        Back
                    </button>

                    {/* Selected Characters Count - shown in footer for characters step */}
                    {state.step === 'characters' && (
                        <p className="text-xs text-neutral-500">
                            Selected: {state.selectedCharacters.length}/3 images (optional)
                        </p>
                    )}

                    {/* Next/Generate Button */}
                    {state.step === 'characters' && (
                        <button
                            onClick={() => onSetStep('story')}
                            className="flex h-9 items-center gap-2 bg-[#D8FF00] hover:bg-[#e4ff3a] text-black px-5 rounded-lg text-sm font-semibold transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40"
                        >
                            Next
                            <ChevronRight size={16} />
                        </button>
                    )}

                    {state.step === 'story' && (
                        <button
                            onClick={onGenerateScripts}
                            disabled={state.isGenerating || !state.story.trim()}
                            className={`flex h-9 items-center gap-2 px-5 rounded-lg text-sm font-semibold transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${state.isGenerating || !state.story.trim()
                                ? 'border border-neutral-700 bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                : 'bg-[#D8FF00] hover:bg-[#e4ff3a] text-black'
                                }`}
                        >
                            {state.isGenerating ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Generating Scripts...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} />
                                    Generate Scripts
                                </>
                            )}
                        </button>
                    )}

                    {state.step === 'scripts' && (
                        <button
                            onClick={() => {
                                if (state.compositeImageUrl) {
                                    onRegenerateComposite();
                                } else {
                                    onSetStep('preview');
                                }
                            }}
                            disabled={state.isGeneratingPreview}
                            className={`flex h-9 items-center gap-2 px-5 rounded-lg text-sm font-semibold transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${state.isGeneratingPreview
                                ? 'border border-neutral-700 bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                : 'bg-[#D8FF00] hover:bg-[#e4ff3a] text-black'
                                }`}
                        >
                            {state.isGeneratingPreview ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Generating...
                                </>
                            ) : state.compositeImageUrl ? (
                                <>
                                    <Sparkles size={16} />
                                    Regenerate Preview
                                </>
                            ) : (
                                <>
                                    Next <ChevronRight size={16} />
                                </>
                            )}
                        </button>
                    )}

                    {state.step === 'preview' && (
                        <button
                            onClick={() => onSetStep('generate')}
                            disabled={!state.compositeImageUrl || state.isGeneratingPreview}
                            className={`flex h-9 items-center gap-2 px-5 rounded-lg text-sm font-semibold transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${!state.compositeImageUrl || state.isGeneratingPreview
                                ? 'border border-neutral-700 bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                : 'bg-[#D8FF00] hover:bg-[#e4ff3a] text-black'
                                }`}
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    )}

                    {state.step === 'generate' && (
                        <button
                            onClick={onCreateNodes}
                            className="flex h-9 items-center gap-2 bg-[#D8FF00] hover:bg-[#e4ff3a] text-black px-5 rounded-lg text-sm font-semibold transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40"
                        >
                            <Film size={16} />
                            Create Storyboard
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
};
