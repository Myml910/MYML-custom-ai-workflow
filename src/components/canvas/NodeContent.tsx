/**
 * NodeContent.tsx
 * 
 * Displays the content area of a canvas node.
 * Handles result display (image/video) and placeholder states.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Loader2, Maximize2, ImageIcon as ImageIcon, Film, Upload, Pencil, Video, GripVertical, Download, Expand, Shrink, HardDrive } from 'lucide-react';
import { NodeData, NodeStatus, NodeType } from '../../types';
import { Language, t } from '../../i18n/translations';
import { cancelTask } from '../../services/generationService';

interface NodeContentProps {
    data: NodeData;
    inputUrl?: string;
    selected: boolean;
    isIdle: boolean;
    isLoading: boolean;
    isSuccess: boolean;
    getAspectRatioStyle: () => { aspectRatio: string };
    onUpload?: (nodeId: string, imageDataUrl: string) => void;
    onExpand?: (imageUrl: string) => void;
    onDragStart?: (nodeId: string, hasContent: boolean) => void;
    onDragEnd?: () => void;
    // Text node callbacks
    onWriteContent?: (nodeId: string) => void;
    onTextToVideo?: (nodeId: string) => void;
    onTextToImage?: (nodeId: string) => void;
    // Image node callbacks
    onImageToImage?: (nodeId: string) => void;
    onImageToVideo?: (nodeId: string) => void;
    onUpdate?: (nodeId: string, updates: Partial<NodeData>) => void;
    // Social sharing
    onPostToX?: (nodeId: string, mediaUrl: string, mediaType: 'image' | 'video') => void;
    language?: Language;
}

function withDisplayCacheBust(url: string | undefined, version: string): string | undefined {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }

    const [pathAndQuery, hash] = url.split('#');
    const separator = pathAndQuery.includes('?') ? '&' : '?';
    const displayUrl = `${pathAndQuery}${separator}v=${encodeURIComponent(version)}`;

    return hash ? `${displayUrl}#${hash}` : displayUrl;
}

export const NodeContent: React.FC<NodeContentProps> = ({
    data,
    inputUrl,
    selected,
    isIdle,
    isLoading,
    isSuccess,
    getAspectRatioStyle,
    onUpload,
    onExpand,
    onDragStart,
    onDragEnd,
    onWriteContent,
    onTextToVideo,
    onTextToImage,
    onImageToImage,
    onImageToVideo,
    onUpdate,
    onPostToX,
    language = 'zh'
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Local state for text node textarea to prevent lag
    const [localPrompt, setLocalPrompt] = useState(data.prompt || '');
    const [isCancellingQueuedTask, setIsCancellingQueuedTask] = useState(false);
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSentPromptRef = useRef<string | undefined>(data.prompt); // Track what we sent

    // Helper: Check if node is image-type (includes local image model)
    const isImageType = data.type === NodeType.IMAGE || data.type === NodeType.LOCAL_IMAGE_MODEL;
    // Helper: Check if node is video-type (includes local video model)
    const isVideoType = data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL;
    // Helper: Check if node is local model
    const isLocalModel = data.type === NodeType.LOCAL_IMAGE_MODEL || data.type === NodeType.LOCAL_VIDEO_MODEL;
    const imageDisplayVersion = [
        data.id,
        data.taskId || '',
        data.generationStatus || '',
        data.progress ?? '',
        data.resultAspectRatio || ''
    ].join('|');
    const displayResultUrl = React.useMemo(
        () => withDisplayCacheBust(data.resultUrl, imageDisplayVersion),
        [data.resultUrl, imageDisplayVersion]
    );
    const generationStatusLabel = (() => {
        if (language === 'zh') {
            if (data.generationStatus === 'queued') return '排队中';
            if (data.generationStatus === 'running') return '生成中';
            if (data.generationStatus === 'polling') return '等待结果';
            if (data.generationStatus === 'timeout') return '生成超时';
            if (data.generationStatus === 'failed') return '生成失败';
            if (data.generationStatus === 'cancelled') return '已取消';
        }

        if (data.generationStatus === 'queued') return 'Queued';
        if (data.generationStatus === 'running') return 'Generating';
        if (data.generationStatus === 'polling') return 'Waiting for result';
        if (data.generationStatus === 'timeout') return 'Timed out';
        if (data.generationStatus === 'failed') return 'Failed';
        if (data.generationStatus === 'cancelled') return 'Cancelled';
        return t(language, 'generating');
    })();

    // Sync local state ONLY when data.prompt changes externally (not from our own update)
    useEffect(() => {
        if (data.prompt !== lastSentPromptRef.current) {
            setLocalPrompt(data.prompt || '');
            lastSentPromptRef.current = data.prompt;
        }
    }, [data.prompt]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, []);

    const handleTextChange = (value: string) => {
        setLocalPrompt(value); // Update local state immediately
        lastSentPromptRef.current = value; // Track that we're about to send this

        // Debounce parent update
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            onUpdate?.(data.id, { prompt: value });
        }, 150);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onUpload) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            onUpload(data.id, reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const canCancelQueuedTask = data.generationStatus === 'queued' && Boolean(data.taskId);

    const handleCancelQueuedTask = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (!data.taskId || !onUpdate || isCancellingQueuedTask) return;

        setIsCancellingQueuedTask(true);
        try {
            await cancelTask(data.taskId);
            onUpdate(data.id, {
                status: data.resultUrl ? NodeStatus.SUCCESS : NodeStatus.IDLE,
                taskId: undefined,
                generationStatus: undefined,
                progress: undefined,
                errorMessage: undefined
            });
        } catch (error: any) {
            onUpdate(data.id, {
                status: NodeStatus.ERROR,
                errorMessage: error?.message || 'Failed to cancel queued task'
            });
        } finally {
            setIsCancellingQueuedTask(false);
        }
    };

    return (
        <div className={`transition-[background-color,border-color,opacity] duration-[var(--myml-motion-base)] ${!selected ? 'p-0 rounded-[var(--myml-radius-panel)] overflow-hidden' : 'p-1'}`}>
            {/* Hidden File Input - Always rendered for upload functionality (image types only) */}
            {isImageType && onUpload && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
            )}

            {/* Result View - Show when successful OR when regenerating (loading with existing content) */}
            {(isSuccess || isLoading) && data.resultUrl ? (
                <div
                    className={`relative w-full ${data.hideGenerationControls ? 'bg-transparent' : 'bg-black'} group/image ${!selected ? '' : 'rounded-[var(--myml-radius-panel)] overflow-hidden'}`}
                    style={getAspectRatioStyle()}
                    onDoubleClick={(e) => {
                        if (isVideoType || !data.resultUrl) return;

                        e.stopPropagation();
                        onExpand?.(displayResultUrl || data.resultUrl);
                    }}
                    title={!isVideoType ? t(language, 'viewFullSize') : undefined}
                >
                    {isVideoType ? (
                        <video src={data.resultUrl} controls loop className="w-full h-full object-cover" />
                    ) : (
                        <img
                            key={`${data.id}-${displayResultUrl || data.resultUrl}`}
                            src={displayResultUrl || data.resultUrl}
                            alt={t(language, 'generated')}
                            className="w-full h-full object-cover pointer-events-none"
                        />
                    )}

                    {/* Regenerating Overlay - Shows when loading with existing content */}
                    {isLoading && (
                        <div className={`absolute inset-0 z-[1] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center ${canCancelQueuedTask ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                            <Loader2 size={40} className="animate-spin text-[#D8FF00]" />
                            <span className="mt-3 text-sm text-white font-medium">{generationStatusLabel || t(language, 'regenerating')}</span>
                            {canCancelQueuedTask && (
                                <button
                                    type="button"
                                    onClick={handleCancelQueuedTask}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    disabled={isCancellingQueuedTask}
                                    className="mt-3 h-7 rounded-[var(--myml-radius-control)] border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isCancellingQueuedTask
                                        ? (language === 'zh' ? '取消中' : 'Cancelling')
                                        : (language === 'zh' ? '取消排队' : 'Cancel queue')
                                    }
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : data.type === NodeType.TEXT ? (
                /* Text Node - Menu or Editing Mode */
                <div className={`relative w-full overflow-hidden rounded-[var(--myml-radius-panel)] bg-[var(--myml-surface-raised)] ${selected ? 'ring-1 ring-[var(--myml-border-active)]' : ''}`}>
                    {data.textMode === 'editing' ? (
                        /* Editing Mode - Text Area */
                        <div className="p-4">
                            <textarea
                                value={localPrompt}
                                onChange={(e) => handleTextChange(e.target.value)}
                                onPointerDown={(e) => e.stopPropagation()}
                                onWheel={(e) => e.stopPropagation()}
                                onBlur={() => {
                                    // Ensure final value is saved on blur
                                    if (updateTimeoutRef.current) {
                                        clearTimeout(updateTimeoutRef.current);
                                    }
                                    if (localPrompt !== data.prompt) {
                                        onUpdate?.(data.id, { prompt: localPrompt });
                                    }
                                }}
                                placeholder={t(language, 'writeTextContentPlaceholder')}
                                className="w-full bg-transparent text-sm text-[var(--myml-text-primary)] resize-none outline-none placeholder:text-[var(--myml-text-faint)]"
                                style={{ minHeight: data.isPromptExpanded ? '300px' : '150px' }}
                                autoFocus
                            />
                            {/* Expand/Shrink Button */}
                            <div className="flex justify-end mt-2">
                                <button
                                    onClick={() => onUpdate?.(data.id, { isPromptExpanded: !data.isPromptExpanded })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[10px] text-[var(--myml-text-muted)] transition-colors hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                                    title={data.isPromptExpanded ? t(language, 'shrinkTextArea') : t(language, 'expandTextArea')}
                                    aria-label={data.isPromptExpanded ? t(language, 'shrinkTextArea') : t(language, 'expandTextArea')}
                                >
                                    {data.isPromptExpanded ? <Shrink size={12} /> : <Expand size={12} />}
                                    <span>{data.isPromptExpanded ? t(language, 'shrink') : t(language, 'expand')}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Menu Mode - Show Options */
                        <div className="p-5 flex flex-col gap-4">
                            {/* Header */}
                            <div className="text-[var(--myml-text-muted)] text-sm font-medium">
                                {t(language, 'tryTo')}
                            </div>

                            {/* Menu Options */}
                            <div className="flex flex-col gap-1">
                                <TextNodeMenuItem
                                    icon={<Pencil size={16} />}
                                    label={t(language, 'writeOwnContent')}
                                    onClick={() => onWriteContent?.(data.id)}
                                />
                                <TextNodeMenuItem
                                    icon={<Video size={16} />}
                                    label={t(language, 'textToVideo')}
                                    onClick={() => onTextToVideo?.(data.id)}
                                />
                                <TextNodeMenuItem
                                    icon={<ImageIcon size={16} />}
                                    label={t(language, 'textToImage')}
                                    onClick={() => onTextToImage?.(data.id)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Placeholder / Empty State for Image/Video */
                <div className={`relative w-full aspect-[4/3] bg-[var(--myml-surface-base)] flex flex-col items-center justify-center gap-3 overflow-hidden
            ${isLoading ? 'animate-pulse' : ''} 
            ${!selected ? 'rounded-[var(--myml-radius-panel)]' : 'rounded-[var(--myml-radius-panel)] border border-dashed border-[var(--myml-border-default)]'}`
                }>
                    {/* Input Image Preview for Video Nodes */}
                    {isVideoType && inputUrl && (
                        <div className="absolute inset-0 z-0">
                            <img src={inputUrl} alt={t(language, 'inputFrame')} className="w-full h-full object-cover opacity-30 blur-sm" />
                            <div className="absolute inset-0 bg-black/40" />
                            <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                                <ImageIcon size={10} />
                                {t(language, 'inputFrame')}
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="relative z-10 flex flex-col items-center gap-2">
                            <Loader2 size={32} className="animate-spin text-[#D8FF00]" />
                            <span className="text-xs text-[var(--myml-text-muted)] font-medium">{generationStatusLabel}</span>
                            {canCancelQueuedTask && (
                                <button
                                    type="button"
                                    onClick={handleCancelQueuedTask}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    disabled={isCancellingQueuedTask}
                                    className="h-7 rounded-[var(--myml-radius-control)] border border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] px-3 text-xs font-semibold text-[var(--myml-text-primary)] transition-colors hover:bg-[var(--myml-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isCancellingQueuedTask
                                        ? (language === 'zh' ? '取消中' : 'Cancelling')
                                        : (language === 'zh' ? '取消排队' : 'Cancel queue')
                                    }
                                </button>
                            )}
                        </div>
                    ) : data.status === NodeStatus.ERROR ? (
                        <div className="relative z-10 flex max-w-[80%] flex-col items-center gap-2 text-center">
                            <span className="text-xs font-semibold text-red-400">{generationStatusLabel}</span>
                            {data.errorMessage && (
                                <span className="text-[11px] leading-snug text-[var(--myml-text-muted)]">{data.errorMessage}</span>
                            )}
                        </div>
                    ) : (
                        <div className="relative z-10 flex flex-col items-center gap-3">
                            {/* Upload Button for Image Nodes (including local image models) */}
                            {isImageType && onUpload && (
                                <>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--myml-radius-control)] bg-[var(--myml-surface-raised)] px-3.5 text-sm font-medium text-[var(--myml-text-primary)] transition-colors hover:bg-[var(--myml-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                                    >
                                        <Upload size={16} />
                                        {t(language, 'upload')}
                                    </button>
                                </>
                            )}

                            <div className="text-[var(--myml-text-faint)]">
                                {isVideoType ? (
                                    isLocalModel ? <><Film size={40} /><HardDrive size={16} className="absolute -bottom-1 -right-1 text-[#D8FF00]" /></> : <Film size={40} />
                                ) : (
                                    isLocalModel ? <><ImageIcon size={40} /><HardDrive size={16} className="absolute -bottom-1 -right-1 text-[#D8FF00]" /></> : <ImageIcon size={40} />
                                )}
                            </div>
                            {selected && (
                                <>
                                    <div className="text-[var(--myml-text-muted)] text-sm font-medium">
                                        {isVideoType && inputUrl
                                            ? t(language, 'readyToAnimate')
                                            : isVideoType
                                                ? t(language, 'waitingForInput')
                                                : isLocalModel
                                                    ? t(language, 'selectModelAndPrompt')
                                                    : t(language, 'tryTo')
                                        }
                                    </div>
                                    {!isVideoType && !isLocalModel && (
                                        <div className="flex flex-col gap-1 w-full px-2">
                                            <TextNodeMenuItem
                                                icon={<ImageIcon size={16} />}
                                                label={t(language, 'imageToImage')}
                                                onClick={() => onImageToImage?.(data.id)}
                                            />
                                            <TextNodeMenuItem
                                                icon={<Film size={16} />}
                                                label={t(language, 'imageToVideo')}
                                                onClick={() => onImageToVideo?.(data.id)}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface TextNodeMenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
}

/**
 * Menu item component for Text node options
 */
const TextNodeMenuItem: React.FC<TextNodeMenuItemProps> = ({ icon, label, onClick }) => (
    <button
                    className="flex h-9 w-full items-center gap-3 rounded-[var(--myml-radius-control)] px-2.5 text-left text-[var(--myml-text-muted)] transition-colors duration-[var(--myml-motion-base)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClick}
    >
        <span className="text-[var(--myml-text-muted)]">{icon}</span>
        <span className="truncate text-sm font-medium">{label}</span>
    </button>
);
