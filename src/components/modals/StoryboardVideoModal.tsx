/**
 * StoryboardVideoModal.tsx
 * 
 * Modal for batch generating videos from storyboard scene images.
 * Allows users to write/generate prompts for each scene and configure video settings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Film, Loader2, Play, Check, ChevronDown, Wand2, Trash2 } from 'lucide-react';
import { NodeData } from '../../types';
import { Language, t } from '../../i18n/translations';

interface StoryboardVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    scenes: NodeData[];
    onCreateVideos: (
        prompts: Record<string, string>,
        settings: {
            model: string;
            duration: number;
            resolution: string;
        },
        activeNodeIds: string[]
    ) => void;
    storyContext?: {
        story: string;
        scripts: any[];
    };
    language?: Language;
    canvasTheme?: 'dark' | 'light';
}

const VIDEO_DISABLED_MESSAGE = 'Video generation is currently disabled.';
const VIDEO_DURATIONS = [5];
const VIDEO_RESOLUTIONS = ['Auto'];

const VIDEO_MODELS = [
    {
        id: 'video-disabled',
        name: 'Video generation disabled',
        provider: 'disabled',
        durations: [5],
        resolutions: ['Auto'],
        disabled: true
    }
];

export const StoryboardVideoModal: React.FC<StoryboardVideoModalProps> = ({
    isOpen,
    onClose,
    scenes,
    onCreateVideos,
    storyContext,
    language = 'zh',
    canvasTheme = 'dark'
}) => {
    // Track removed scenes (locally within modal session)
    const [removedSceneIds, setRemovedSceneIds] = useState<Set<string>>(new Set());

    // Reset removed scenes when modal opens/closes or scenes change significantly
    useEffect(() => {
        if (isOpen) {
            setRemovedSceneIds(new Set());
        }
    }, [isOpen]);

    // Filter out removed scenes, then sort by X position
    const activeScenes = scenes.filter(s => !removedSceneIds.has(s.id));
    const sortedScenes = [...activeScenes].sort((a, b) => a.x - b.x);

    const [prompts, setPrompts] = useState<Record<string, string>>({});
    const [settings, setSettings] = useState({
        model: 'video-disabled',
        duration: 5,
        resolution: 'Auto'
    });
    const [generatingPrompts, setGeneratingPrompts] = useState<Record<string, boolean>>({});
    const [optimizingPrompts, setOptimizingPrompts] = useState<Record<string, boolean>>({});
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const isDark = canvasTheme === 'dark';
    const menuSurfaceClass = isDark
        ? 'bg-[#151815] border-neutral-700 shadow-[0_16px_36px_rgba(0,0,0,0.38)]'
        : 'bg-white border-neutral-200 shadow-[0_14px_32px_rgba(15,23,42,0.12)]';
    const menuHeaderClass = isDark ? 'bg-[#101210] border-neutral-700 text-neutral-500' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
    const menuItemClass = (active: boolean) => active
        ? isDark
            ? 'text-[#D8FF00] bg-[#D8FF00]/[0.08]'
            : 'text-lime-700 bg-lime-50'
        : isDark
            ? 'text-neutral-300 hover:bg-[#1A1D1A]'
            : 'text-neutral-700 hover:bg-neutral-100';
    const overlayClass = isDark ? 'bg-black/60' : 'bg-neutral-950/35';
    const dialogClass = isDark
        ? 'bg-[#151815] border-neutral-800 text-neutral-100'
        : 'bg-white border-neutral-200 text-neutral-900';
    const headerBorderClass = isDark ? 'border-neutral-800' : 'border-neutral-200';
    const headerIconClass = isDark ? 'bg-[#1A1D1A] border-neutral-800' : 'bg-neutral-100 border-neutral-200';
    const titleClass = isDark ? 'text-neutral-100' : 'text-neutral-900';
    const bodyTextClass = isDark ? 'text-neutral-400' : 'text-neutral-600';
    const panelClass = isDark ? 'bg-[#101210] border-neutral-800' : 'bg-neutral-50 border-neutral-200';
    const previewSurfaceClass = isDark ? 'bg-black border-neutral-800' : 'bg-neutral-100 border-neutral-200';
    const fieldClass = isDark
        ? 'bg-[#070807] border-neutral-800 text-neutral-200 placeholder-neutral-600'
        : 'bg-white border-neutral-200 text-neutral-900 placeholder-neutral-400';
    const footerClass = isDark ? 'bg-[#101210]' : 'bg-neutral-50';
    const closeHoverClass = isDark ? 'hover:bg-[#1A1D1A] hover:text-neutral-100' : 'hover:bg-neutral-100 hover:text-neutral-900';

    // Dynamic resolution options based on model and duration
    const currentModel = VIDEO_MODELS.find(m => m.id === settings.model) || VIDEO_MODELS[0];
    const availableResolutions = (currentModel as any).durationResolutionMap?.[settings.duration]
        || currentModel.resolutions
        || VIDEO_RESOLUTIONS;

    // Ensure settings are valid when model/duration changes
    useEffect(() => {
        const model = VIDEO_MODELS.find(m => m.id === settings.model);
        if (!model) return;

        let newDuration = settings.duration;
        let newResolution = settings.resolution;
        let changed = false;

        // Validation for Duration
        if (!model.durations.includes(newDuration)) {
            newDuration = model.durations[0];
            changed = true;
        }

        // Validation for Resolution
        const allowedResolutions = (model as any).durationResolutionMap?.[newDuration] || model.resolutions || VIDEO_RESOLUTIONS;
        if (!allowedResolutions.includes(newResolution) && !allowedResolutions.includes('Auto')) {
            // If current resolution not allowed, pick first allowed
            // Favor '720p' or '1080p' if available, else first
            if (allowedResolutions.includes('720p')) newResolution = '720p';
            else if (allowedResolutions.includes('1080p')) newResolution = '1080p';
            else newResolution = allowedResolutions[0];
            changed = true;
        }

        if (changed) {
            setSettings(prev => ({ ...prev, duration: newDuration, resolution: newResolution }));
        }
    }, [settings.model, settings.duration, settings.resolution]);

    // Initial settings sync
    useEffect(() => {
        // Ensure duration is valid for initial model
        const model = VIDEO_MODELS.find(m => m.id === settings.model);
        if (model && !model.durations.includes(settings.duration)) {
            setSettings(prev => ({ ...prev, duration: model.durations[0] }));
        }
    }, []); // Only run once on mount

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initialize prompts with existing node prompts or empty
    useEffect(() => {
        if (isOpen) {
            const initialPrompts: Record<string, string> = {};
            sortedScenes.forEach(scene => {
                // If the scene prompt is an "Extract panel" command, we probably want a fresh description
                // If it's a creative prompt, use it
                if (scene.prompt && !scene.prompt.startsWith('Extract panel')) {
                    initialPrompts[scene.id] = scene.prompt;
                } else {
                    initialPrompts[scene.id] = '';
                }
            });
            setPrompts(initialPrompts);
        }
    }, [isOpen, scenes]);

    // Handle single prompt generation through the text assistant endpoint.
    const handleGeneratePrompt = async (nodeId: string) => {
        const scene = scenes.find(s => s.id === nodeId);
        if (!scene || !scene.resultUrl) return;

        setGeneratingPrompts(prev => ({ ...prev, [nodeId]: true }));

        try {
            // Using a simple text generation endpoint that supports image input
            // Construct a context-rich prompt
            let systemPrompt = "Describe this image in detail to be used as a prompt for video generation. Focus on the action, movement, and atmosphere. Keep it under 50 words.";

            if (storyContext) {
                systemPrompt += `\n\nContext from Story: "${storyContext.story}"`;
                // Try to find specific script info if possible (assuming index matches or title match)
                const sceneIndex = sortedScenes.findIndex(s => s.id === nodeId);
                if (sceneIndex !== -1 && storyContext.scripts[sceneIndex]) {
                    const script = storyContext.scripts[sceneIndex];
                    console.log(`[StoryboardModal] Injecting script for scene #${sceneIndex + 1}:`, script.description);
                    systemPrompt += `\n\nScene Script: ${script.description}`;
                    if (script.cameraAngle) systemPrompt += `\nCamera: ${script.cameraAngle} ${script.cameraMovement ? `(${script.cameraMovement})` : ''}`;
                    if (script.lighting) systemPrompt += `\nLighting: ${script.lighting}`;
                    if (script.mood) systemPrompt += `\nMood: ${script.mood}`;
                }
            }

            const response = await fetch('/api/gemini/describe-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    imageUrl: scene.resultUrl,
                    prompt: systemPrompt
                })
            });

            if (!response.ok) throw new Error('Failed to generate prompt');

            const data = await response.json();
            setPrompts(prev => ({ ...prev, [nodeId]: data.description }));
        } catch (error) {
            console.error('Prompt generation failed:', error);
            // Fallback or error notification could go here
        } finally {
            setGeneratingPrompts(prev => ({ ...prev, [nodeId]: false }));
        }
    };

    // Handle optimizing manually entered prompts through the text assistant endpoint.
    const handleOptimizePrompt = async (nodeId: string) => {
        const currentPrompt = prompts[nodeId];
        if (!currentPrompt) return; // Nothing to optimize

        setOptimizingPrompts(prev => ({ ...prev, [nodeId]: true }));

        try {
            const response = await fetch('/api/gemini/optimize-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    prompt: currentPrompt
                })
            });

            if (!response.ok) throw new Error('Failed to optimize prompt');

            const data = await response.json();
            setPrompts(prev => ({ ...prev, [nodeId]: data.optimizedPrompt }));
        } catch (error) {
            console.error('Prompt optimization failed:', error);
            // Fallback or error notification could go here
        } finally {
            setOptimizingPrompts(prev => ({ ...prev, [nodeId]: false }));
        }
    };

    const handleRemoveScene = (nodeId: string) => {
        setRemovedSceneIds(prev => {
            const newSet = new Set(prev);
            newSet.add(nodeId);
            return newSet;
        });
    };

    const handleModelChange = (modelId: string) => {
        const newModel = VIDEO_MODELS.find(m => m.id === modelId);
        if (!newModel) return;

        // Determine new duration: keep current if valid, else first available
        let newDuration = settings.duration;
        if (!newModel.durations.includes(newDuration)) {
            newDuration = newModel.durations[0];
        }

        // Determine new resolution
        let newResolution = settings.resolution;
        const availableRes = (newModel as any).durationResolutionMap?.[newDuration] || newModel.resolutions || VIDEO_RESOLUTIONS;
        if (!availableRes.includes(newResolution) && availableRes.length > 0) {
            newResolution = availableRes[0];
        }

        setSettings({
            model: modelId,
            duration: newDuration,
            resolution: newResolution
        });
        setShowModelDropdown(false);
    };

    // Use currentModel derived from settings state
    // ...

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className={`absolute inset-0 ${overlayClass} backdrop-blur-sm motion-modal-overlay-in`} />

            {/* Modal */}
            <div className={`relative rounded-xl shadow-[0_18px_44px_rgba(0,0,0,0.18)] w-full max-w-4xl max-h-[90vh] overflow-hidden border flex flex-col motion-modal-dialog-in ${dialogClass}`}>
                {/* Header */}
                <div className={`px-5 py-4 border-b flex items-center justify-between z-10 ${headerBorderClass} ${isDark ? 'bg-[#151815]' : 'bg-white'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${headerIconClass}`}>
                            <Film size={19} className="text-[#D8FF00]" />
                        </div>
                        <div>
                            <h2 className={`text-base font-semibold leading-5 ${titleClass}`}>{t(language, 'createStoryVideosTitle')}</h2>
                            <p className={`text-xs leading-4 ${bodyTextClass}`}>{t(language, 'createStoryVideosDesc')}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={t(language, 'closeStoryVideoModal')}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${closeHoverClass}`}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content - Scrollable List of Scenes */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {sortedScenes.length === 0 ? (
                        <div className="text-center text-neutral-500 py-12">
                                    {t(language, 'noScenesAvailable')}
                        </div>
                    ) : (
                        sortedScenes.map((scene, index) => (
                            <div key={scene.id} className="flex gap-2 items-center group/card">
                                {/* Remove Button - Left side */}
                                <button
                                    onClick={() => handleRemoveScene(scene.id)}
                                    aria-label={t(language, 'removeScene')}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-600 opacity-0 transition-[background-color,color,opacity] duration-150 hover:bg-red-500/[0.08] hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 group-hover/card:opacity-100"
                                    title={t(language, 'removeScene')}
                                >
                                    <Trash2 size={16} />
                                </button>

                                <div className={`flex-1 flex gap-4 border rounded-lg p-4 transition-colors duration-150 ${panelClass} ${isDark ? 'hover:border-neutral-700' : 'hover:border-neutral-300'}`}>
                                    {/* Scene Image Helper */}
                                    <div className={`w-48 aspect-video rounded-lg overflow-hidden border shrink-0 relative group ${previewSurfaceClass}`}>
                                        {scene.resultUrl ? (
                                            <img src={scene.resultUrl} alt={`${t(language, 'sceneAlt')} ${index + 1}`} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-500">{t(language, 'noImage')}</div>
                                        )}
                                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-medium text-white border border-white/10">
                                            {t(language, 'scene')} {index + 1}
                                        </div>
                                    </div>

                                    {/* Prompt Input Area */}
                                    <div className="flex-1 flex flex-col gap-2 relative">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-medium text-neutral-400">{t(language, 'videoPrompt')}</label>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleOptimizePrompt(scene.id)}
                                                    disabled={generatingPrompts[scene.id] || optimizingPrompts[scene.id] || !prompts[scene.id]}
                                                    className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[#D8FF00] transition-colors hover:text-[#e4ff3a] disabled:cursor-not-allowed disabled:text-neutral-600"
                                                    title={t(language, 'enhancePromptWithAI')}
                                                >
                                                    {optimizingPrompts[scene.id] ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : (
                                                        <Wand2 size={12} />
                                                    )}
                                                    {t(language, 'optimize')}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="relative flex-1">
                                            <textarea
                                                value={prompts[scene.id] || ''}
                                                onChange={(e) => setPrompts(prev => ({ ...prev, [scene.id]: e.target.value }))}
                                                placeholder={t(language, 'describeSceneMotionPlaceholder')}
                                                className={`w-full h-full min-h-[100px] border rounded-lg p-3 text-sm focus:outline-none focus:border-[#D8FF00]/60 focus:ring-2 focus:ring-[#D8FF00]/20 resize-none transition-[background-color,border-color,box-shadow] duration-150 ${fieldClass}`}
                                            />

                                            {/* Auto-Generate Overlay Button */}
                                            {(!prompts[scene.id] || prompts[scene.id].trim() === '') && (
                                                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                                    <button
                                                        onClick={() => handleGeneratePrompt(scene.id)}
                                                        disabled={generatingPrompts[scene.id]}
                                                        className="pointer-events-auto flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg text-[#D8FF00] opacity-80 transition-[color,opacity] duration-150 hover:text-[#e4ff3a] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                                                    >
                                                        {generatingPrompts[scene.id] ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <Sparkles size={14} />
                                                        )}
                                                        <span className="text-sm font-medium">{t(language, 'autoGenerate')}</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer - Global Settings & Action */}
                <div className={`px-5 py-4 border-t ${headerBorderClass} ${footerClass}`}>
                    <div className="flex items-center justify-between gap-3">
                        {/* Settings */}
                        <div className="flex min-w-0 items-center gap-3">
                            {/* Model Selector */}
                            <div className="flex flex-col gap-1" ref={modelDropdownRef}>
                                <label className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wide">{t(language, 'model')}</label>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                                        className={`flex h-9 min-w-[160px] shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3 text-xs transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                                            isDark
                                                ? 'bg-[#151815] text-neutral-100 border-neutral-700 hover:border-neutral-600 hover:bg-[#1A1D1A]'
                                                : 'bg-white text-neutral-900 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-100'
                                        }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Film size={14} />
                                            <span className="truncate">{currentModel.name}</span>
                                        </div>
                                        <ChevronDown size={14} className="opacity-50" />
                                    </button>

                                    {/* Dropdown */}
                                    {showModelDropdown && (
                                        <div className={`absolute bottom-full mb-2 left-0 w-64 border rounded-lg overflow-hidden z-50 flex flex-col max-h-[400px] overflow-y-auto motion-menu-in ${menuSurfaceClass}`}>
                                            <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${menuHeaderClass}`}>MYML</div>
                                            {VIDEO_MODELS.map(model => (
                                                <button
                                                    key={model.id}
                                                    disabled
                                                    title={VIDEO_DISABLED_MESSAGE}
                                                    onClick={() => handleModelChange(model.id)}
                                                    className={`flex h-9 w-full cursor-not-allowed items-center justify-between gap-2 px-3 text-xs opacity-70 transition-colors ${menuItemClass(settings.model === model.id)}`}
                                                >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Film size={14} />
                                                        {model.name}
                                                    </div>
                                                    {settings.model === model.id && <Check size={14} />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Duration Selector - Dynamic based on model */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wide">{t(language, 'duration')}</label>
                                <select
                                    value={settings.duration}
                                    disabled
                                    onChange={(e) => setSettings(prev => ({ ...prev, duration: Number(e.target.value) }))}
                                    title={VIDEO_DISABLED_MESSAGE}
                                    className={`text-xs px-3 py-2 rounded-lg border opacity-70 cursor-not-allowed focus:outline-none focus:border-[#D8FF00]/60 focus:ring-2 focus:ring-[#D8FF00]/20 min-w-[80px] ${
                                        isDark ? 'bg-[#151815] text-neutral-100 border-neutral-700' : 'bg-white text-neutral-900 border-neutral-200'
                                    }`}
                                >
                                    {currentModel.durations.map(d => (
                                        <option key={d} value={d}>{d}s</option>
                                    ))}
                                </select>
                            </div>

                            {/* Resolution Selector */}
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wide">{t(language, 'resolution')}</label>
                                <select
                                    value={settings.resolution}
                                    disabled
                                    onChange={(e) => setSettings(prev => ({ ...prev, resolution: e.target.value }))}
                                    title={VIDEO_DISABLED_MESSAGE}
                                    className={`text-xs px-3 py-2 rounded-lg border opacity-70 cursor-not-allowed focus:outline-none focus:border-[#D8FF00]/60 focus:ring-2 focus:ring-[#D8FF00]/20 min-w-[80px] ${
                                        isDark ? 'bg-[#151815] text-neutral-100 border-neutral-700' : 'bg-white text-neutral-900 border-neutral-200'
                                    }`}
                                >
                                    {availableResolutions.map(res => (
                                        <option key={res} value={res}>{res}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Generate Action */}
                        <div className="flex items-center gap-3">
                            <div className="text-right mr-2">
                                <div className="text-xs text-neutral-400">{VIDEO_DISABLED_MESSAGE}</div>
                                <div className={`text-sm font-medium ${titleClass}`}>{t(language, 'notAvailable')}</div>
                            </div>
                            <button
                                disabled
                                title={VIDEO_DISABLED_MESSAGE}
                                onClick={() => onCreateVideos(prompts, settings, sortedScenes.map(s => s.id))}
                                className={`flex h-9 shrink-0 cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-lg pl-4 pr-5 text-sm font-semibold opacity-70 transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${
                                    isDark ? 'bg-neutral-800 text-neutral-500' : 'bg-neutral-100 text-neutral-400'
                                }`}
                            >
                                <Play size={16} fill="currentColor" />
                                {t(language, 'generateStoryVideos')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
