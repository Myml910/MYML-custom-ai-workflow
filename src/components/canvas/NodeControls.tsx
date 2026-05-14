/**
 * NodeControls.tsx
 * 
 * Control panel for canvas nodes.
 * Handles prompt input, model selection, size/ratio settings, and generation button.
 * For Video nodes: includes Advanced Settings for frame-to-frame mode.
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { Sparkles, Banana, Settings2, Check, ChevronDown, ChevronUp, GripVertical, Image as ImageIcon, Film, Clock, Expand, Shrink, Monitor, Crop, HardDrive, X } from 'lucide-react';
import { NodeData, NodeStatus, NodeType } from '../../types';
import { OpenAIIcon, GoogleIcon, KlingIcon, HailuoIcon } from '../icons/BrandIcons';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { ChangeAnglePanel } from './ChangeAnglePanel';
import { LocalModel, getLocalModels } from '../../services/localModelService';
import { Language, t } from '../../i18n/translations';
import { isImageReferenceType } from '../../utils/imageReferences';
import { ActionRow, PanelSection, SegmentedControl, StatusDot } from '../ui';

interface NodeControlsProps {
    data: NodeData;
    inputUrl?: string;
    isLoading: boolean;
    isSuccess: boolean;
    connectedImageNodes?: {
        id: string;
        url: string;
        type?: NodeType;
        status?: NodeStatus;
        resultUrl?: string;
        referenceSourceId?: string;
        referenceSourceType?: NodeType;
        isFallbackReference?: boolean;
    }[]; // Connected parent nodes
    onUpdate: (id: string, updates: Partial<NodeData>) => void;
    onGenerate: (id: string) => void;
    onChangeAngleGenerate?: (nodeId: string) => void;
    onSelect: (id: string) => void;
    zoom: number;
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

const IMAGE_RATIOS = [
    "Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"
];

const MAX_IMAGE_REFERENCES = 6;
const IMAGE_GENERATION_COUNTS = [1, 2, 3, 4] as const;

const VIDEO_RESOLUTIONS = [
    "Auto", "1080p", "768p", "720p", "512p"
];

// Video durations in seconds
const VIDEO_DURATIONS = [5, 6, 8, 10];

// Video model versions with metadata
// supportsTextToVideo: Can generate video from text prompt only
// supportsImageToVideo: Can use a single input image (start frame)
// supportsMultiImage: Can use multiple input images (frame-to-frame)
// durations: Supported video durations in seconds
// resolutions: Supported resolutions (model-specific)
// aspectRatios: Supported aspect ratios (most video models support 16:9 and 9:16)
const VIDEO_ASPECT_RATIOS = ["16:9", "9:16"];

const VIDEO_MODELS = [
    { id: 'veo-3.1', name: 'Veo 3.1', provider: 'google', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [4, 6, 8], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    { id: 'custom-video-seedance-2-0', name: 'Seedance 2.0', provider: 'custom', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '480p', '720p', '1080p'], aspectRatios: ['Auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21', 'keep_ratio', 'adaptive'], disabled: true, disabledReason: 'notConnected' },
    // Kling AI models - Consolidated: removed legacy v1, v1-5, v1-6, v2-master
    { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, recommended: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    { id: 'kling-v2-1-master', name: 'Kling V2.1 Master', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    { id: 'kling-v2-5-turbo', name: 'Kling V2.5 Turbo', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    { id: 'kling-v2-6', name: 'Kling 2.6 (Motion)', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    // Hailuo AI (MiniMax) models - Note: API appears to only output 5s videos regardless of duration param
    { id: 'hailuo-2.3', name: 'Hailuo 2.3', provider: 'hailuo', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5], resolutions: ['768p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    { id: 'hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', provider: 'hailuo', supportsTextToVideo: false, supportsImageToVideo: true, supportsMultiImage: false, durations: [5], resolutions: ['768p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
    { id: 'hailuo-02', name: 'Hailuo 02', provider: 'hailuo', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5], resolutions: ['768p', '1080p'], aspectRatios: ['16:9', '9:16'], disabled: true, disabledReason: 'notConfigured' },
];

// Image model versions with metadata
// supportsImageToImage: Can use a single reference image (for image-to-image transformation)
// supportsMultiImage: Can use multiple reference images (2-4) via Multi-Image API
// Note: Kling V1 and V2-new don't support reference images in standard API
// Note: Kling V1.5 is the only Kling model supporting single-image reference via image_reference
// Note: Kling V2/V2.1 only support references via Multi-Image API
// aspectRatios: Supported aspect ratios for the model
const IMAGE_MODELS = [
    {
    id: 'custom-image-gpt-image-2',
    name: 'T8star GPT Image 2',
    provider: 'custom',
    supportsImageToImage: true,
    supportsMultiImage: true,
    recommended: true,
    resolutions: ['Auto', '2k', '4k'],
    aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']
    },
    {
        id: 'custom-image-grok-4.2-image',
        name: 'Grok 4.2 Image',
        provider: 'custom',
        supportsImageToImage: false,
        supportsMultiImage: false,
        resolutions: ['Auto', '2k', '4k'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']
    },
    {
        id: 'gpt-image-1.5',
        name: 'GPT Image 1.5',
        provider: 'openai',
        supportsImageToImage: true,
        supportsMultiImage: true,
        recommended: true,
        disabled: true,
        disabledReason: 'notConfigured',
        resolutions: ["Auto", "1K", "2K", "4K"],
        // OpenAI uses exact pixel sizes, not aspect ratios
        aspectRatios: ["Auto", "1024x1024", "1536x1024", "1024x1536"]
    },
    {
        id: 'gemini-pro',
        name: 'Nano Banana Pro',
        provider: 'google',
        supportsImageToImage: true,
        supportsMultiImage: true,
        disabled: true,
        disabledReason: 'notConfigured',
        resolutions: ["1K", "2K", "4K"],
        aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"]
    },
    {
        id: 'custom-image-nano-banana-3-1-flash',
        name: 'Nano Banana 3.1 Flash',
        provider: 'custom',
        supportsImageToImage: true,
        supportsMultiImage: true,
        resolutions: ['Auto', '1K', '2K', '4K'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '1:4', '4:1', '8:1', '1:8']
    },
    // Kling AI models - Consolidated: removed legacy v1, v2, v2-new
    {
        id: 'kling-v1-5',
        name: 'Kling V1.5',
        provider: 'kling',
        supportsImageToImage: true, // V1.5 supports image_reference for subject/face
        supportsMultiImage: false,
        disabled: true,
        disabledReason: 'notConfigured',
        resolutions: ["1K", "2K"],
        aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"]
    },
    {
        id: 'kling-v2-1',
        name: 'Kling V2.1',
        provider: 'kling',
        supportsImageToImage: false, // V2.1 requires Multi-Image API
        supportsMultiImage: true,    // Use Multi-Image API with subject_image_list
        recommended: true,
        disabled: true,
        disabledReason: 'notConfigured',
        resolutions: ["1K", "2K"],
        aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"]
    },
];

const isModelDisabled = (model?: any) =>
    Boolean(model?.disabled || model?.status === 'disabled' || model?.status === 'comingSoon');

const getModelDisabledReason = (model?: any, language: Language = 'en') => {
    const reason = model?.disabledReason;
    if (reason === 'notConfigured') return language === 'zh' ? '\u672a\u914d\u7f6e' : 'Not configured';
    if (reason === 'notConnected') return language === 'zh' ? '\u672a\u63a5\u5165' : 'Not connected';
    if (model?.status === 'comingSoon') return language === 'zh' ? '\u5373\u5c06\u63a8\u51fa' : 'Coming soon';
    return reason || (language === 'zh' ? '\u672a\u63a5\u5165' : 'Not connected');
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build a prompt that includes angle transformation instructions
 * for generating the image from a different viewing angle
 */
function buildAnglePrompt(
    basePrompt: string,
    settings: { rotation: number; tilt: number; zoom: number; wideAngle: boolean }
): string {
    const parts: string[] = [];

    // Base instruction
    parts.push('Generate this same image from a different camera angle.');

    // Rotation (horizontal)
    if (settings.rotation !== 0) {
        const direction = settings.rotation > 0 ? 'right' : 'left';
        parts.push(`The camera has rotated ${Math.abs(settings.rotation)} degrees to the ${direction}.`);
    }

    // Tilt (vertical)
    if (settings.tilt !== 0) {
        const direction = settings.tilt > 0 ? 'upward' : 'downward';
        parts.push(`The camera has tilted ${Math.abs(settings.tilt)} degrees ${direction}.`);
    }

    // Zoom
    if (settings.zoom !== 0) {
        if (settings.zoom > 50) {
            parts.push('The camera is positioned closer to the subject.');
        } else if (settings.zoom < 50 && settings.zoom > 0) {
            parts.push('The camera is positioned slightly closer.');
        }
    }

    // Wide-angle lens
    if (settings.wideAngle) {
        parts.push('Use a wide-angle lens perspective with visible distortion at the edges.');
    }

    // Add original prompt context if provided
    if (basePrompt.trim()) {
        parts.push(`Original scene description: ${basePrompt}`);
    }

    return parts.join(' ');
}

const NodeControlsComponent: React.FC<NodeControlsProps> = ({
    data,
    inputUrl,
    isLoading,
    isSuccess,
    connectedImageNodes = [],
    onUpdate,
    onGenerate,
    onChangeAngleGenerate,
    onSelect,
    zoom,
    canvasTheme = 'dark',
    language = 'zh'
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSizeDropdown, setShowSizeDropdown] = useState(false);
    const [showAspectRatioDropdown, setShowAspectRatioDropdown] = useState(false);
    const [showDurationDropdown, setShowDurationDropdown] = useState(false);
    const [showResolutionDropdown, setShowResolutionDropdown] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [localPrompt, setLocalPrompt] = useState(data.prompt || '');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const aspectRatioDropdownRef = useRef<HTMLDivElement>(null);
    const durationDropdownRef = useRef<HTMLDivElement>(null);
    const resolutionDropdownRef = useRef<HTMLDivElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSentPromptRef = useRef<string | undefined>(data.prompt); // Track what we sent

    // Local model state for LOCAL_IMAGE_MODEL and LOCAL_VIDEO_MODEL nodes
    const [localModels, setLocalModels] = useState<LocalModel[]>([]);
    const [isLoadingLocalModels, setIsLoadingLocalModels] = useState(false);
    const isLocalModelNode = data.type === NodeType.LOCAL_IMAGE_MODEL || data.type === NodeType.LOCAL_VIDEO_MODEL;

    // Fetch local models when node is a local model type
    useEffect(() => {
        if (!isLocalModelNode) return;

        const fetchModels = async () => {
            setIsLoadingLocalModels(true);
            try {
                const models = await getLocalModels();
                // Filter based on node type
                const filtered = data.type === NodeType.LOCAL_VIDEO_MODEL
                    ? models.filter(m => m.type === 'video')
                    : models.filter(m => m.type === 'image' || m.type === 'lora' || m.type === 'controlnet');
                setLocalModels(filtered);
            } catch (error) {
                console.error('Error fetching local models:', error);
            } finally {
                setIsLoadingLocalModels(false);
            }
        };
        fetchModels();
    }, [isLocalModelNode, data.type]);

    // Face detection hook for Kling V1.5 Face mode
    const { detectFaces, isModelLoaded: isFaceModelLoaded } = useFaceDetection();

    // Trigger face detection when Face mode is selected
    useEffect(() => {
        const runFaceDetection = async () => {
            if (
                data.klingReferenceMode === 'face' &&
                data.faceDetectionStatus === 'loading' &&
                connectedImageNodes?.[0]?.url &&
                isFaceModelLoaded
            ) {
                try {
                    const faces = await detectFaces(connectedImageNodes[0].url);
                    onUpdate(data.id, {
                        detectedFaces: faces,
                        faceDetectionStatus: faces.length > 0 ? 'success' : 'error'
                    });
                } catch (err) {
                    console.error('Face detection failed:', err);
                    onUpdate(data.id, { detectedFaces: [], faceDetectionStatus: 'error' });
                }
            }
        };
        runFaceDetection();
    }, [data.klingReferenceMode, data.faceDetectionStatus, connectedImageNodes, isFaceModelLoaded, detectFaces, onUpdate, data.id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowSizeDropdown(false);
            }
            if (aspectRatioDropdownRef.current && !aspectRatioDropdownRef.current.contains(event.target as Node)) {
                setShowAspectRatioDropdown(false);
            }
            if (durationDropdownRef.current && !durationDropdownRef.current.contains(event.target as Node)) {
                setShowDurationDropdown(false);
            }
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setShowModelDropdown(false);
            }
            if (resolutionDropdownRef.current && !resolutionDropdownRef.current.contains(event.target as Node)) {
                setShowResolutionDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sync local prompt with data.prompt ONLY when it changes externally (not from our own update)
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

    // Auto-open Advanced Settings when:
    // 1. 2+ images are connected to a video node (frame-to-frame)
    // 2. Kling 2.6 with an input image (has audio toggle)
    useEffect(() => {
        if (data.type === NodeType.VIDEO) {
            const shouldAutoExpand = connectedImageNodes.length >= 2 ||
                (data.videoModel === 'kling-v2-6' && connectedImageNodes.length > 0);
            if (shouldAutoExpand) {
                setShowAdvanced(true);
            }
        }
    }, [data.type, connectedImageNodes.length, data.videoModel]);

    // Handle prompt change with debounce
    const handlePromptChange = (value: string) => {
        setLocalPrompt(value); // Update local state immediately for responsive typing
        lastSentPromptRef.current = value; // Track that we're about to send this

        // Debounce the parent update
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            onUpdate(data.id, { prompt: value });
        }, 300); // 300ms debounce - increased for smoother typing
    };

    const handleSizeSelect = (value: string) => {
        if (data.type === NodeType.VIDEO) {
            onUpdate(data.id, { resolution: value });
        } else {
            onUpdate(data.id, { aspectRatio: value });
        }
        setShowSizeDropdown(false);
    };

    const handleAspectRatioSelect = (value: string) => {
        onUpdate(data.id, { aspectRatio: value });
        setShowAspectRatioDropdown(false);
    };

    const handleVideoModeChange = (mode: 'standard' | 'frame-to-frame') => {
        if (mode === 'frame-to-frame') {
            // Initialize frameInputs from connected nodes
            const initialFrameInputs = connectedImageNodes.slice(0, 2).map((node, idx) => ({
                nodeId: node.id,
                order: idx === 0 ? 'start' : 'end' as 'start' | 'end'
            }));
            onUpdate(data.id, { videoMode: mode, frameInputs: initialFrameInputs });
        } else {
            onUpdate(data.id, { videoMode: mode, frameInputs: undefined });
        }
    };

    const handleRemoveImageReference = (referenceId: string) => {
        onUpdate(data.id, {
            parentIds: (data.parentIds || []).filter(id => id !== referenceId)
        });
    };

    const handleFrameReorder = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex || connectedImageNodes.length < 2) return;

        // Get the two connected nodes
        const node1 = connectedImageNodes[0];
        const node2 = connectedImageNodes[1];

        // Get current orders (from saved data or default)
        const current1Order = data.frameInputs?.find(f => f.nodeId === node1.id)?.order || 'start';
        const current2Order = data.frameInputs?.find(f => f.nodeId === node2.id)?.order || 'end';

        // Swap the orders
        const updatedFrameInputs = [
            { nodeId: node1.id, order: current1Order === 'start' ? 'end' : 'start' as 'start' | 'end' },
            { nodeId: node2.id, order: current2Order === 'start' ? 'end' : 'start' as 'start' | 'end' }
        ];

        onUpdate(data.id, { frameInputs: updatedFrameInputs });
    };

    const currentSizeLabel = (data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL)
        ? (data.resolution || "Auto")
        : (data.aspectRatio || "Auto");

    // For image nodes, use model-specific aspect ratios (sizeOptions for video computed later with availableResolutions)
    const currentImageModelForRatios = IMAGE_MODELS.find(m => m.id === data.imageModel) || IMAGE_MODELS[0];
    const imageAspectRatioOptions = currentImageModelForRatios.aspectRatios || IMAGE_RATIOS;
    const isVideoNode = data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL;
    const isImageNode = data.type === NodeType.IMAGE || data.type === NodeType.LOCAL_IMAGE_MODEL;
    const hasConnectedImages = connectedImageNodes.length > 0;
    const orderedImageReferences = (data.type === NodeType.IMAGE || data.type === NodeType.IMAGE_EDITOR)
        ? (data.parentIds || [])
            .map(parentId => connectedImageNodes.find(node => node.id === parentId))
            .filter((node): node is NonNullable<typeof node> => Boolean(node && isImageReferenceType(node.type) && node.url))
            .slice(0, MAX_IMAGE_REFERENCES)
        : [];
    const formatReferenceLabel = (index: number) => (
        language === 'zh'
            ? `${t(language, 'refPrefix')}${index + 1}`
            : `${t(language, 'refPrefix')} ${index + 1}`
    );

    // Video model selection logic
    const currentVideoModel = VIDEO_MODELS.find(m => m.id === data.videoModel) || VIDEO_MODELS[0];
    const isFrameToFrame = data.videoMode === 'frame-to-frame';

    // Determine video generation mode based on inputs and settings
    // 1. Motion Control: If any parent is a video node
    // 2. Frame-to-Frame: If multiple image parents or explicitly set
    // 3. Image-to-Video: If single image parent or inputUrl (last frame)
    // 4. Text-to-Video: Otherwise
    const hasVideoParent = connectedImageNodes.some(n => n.type === NodeType.VIDEO);
    const imageInputCount = connectedImageNodes.filter(n => isImageReferenceType(n.type)).length;

    const videoGenerationMode = hasVideoParent ? 'motion-control'
        : (isFrameToFrame || imageInputCount >= 2) ? 'frame-to-frame'
            : (inputUrl || imageInputCount > 0) ? 'image-to-video'
                : 'text-to-video';

    // Filter video models based on mode
    const availableVideoModels = VIDEO_MODELS.filter(model => {
        if (videoGenerationMode === 'motion-control') return model.id === 'kling-v2-6'; // Only Kling 2.6 for now
        if (videoGenerationMode === 'text-to-video') return model.supportsTextToVideo;
        if (videoGenerationMode === 'image-to-video') return model.supportsImageToVideo;
        return model.supportsMultiImage; // frame-to-frame
    });

    // Auto-select first available video model when current is no longer valid
    useEffect(() => {
        if (data.type !== NodeType.VIDEO) return;

        const enabledVideoModels = availableVideoModels.filter(model => !isModelDisabled(model));
        const isCurrentModelAvailable = availableVideoModels.some(m => m.id === data.videoModel && !isModelDisabled(m));
        if (!isCurrentModelAvailable && enabledVideoModels.length > 0) {
            onUpdate(data.id, { videoModel: enabledVideoModels[0].id });
        }
    }, [videoGenerationMode, data.videoModel, data.type, data.id, availableVideoModels, onUpdate]);

    const handleVideoModelChange = (modelId: string) => {
        const newModel = VIDEO_MODELS.find(m => m.id === modelId);
        if (!newModel || isModelDisabled(newModel)) return;

        const updates: Partial<typeof data> = { videoModel: modelId };

        // Reset duration if current duration is not supported by new model
        if (newModel?.durations && data.videoDuration && !newModel.durations.includes(data.videoDuration)) {
            updates.videoDuration = newModel.durations[0];
        }

        // Reset resolution if current resolution is not supported by new model
        // Normalize to lowercase for comparison
        if (newModel?.resolutions && data.resolution) {
            const currentRes = data.resolution.toLowerCase();
            const supportedRes = newModel.resolutions.map(r => r.toLowerCase());
            if (!supportedRes.includes(currentRes)) {
                updates.resolution = newModel.resolutions[0];
            }
        }

        onUpdate(data.id, updates);
        setShowModelDropdown(false);
    };

    // Get available durations for current model
    const availableDurations = currentVideoModel.durations || [5];
    const currentDuration = data.videoDuration || availableDurations[0];

    // Get available resolutions for current model (considering duration for models with durationResolutionMap)
    const getAvailableResolutions = () => {
        const model = currentVideoModel as any;
        if (model.durationResolutionMap && currentDuration) {
            return model.durationResolutionMap[currentDuration] || model.resolutions || VIDEO_RESOLUTIONS;
        }
        return model.resolutions || VIDEO_RESOLUTIONS;
    };
    const availableResolutions = getAvailableResolutions();

    // sizeOptions: For video nodes use model-specific resolutions, for image nodes use aspect ratios
    const sizeOptions = (data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL)
        ? availableResolutions
        : imageAspectRatioOptions;

    const handleDurationChange = (duration: number) => {
        const model = currentVideoModel as any;
        const updates: Partial<typeof data> = { videoDuration: duration };

        // If model has duration-specific resolutions, reset resolution if needed
        if (model.durationResolutionMap) {
            const allowedResolutions = model.durationResolutionMap[duration] || model.resolutions;
            if (data.resolution && !allowedResolutions.includes(data.resolution.toLowerCase())) {
                updates.resolution = allowedResolutions[0];
            }
        }

        onUpdate(data.id, updates);
        setShowDurationDropdown(false);
    };

    // Image model selection logic
    const currentImageModel = IMAGE_MODELS.find(m => m.id === data.imageModel) || IMAGE_MODELS[0];

    // Filter image models based on connected inputs
    // 0 inputs = all models, 1 input = needs supportsImageToImage, 2+ inputs = needs supportsMultiImage
    const inputCount = connectedImageNodes.length;
    const availableImageModels = IMAGE_MODELS.filter(model => {
        if (inputCount === 0) return true; // Text-to-image: all models work
        if (inputCount === 1) return model.supportsImageToImage; // Single ref: filter out V2.1
        return model.supportsMultiImage; // Multi-ref: filter out V1, V1.5, V2 New
    });

    // Auto-select first available model when current model is no longer valid for the mode
    useEffect(() => {
        if (data.type !== NodeType.IMAGE && data.type !== NodeType.IMAGE_EDITOR) return;

        const enabledImageModels = availableImageModels.filter(model => !isModelDisabled(model));
        const isCurrentModelAvailable = availableImageModels.some(m => m.id === data.imageModel && !isModelDisabled(m));
        if (!isCurrentModelAvailable && enabledImageModels.length > 0) {
            // Auto-select first available model
            onUpdate(data.id, { imageModel: enabledImageModels[0].id });
        }
    }, [inputCount, data.imageModel, data.type, data.id, availableImageModels, onUpdate]);

    // Determine current generation mode for display
    const imageGenerationMode = inputCount === 0 ? 'text-to-image'
        : inputCount === 1 ? 'image-to-image'
            : 'multi-image';

    const handleImageModelChange = (modelId: string) => {
        const newModel = IMAGE_MODELS.find(m => m.id === modelId);
        if (!newModel || isModelDisabled(newModel)) return;

        const updates: Partial<typeof data> = { imageModel: modelId };

        // Reset aspect ratio if current ratio is not supported by new model
        if (newModel?.aspectRatios && data.aspectRatio && !newModel.aspectRatios.includes(data.aspectRatio)) {
            updates.aspectRatio = 'Auto';
        }

        // Reset resolution if current resolution is not supported by new model
        if (newModel?.resolutions && data.resolution && !newModel.resolutions.includes(data.resolution)) {
            updates.resolution = newModel.resolutions[0] || 'Auto';
        }

        onUpdate(data.id, updates);
        setShowModelDropdown(false);
    };

    // Handle local model selection
    const handleLocalModelChange = (model: LocalModel) => {
        onUpdate(data.id, {
            localModelId: model.id,
            localModelPath: model.path,
            localModelType: model.type as NodeData['localModelType'],
            localModelArchitecture: model.architecture
        });
        setShowModelDropdown(false);
    };

    // Get selected local model for display
    const selectedLocalModel = localModels.find(m => m.id === data.localModelId);

    const handleResolutionSelect = (value: string) => {
        onUpdate(data.id, { resolution: value });
        setShowResolutionDropdown(false);
    };

    const shouldShowVariantCount = data.type === NodeType.IMAGE;
    const generationCount = IMAGE_GENERATION_COUNTS.includes(data.generationCount as typeof IMAGE_GENERATION_COUNTS[number])
        ? data.generationCount as typeof IMAGE_GENERATION_COUNTS[number]
        : 1;

    const handleGenerationCountChange = (count: typeof IMAGE_GENERATION_COUNTS[number]) => {
        if (isLoading) return;
        onUpdate(data.id, { generationCount: count });
    };

    // Get frame inputs with their image URLs
    // Auto-assign order: first connected = start, second = end
    // If user has explicitly set frameInputs, use those orders, otherwise auto-assign
    const frameInputsWithUrls = connectedImageNodes.slice(0, 2).map((node, idx) => {
        // Check if there's an explicit order from user reordering
        const existingInput = data.frameInputs?.find(f => f.nodeId === node.id);
        return {
            nodeId: node.id,
            url: node.url,
            type: node.type,
            order: existingInput?.order || (idx === 0 ? 'start' : 'end') as 'start' | 'end'
        };
    }).sort((a, b) => {
        // Sort by order: 'start' first, 'end' second
        if (a.order === 'start' && b.order === 'end') return -1;
        if (a.order === 'end' && b.order === 'start') return 1;
        return 0;
    });

    // Inverse scaling for the prompt bar to keep it readable when zooming out
    // When zooming in (zoom > 0.8), we let it zoom 1:1 with the canvas (localScale = 1)
    // When zooming out (zoom < 0.8), we keep it at least at 0.8 effective scale
    const minEffectiveScale = 0.8;
    const effectiveScale = Math.max(zoom, minEffectiveScale);
    const localScale = effectiveScale / zoom;

    // Theme helper
    const isDark = canvasTheme === 'dark';
    const selectorButtonClass = isDark
        ? 'flex h-[var(--myml-density-control)] items-center gap-1.5 text-xs font-medium bg-[var(--myml-surface-raised)] border border-[var(--myml-border-default)] text-[var(--myml-text-secondary)] hover:bg-[var(--myml-surface-hover)] hover:border-[var(--myml-border-active)] hover:text-[var(--myml-text-primary)] px-2.5 rounded-[var(--myml-radius-control)] transition-[background-color,border-color,color,transform] duration-[var(--myml-motion-base)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35'
        : 'flex items-center gap-1.5 text-xs font-medium bg-white border border-neutral-200 text-neutral-700 hover:border-lime-500 hover:text-lime-600 px-2.5 py-1.5 rounded-lg transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/35';
    const dropdownClass = isDark
        ? 'bg-[var(--myml-surface-floating)] border-[var(--myml-border-default)] rounded-[var(--myml-radius-card)] shadow-[var(--myml-shadow-floating)] overflow-hidden z-50 motion-menu-in'
        : 'bg-white border-neutral-200 rounded-lg shadow-[0_14px_32px_rgba(15,23,42,0.12)] overflow-hidden z-50 motion-menu-in';
    const dropdownHeaderClass = isDark
        ? 'bg-[var(--myml-surface-base)] text-[var(--myml-text-muted)] border-[var(--myml-border-subtle)]'
        : 'bg-neutral-50 text-neutral-500 border-neutral-200';
    const dropdownSectionHeaderClass = isDark
        ? 'bg-[var(--myml-surface-base)] text-[var(--myml-text-faint)] border-[var(--myml-border-subtle)]'
        : 'bg-neutral-50 text-neutral-500 border-neutral-200';
    const dropdownItemClass = (active: boolean) => {
        if (active) {
            return isDark
                ? 'text-[#D8FF00] bg-[#D8FF00]/10'
                : 'text-lime-600 bg-lime-50';
        }

        return isDark
            ? 'text-[var(--myml-text-secondary)] hover:bg-[var(--myml-surface-item-hover)] hover:text-[var(--myml-text-primary)]'
            : 'text-neutral-700 hover:bg-neutral-100';
    };
    const modelDropdownItemClass = (active: boolean, disabled: boolean) => {
        if (disabled) {
            return isDark
                ? 'text-neutral-600 bg-transparent opacity-60 cursor-not-allowed'
                : 'text-neutral-400 bg-transparent opacity-60 cursor-not-allowed';
        }

        return dropdownItemClass(active);
    };
    const disabledModelBadgeClass = isDark
        ? 'bg-[var(--myml-surface-base)] text-[var(--myml-text-faint)] border border-[var(--myml-border-subtle)]'
        : 'bg-neutral-100 text-neutral-500 border border-neutral-200';
    const renderDisabledModelBadge = (model: any) =>
        isModelDisabled(model) ? (
            <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded ${disabledModelBadgeClass}`}>
                {getModelDisabledReason(model, language)}
            </span>
        ) : null;
    const generateButtonClass = (blocked: boolean) => {
        if (blocked) {
            return 'bg-neutral-800/70 border border-neutral-700 text-neutral-500 opacity-70 cursor-not-allowed';
        }

        return isDark
            ? 'bg-[var(--myml-accent)] hover:bg-[var(--myml-accent-hover)] text-[var(--myml-accent-contrast)] shadow-[var(--myml-shadow-accent)] active:scale-[0.98]'
            : 'bg-lime-600 hover:bg-lime-500 text-white active:scale-[0.98]';
    };
    const renderGenerateButton = () => {
        if (isLoading) return null;

        const isFaceModeBlocked = !isVideoNode &&
            data.imageModel === 'kling-v1-5' &&
            data.klingReferenceMode === 'face' &&
            (data.faceDetectionStatus === 'error' || data.faceDetectionStatus === 'loading');
        const selectedModel = isVideoNode ? currentVideoModel : currentImageModel;
        const isSelectedModelDisabled = isModelDisabled(selectedModel);
        const isGenerateBlocked = isFaceModeBlocked || isSelectedModelDisabled;
        const generateTitle = isSelectedModelDisabled
            ? getModelDisabledReason(selectedModel, language)
            : isFaceModeBlocked
                ? t(language, 'cannotGenerateNoFace')
                : t(language, 'generate');

        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    if (isGenerateBlocked) {
                        return;
                    }
                    onGenerate(data.id);
                }}
                disabled={isGenerateBlocked}
                className={`group h-9 w-9 shrink-0 rounded-lg flex items-center justify-center transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 disabled:active:scale-100 ${generateButtonClass(isGenerateBlocked)}`}
                aria-label={generateTitle}
                title={generateTitle}
            >
                <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4 transition-transform duration-200"
                    fill="currentColor"
                >
                    <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
            </button>
        );
    };
    const controlPanelTitle = isVideoNode
        ? language === 'zh' ? '视频生成控制' : 'Video Controls'
        : language === 'zh' ? '图像生成控制' : 'Image Controls';
    const promptSectionTitle = language === 'zh' ? '提示词' : 'Prompt';
    const modelSectionTitle = language === 'zh' ? '模型与输出' : 'Model & Output';
    const referenceSectionTitle = language === 'zh' ? '参考设置' : 'Reference Settings';
    const advancedSectionTitle = language === 'zh' ? '高级设置' : 'Advanced';

    const normalizeAngleSettings = (settings?: NodeData['angleSettings'] & { scale?: number }) => ({
        rotation: settings?.rotation ?? 0,
        tilt: settings?.tilt ?? 0,
        zoom: settings?.zoom ?? settings?.scale ?? 0,
        wideAngle: settings?.wideAngle ?? false
    });

    // Handle angle mode generate - creates a new connected node
    const handleAngleGenerate = () => {
        if (onChangeAngleGenerate) {
            onChangeAngleGenerate(data.id);
        }
    };

    // If in angle mode for Image nodes with result, show ChangeAnglePanel
    if (data.angleMode && data.type === NodeType.IMAGE && isSuccess && data.resultUrl) {
        return (
            <div
                style={{
                    transform: `scale(${localScale})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.1s ease-out'
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(data.id)}
            >
                <ChangeAnglePanel
                    imageUrl={data.resultUrl}
                    settings={normalizeAngleSettings(data.angleSettings)}
                    onSettingsChange={(settings) => onUpdate(data.id, { angleSettings: settings })}
                    onClose={() => onUpdate(data.id, { angleMode: false })}
                    onGenerate={handleAngleGenerate}
                    isLoading={isLoading}
                    canvasTheme={canvasTheme}
                />
            </div>
        );
    }

    return (
        <div
            className={`rounded-[var(--myml-radius-panel)] p-3 shadow-[var(--myml-shadow-panel)] cursor-default w-full transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-panel)] ${isDark ? 'bg-[var(--myml-surface-floating)] border border-[var(--myml-border-default)]' : 'bg-white border border-neutral-200'}`}
            style={{
                transform: `scale(${localScale})`,
                transformOrigin: 'top center',
                transition: 'transform 0.1s ease-out'
            }}
            onPointerDown={(e) => e.stopPropagation()} // Allow selecting text/interacting without dragging
            onClick={() => onSelect(data.id)} // Ensure clicking here selects the node
        >
            <div className="mb-2 flex items-center justify-between gap-3 border-b border-[var(--myml-border-subtle)] pb-2">
                <div className="flex min-w-0 items-center gap-2">
                    <StatusDot tone={isLoading ? 'running' : data.errorMessage ? 'danger' : isSuccess ? 'success' : 'idle'} />
                    <span className="truncate text-[11px] font-semibold leading-none text-[var(--myml-text-secondary)]">
                        {controlPanelTitle}
                    </span>
                </div>
                <span className="shrink-0 rounded-md border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-base)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--myml-text-faint)]">
                    {isVideoNode ? 'Video' : 'Image'}
                </span>
            </div>
            {/* Prompt Textarea with Expand Button - Hidden for storyboard-generated scenes */}
            {!(data.prompt && data.prompt.startsWith('Extract panel #')) && (
                <PanelSection title={promptSectionTitle} className="mb-2">
                    {orderedImageReferences.length > 0 && (
                        <div
                            className={`mb-3 rounded-[var(--myml-radius-control)] border px-2 pb-1 pt-2 ${isDark
                                ? 'border-[var(--myml-border-subtle)] bg-[var(--myml-surface-base)]'
                                : 'border-neutral-200 bg-neutral-50/80'
                                }`}
                        >
                            <div className="flex max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 pt-2">
                                {orderedImageReferences.map((reference, index) => (
                                    <div
                                        key={reference.id}
                                        className="group/ref relative h-10 w-10 shrink-0"
                                    >
                                        <div
                                            className={`h-full w-full overflow-hidden rounded-lg transition-[box-shadow,opacity] duration-150 ${isDark
                                                ? 'bg-[#151815] ring-1 ring-neutral-800 group-hover/ref:ring-[#D8FF00]/35'
                                                : 'bg-white ring-1 ring-neutral-200 group-hover/ref:ring-lime-500/70'
                                                }`}
                                        >
                                            <img
                                                src={reference.url}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                            <div
                                                className={`absolute left-0.5 top-0.5 rounded px-1 py-0.5 text-[8px] font-semibold leading-none shadow-sm ${isDark
                                                    ? 'bg-[#101210]/85 text-[#D8FF00]'
                                                    : 'bg-white/85 text-lime-700'
                                                    }`}
                                            >
                                                {formatReferenceLabel(index)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label={`${t(language, 'removeReference')} ${formatReferenceLabel(index)}`}
                                            title={`${t(language, 'removeReference')} ${formatReferenceLabel(index)}`}
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveImageReference(reference.id);
                                            }}
                                            className="absolute -right-2 -top-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-red-400/60 bg-red-500 text-white opacity-0 transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-red-600 active:scale-95 group-hover/ref:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                                        >
                                            <X size={12} strokeWidth={2.5} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="relative rounded-[var(--myml-radius-control)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-input)] px-3 py-2 transition-[border-color,box-shadow] focus-within:border-[var(--myml-border-active)] focus-within:shadow-[0_0_0_1px_rgba(216,255,0,0.14)]">
                        <textarea
                            className={`w-full bg-transparent text-sm outline-none resize-none font-normal leading-5 ${isDark ? 'text-[var(--myml-text-primary)] placeholder:text-[var(--myml-text-faint)]' : 'text-neutral-900 placeholder-neutral-400'}`}
                            placeholder={
                                data.type === NodeType.VIDEO && isFrameToFrame && currentVideoModel.provider === 'kling'
                                    ? t(language, 'promptOptionalKlingFrame')
                                    : data.type === NodeType.VIDEO && inputUrl
                                        ? t(language, 'describeAnimateFrame')
                                        : t(language, 'describeGeneratePrompt')
                            }
                            rows={data.isPromptExpanded ? 12 : 4}
                            value={localPrompt}
                            onChange={(e) => handlePromptChange(e.target.value)}
                            onWheel={(e) => e.stopPropagation()}
                            onBlur={() => {
                                // Ensure final value is saved on blur
                                if (updateTimeoutRef.current) {
                                    clearTimeout(updateTimeoutRef.current);
                                }
                                if (localPrompt !== data.prompt) {
                                    onUpdate(data.id, { prompt: localPrompt });
                                }
                            }}
                        />
                        {/* Expand/Shrink Button - Below textarea */}
                        <div className="flex justify-end mt-1">
                            <button
                                onClick={() => onUpdate(data.id, { isPromptExpanded: !data.isPromptExpanded })}
                                className={`flex h-6 items-center gap-1 px-2 text-[10px] rounded-[var(--myml-radius-control)] transition-colors ${isDark ? 'text-[var(--myml-text-faint)] hover:text-[var(--myml-text-primary)] hover:bg-[var(--myml-surface-hover)]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200'}`}
                                title={data.isPromptExpanded ? t(language, 'shrinkPrompt') : t(language, 'expandPrompt')}
                                aria-label={data.isPromptExpanded ? t(language, 'shrinkPrompt') : t(language, 'expandPrompt')}
                            >
                                {data.isPromptExpanded ? <Shrink size={12} /> : <Expand size={12} />}
                                <span>{data.isPromptExpanded ? t(language, 'shrink') : t(language, 'expand')}</span>
                            </button>
                        </div>
                    </div>
                </PanelSection>
            )}

            {data.errorMessage && (
                <div className="text-red-300 text-xs mb-2 p-2 bg-red-500/[0.08] rounded-lg border border-red-500/50">
                    {data.errorMessage}
                </div>
            )}

            {/* Motion Control Warning - when motion mode detected but no character image */}
            {isVideoNode && videoGenerationMode === 'motion-control' && imageInputCount === 0 && (
                <div className="text-amber-400 text-xs mb-2 p-2 bg-amber-900/20 rounded border border-amber-700/50 flex items-start gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>
                        {t(language, 'motionControlRequires')}
                    </span>
                </div>
            )}

            {/* Controls - Hidden for storyboard-generated scenes */}
            {!(data.prompt && data.prompt.startsWith('Extract panel #')) && (
                <PanelSection title={modelSectionTitle} className="mb-2">
                <ActionRow className={data.type === NodeType.IMAGE ? 'relative flex-col items-stretch gap-2' : 'relative'}>
                    <div className={data.type === NodeType.IMAGE ? 'flex min-w-0 items-center justify-between gap-2' : 'flex items-center gap-2'}>
                        {/* Model Selector - Local, Video, and Image nodes get different dropdowns */}
                        {isLocalModelNode ? (
                            <div className="relative" ref={modelDropdownRef}>
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className={selectorButtonClass}
                                >
                                    <HardDrive size={12} className="text-neutral-400" />
                                    <span className="font-medium">{selectedLocalModel?.name || t(language, 'selectModel')}</span>
                                    <ChevronDown size={12} className="ml-0.5 opacity-50" />
                                </button>

                                {/* Local Model Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className={`absolute top-full mt-1 left-0 w-56 ${dropdownClass} max-h-64 overflow-y-auto`}>
                                        {/* Header */}
                                        <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-b flex items-center gap-1.5 ${dropdownHeaderClass}`}>
                                            <HardDrive size={10} />
                                            {t(language, 'localModels')}
                                        </div>

                                        {isLoadingLocalModels ? (
                                            <div className="px-3 py-4 text-xs text-neutral-500 text-center">{t(language, 'loadingModels')}</div>
                                        ) : localModels.length === 0 ? (
                                            <div className="px-3 py-4 text-xs text-neutral-500 text-center">
                                                <p>{t(language, 'noModelsFound')}</p>
                                                <p className="text-[10px] mt-1">{t(language, 'addSafetensorsFiles')}</p>
                                            </div>
                                        ) : (
                                            localModels.map(model => (
                                                <button
                                                    key={model.id}
                                                    onClick={() => handleLocalModelChange(model)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${dropdownItemClass(data.localModelId === model.id)}`}
                                                >
                                                    <span className="flex flex-col items-start gap-0.5">
                                                        <span className="flex items-center gap-2">
                                                            <HardDrive size={12} className="text-neutral-400" />
                                                            {model.name}
                                                            {model.architecture && model.architecture !== 'unknown' && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-neutral-800 text-neutral-400 rounded">{model.architecture.toUpperCase()}</span>
                                                            )}
                                                        </span>
                                                        <span className="text-[10px] text-neutral-500 ml-5">{model.sizeFormatted}</span>
                                                    </span>
                                                    {data.localModelId === model.id && <Check size={12} />}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : data.type === NodeType.VIDEO ? (
                            <div className="relative" ref={modelDropdownRef}>
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className={selectorButtonClass}
                                >
                                    {currentVideoModel.id === 'veo-3.1' ? (
                                        <GoogleIcon size={12} className="text-white" />
                                    ) : currentVideoModel.provider === 'kling' ? (
                                        <KlingIcon size={14} />
                                    ) : (
                                        <Film size={12} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                                    )}
                                    <span className="font-medium">{currentVideoModel.name}</span>
                                    <ChevronDown size={12} className="ml-0.5 opacity-50" />
                                </button>

                                {/* Model Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className={`absolute top-full mt-1 left-0 w-52 ${dropdownClass}`}>
                                        {/* Mode indicator */}
                                        <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-b flex items-center gap-1.5 ${dropdownHeaderClass}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${videoGenerationMode === 'text-to-video' ? 'bg-[#D8FF00]' :
                                                videoGenerationMode === 'image-to-video' ? 'bg-green-400' :
                                                    videoGenerationMode === 'motion-control' ? 'bg-amber-400' : 'bg-[#D8FF00]'
                                                }`} />
                                            {videoGenerationMode === 'text-to-video' ? t(language, 'textToVideo') :
                                                videoGenerationMode === 'image-to-video' ? t(language, 'imageToVideo') :
                                                    videoGenerationMode === 'motion-control' ? t(language, 'motionControl') :
                                                        t(language, 'frameToFrame')}
                                        </div>
                                        {/* MYML Models */}
                                        {availableVideoModels.filter(m => m.provider === 'custom').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                                    MYML
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'custom').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentVideoModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <Film size={12} className={isModelDisabled(model) ? 'text-neutral-500' : 'text-[#D8FF00]'} />
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Google Models */}
                                        {availableVideoModels.filter(m => m.provider === 'google').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                                    Google
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'google').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentVideoModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            {model.id === 'veo-3.1' ? (
                                                                <GoogleIcon size={12} className="text-white" />
                                                            ) : (
                                                                <Film size={12} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                                                            )}
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Kling Models */}
                                        {availableVideoModels.filter(m => m.provider === 'kling').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-t ${dropdownSectionHeaderClass}`}>
                                                    Kling AI
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'kling').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentVideoModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <KlingIcon size={14} />
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Hailuo Models */}
                                        {availableVideoModels.filter(m => m.provider === 'hailuo').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-t ${dropdownSectionHeaderClass}`}>
                                                    Hailuo AI
                                                </div>
                                                {availableVideoModels.filter(m => m.provider === 'hailuo').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleVideoModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentVideoModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <HailuoIcon size={14} />
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                        </span>
                                                        {currentVideoModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="relative" ref={modelDropdownRef}>
                                <button
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    className={selectorButtonClass}
                                >
                                    {currentImageModel.id === 'google-veo' ? ( // Keeping consistency if there was one, but mainly checking provider
                                        <GoogleIcon size={12} className="text-white" />
                                    ) : currentImageModel.id === 'gemini-pro' ? (
                                        <Banana size={12} className="text-yellow-400" />
                                    ) : currentImageModel.provider === 'openai' ? (
                                        <OpenAIIcon size={12} className="text-green-400" />
                                    ) : currentImageModel.provider === 'kling' ? (
                                        <KlingIcon size={14} />
                                    ) : (
                                        <ImageIcon size={12} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                                    )}
                                    <span className="font-medium">{currentImageModel.name}</span>
                                    <ChevronDown size={12} className="ml-0.5 opacity-50" />
                                </button>

                                {/* Image Model Dropdown Menu */}
                                {showModelDropdown && (
                                    <div className={`absolute top-full mt-1 left-0 w-48 ${dropdownClass}`}>
                                        {/* Mode indicator */}
                                        <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-b flex items-center gap-1.5 ${dropdownHeaderClass}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${imageGenerationMode === 'text-to-image' ? 'bg-[#D8FF00]' :
                                                imageGenerationMode === 'image-to-image' ? 'bg-emerald-400' : 'bg-[#D8FF00]'
                                                }`} />
                                            {imageGenerationMode === 'text-to-image' ? t(language, 'textToImage') :
                                                imageGenerationMode === 'image-to-image' ? t(language, 'imageToImage') :
                                                    `${inputCount} ${t(language, 'imagesToImage')}`}
                                        </div>
                                        {/* MYML Models */}
                                        {availableImageModels.filter(m => m.provider === 'custom').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                                    MYML
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'custom').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentImageModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <ImageIcon size={12} className="text-[#D8FF00]" />
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* OpenAI Models */}
                                        {availableImageModels.filter(m => m.provider === 'openai').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                                    OpenAI
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'openai').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentImageModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <OpenAIIcon size={12} className="text-green-400" />
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        {/* Google Models */}
                                        {availableImageModels.filter(m => m.provider === 'google').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-t ${dropdownSectionHeaderClass}`}>
                                                    Google
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'google').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentImageModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            {model.id === 'gemini-pro' ? (
                                                                <Banana size={12} className="text-yellow-400" />
                                                            ) : (
                                                                <GoogleIcon size={12} className="text-white" />
                                                            )}
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}

                                        {/* Kling Models */}
                                        {availableImageModels.filter(m => m.provider === 'kling').length > 0 && (
                                            <>
                                                <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-t ${dropdownSectionHeaderClass}`}>
                                                    Kling AI
                                                </div>
                                                {availableImageModels.filter(m => m.provider === 'kling').map(model => (
                                                    <button
                                                        key={model.id}
                                                        disabled={isModelDisabled(model)}
                                                        title={isModelDisabled(model) ? getModelDisabledReason(model, language) : undefined}
                                                        onClick={() => handleImageModelChange(model.id)}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${modelDropdownItemClass(currentImageModel.id === model.id, isModelDisabled(model))}`}
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <KlingIcon size={14} />
                                                            <span className="truncate">{model.name}</span>
                                                            {renderDisabledModelBadge(model)}
                                                            {model.recommended && (
                                                                <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded">REC</span>
                                                            )}
                                                        </span>
                                                        {currentImageModel.id === model.id && <Check size={12} />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {data.type === NodeType.IMAGE && renderGenerateButton()}
                    </div>

                    <div className={data.type === NodeType.IMAGE ? 'flex w-full flex-wrap items-center justify-end gap-2' : 'flex items-center gap-2'}>
                        {shouldShowVariantCount && (
                            <div
                                className={`flex h-[var(--myml-density-control)] items-center gap-1 rounded-[var(--myml-radius-control)] border px-1 ${isDark
                                    ? 'border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] text-[var(--myml-text-secondary)]'
                                    : 'border-neutral-200 bg-white text-neutral-700'
                                    }`}
                                role="group"
                                aria-label={t(language, 'variants')}
                                title={t(language, 'variantsTooltip')}
                            >
                                <span className="px-1 text-[10px] font-semibold leading-none text-[var(--myml-text-faint)]">
                                    {t(language, 'variants')}
                                </span>
                                {IMAGE_GENERATION_COUNTS.map(count => {
                                    const active = generationCount === count;
                                    return (
                                        <button
                                            key={count}
                                            type="button"
                                            disabled={isLoading}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleGenerationCountChange(count);
                                            }}
                                            className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold transition-[background-color,border-color,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${active
                                                ? isDark
                                                    ? 'bg-[var(--myml-accent)] text-[var(--myml-accent-contrast)]'
                                                    : 'bg-lime-600 text-white'
                                                : isDark
                                                    ? 'text-[var(--myml-text-muted)] hover:bg-[var(--myml-surface-hover)] hover:text-[var(--myml-text-primary)] focus-visible:ring-[#D8FF00]/35'
                                                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-700 focus-visible:ring-lime-500/35'
                                                }`}
                                            aria-label={`${t(language, 'setVariants')}: ${count}`}
                                            title={`${t(language, 'setVariants')}: ${count}`}
                                        >
                                            {count}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Unified Size/Ratio Dropdown (hidden for video nodes in motion-control mode) */}
                        {!(isVideoNode && videoGenerationMode === 'motion-control') && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                                    className={selectorButtonClass}
                                >
                                    {isVideoNode && <Monitor size={12} className="text-green-400" />}
                                    {!isVideoNode && <Crop size={12} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />}
                                    {isVideoNode && currentSizeLabel === 'Auto' ? 'Auto' : currentSizeLabel}
                                </button>

                                {/* Dropdown Menu */}
                                {showSizeDropdown && (
                                    <div
                                        className={`absolute bottom-full mb-2 right-0 w-32 ${dropdownClass} flex flex-col max-h-60 overflow-y-auto`}
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                            {isVideoNode ? t(language, 'resolution') : t(language, 'aspectRatio')}
                                        </div>
                                        {sizeOptions.map(option => (
                                            <button
                                                key={option}
                                                onClick={() => handleSizeSelect(option)}
                                                className={`flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${dropdownItemClass(currentSizeLabel === option)}`}
                                            >
                                                <span>{option}</span>
                                                {currentSizeLabel === option && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Image Resolution Dropdown - Only for Image nodes */}
                        {!isVideoNode && (currentImageModel as any).resolutions && (
                            <div className="relative" ref={resolutionDropdownRef}>
                                <button
                                    onClick={() => setShowResolutionDropdown(!showResolutionDropdown)}
                                    className={selectorButtonClass}
                                >
                                    <Monitor size={12} className="text-green-400" />
                                    {data.resolution || 'Auto'}
                                </button>

                                {/* Dropdown Menu */}
                                {showResolutionDropdown && (
                                    <div
                                        className={`absolute bottom-full mb-2 right-0 w-24 ${dropdownClass}`}
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                            {t(language, 'quality')}
                                        </div>
                                        {(currentImageModel as any).resolutions.map((res: string) => (
                                            <button
                                                key={res}
                                                onClick={() => handleResolutionSelect(res)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${dropdownItemClass((data.resolution || 'Auto') === res)}`}
                                            >
                                                <span>{res}</span>
                                                {(data.resolution || 'Auto') === res && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Video Aspect Ratio Dropdown - Only for video nodes (hidden in motion-control mode) */}
                        {isVideoNode && videoGenerationMode !== 'motion-control' && (
                            <div className="relative" ref={aspectRatioDropdownRef}>
                                <button
                                    onClick={() => setShowAspectRatioDropdown(!showAspectRatioDropdown)}
                                    className={selectorButtonClass}
                                >
                                    <Film size={12} className="text-neutral-400" />
                                    {data.aspectRatio || '16:9'}
                                </button>

                                {/* Aspect Ratio Dropdown Menu */}
                                {showAspectRatioDropdown && (
                                    <div className={`absolute bottom-full mb-2 right-0 w-28 ${dropdownClass}`}>
                                        <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                            {t(language, 'size')}
                                        </div>
                                        {(currentVideoModel?.aspectRatios || VIDEO_ASPECT_RATIOS).map((option: string) => (
                                            <button
                                                key={option}
                                                onClick={() => handleAspectRatioSelect(option)}
                                                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${dropdownItemClass(data.aspectRatio === option)}`}
                                            >
                                                <span>{option}</span>
                                                {data.aspectRatio === option && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Duration Dropdown - Only for video nodes (hidden in motion-control mode) */}
                        {isVideoNode && videoGenerationMode !== 'motion-control' && availableDurations.length > 0 && (
                            <div className="relative" ref={durationDropdownRef}>
                                <button
                                    onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                                    className={selectorButtonClass}
                                >
                                    <Clock size={12} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                                    {currentDuration}s
                                </button>

                                {/* Duration Dropdown Menu */}
                                {showDurationDropdown && (
                                    <div className={`absolute bottom-full mb-2 right-0 w-24 ${dropdownClass}`}>
                                        <div className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${dropdownSectionHeaderClass}`}>
                                            {t(language, 'duration')}
                                        </div>
                                        {availableDurations.map((dur: number) => (
                                            <button
                                                key={dur}
                                                onClick={() => handleDurationChange(dur)}
                                                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-[background-color,color,opacity] duration-150 ${dropdownItemClass(currentDuration === dur)}`}
                                            >
                                                <span>{dur}s</span>
                                                {currentDuration === dur && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {data.type !== NodeType.IMAGE && renderGenerateButton()}
                    </div>
                </ActionRow>
                </PanelSection>
            )}

            {/* Kling V1.5 Reference Settings - For Image nodes with connected input */}
            {!isVideoNode && data.imageModel === 'kling-v1-5' && connectedImageNodes.length > 0 && (
                <div className="myml-section mt-2 p-3">
                    <div className="mb-2 text-[11px] font-semibold leading-none text-[var(--myml-text-muted)]">{referenceSectionTitle}</div>

                    {/* Mode Tabs */}
                    <SegmentedControl className="mb-3 flex w-full">
                        <button
                            onClick={() => onUpdate(data.id, { klingReferenceMode: 'subject', detectedFaces: undefined, faceDetectionStatus: undefined })}
                            className={`flex-1 rounded-[var(--myml-radius-control)] px-3 py-1.5 text-xs transition-colors ${(data.klingReferenceMode || 'subject') === 'subject'
                                ? 'bg-[var(--myml-surface-selected)] text-[var(--myml-accent)] font-medium'
                                : 'text-[var(--myml-text-muted)] hover:text-[var(--myml-text-primary)] hover:bg-[var(--myml-surface-hover)]'
                                }`}
                        >
                            {t(language, 'subject')}
                        </button>
                        <button
                            onClick={() => {
                                // Just switch mode, face detection will be triggered by effect
                                onUpdate(data.id, { klingReferenceMode: 'face', faceDetectionStatus: 'loading', detectedFaces: undefined });
                            }}
                            className={`flex-1 rounded-[var(--myml-radius-control)] px-3 py-1.5 text-xs transition-colors ${data.klingReferenceMode === 'face'
                                ? 'bg-[var(--myml-surface-selected)] text-[var(--myml-accent)] font-medium'
                                : 'text-[var(--myml-text-muted)] hover:text-[var(--myml-text-primary)] hover:bg-[var(--myml-surface-hover)]'
                                }`}
                        >
                            {t(language, 'face')}
                        </button>
                    </SegmentedControl>

                    {/* Reference Image Preview with Face Detection Overlay */}
                    {connectedImageNodes[0]?.url && (
                        <div className="mb-3">
                            {/* Main image with face highlight */}
                            <div className="rounded-lg overflow-hidden bg-black relative flex items-center justify-center" style={{ maxHeight: '200px' }}>
                                <div className="relative">
                                    <img
                                        src={connectedImageNodes[0].url}
                                        alt={t(language, 'reference')}
                                        className="max-h-[200px] w-auto h-auto block object-contain"
                                    />
                                    {/* Face detection corner brackets - Kling style */}
                                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'success' && data.detectedFaces && data.detectedFaces.length > 0 && (
                                        <>
                                            {data.detectedFaces.map((face, idx) => (
                                                <div
                                                    key={idx}
                                                    className="absolute pointer-events-none"
                                                    style={{
                                                        left: `${face.x}%`,
                                                        top: `${face.y}%`,
                                                        width: `${face.width}%`,
                                                        height: `${face.height}%`,
                                                    }}
                                                >
                                                    {/* Corner brackets - larger with glow */}
                                                    <div className="absolute -top-1 -left-1 w-8 h-8 border-t-2 border-l-2 border-green-400/80 rounded-tl-lg" />
                                                    <div className="absolute -top-1 -right-1 w-8 h-8 border-t-2 border-r-2 border-green-400/80 rounded-tr-lg" />
                                                    <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-2 border-l-2 border-green-400/80 rounded-bl-lg" />
                                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-2 border-r-2 border-green-400/80 rounded-br-lg" />
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {/* Loading indicator */}
                                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'loading' && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <div className="text-xs text-white">{t(language, 'detectingFaces')}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Face thumbnail below - Kling style */}
                            {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'success' && data.detectedFaces && data.detectedFaces.length > 0 && (
                                <div className="flex justify-center mt-3">
                                <div className="w-14 h-14 rounded-lg border border-green-400/70 overflow-hidden bg-black">
                                        <img
                                            src={connectedImageNodes[0].url}
                                            alt={t(language, 'detectedFace')}
                                            className="w-full h-full object-cover"
                                            style={{
                                                objectPosition: `${data.detectedFaces[0].x + data.detectedFaces[0].width / 2}% ${data.detectedFaces[0].y + data.detectedFaces[0].height / 2}%`,
                                                transform: `scale(${100 / Math.max(data.detectedFaces[0].width, data.detectedFaces[0].height) * 0.8})`
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No Face Detected Warning */}
                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'error' && (
                        <div className="mb-3 p-2 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                            <div className="flex items-start gap-2 text-amber-400 text-xs">
                                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>{t(language, 'noFaceDetectedClearer')}</span>
                            </div>
                        </div>
                    )}

                    {/* Subject Mode: Show BOTH Face Reference and Subject Reference sliders */}
                    {(data.klingReferenceMode || 'subject') === 'subject' && (
                        <>
                            <div className="space-y-1 mb-3">
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-[var(--myml-text-muted)]">{t(language, 'faceReference')}</span>
                                    <span className="text-[var(--myml-text-primary)] font-medium">{data.klingFaceIntensity ?? 65}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={data.klingFaceIntensity ?? 65}
                                    onChange={(e) => onUpdate(data.id, { klingFaceIntensity: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-[var(--myml-text-muted)]">{t(language, 'subjectReference')}</span>
                                    <span className="text-[var(--myml-text-primary)] font-medium">{data.klingSubjectIntensity ?? 50}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={data.klingSubjectIntensity ?? 50}
                                    onChange={(e) => onUpdate(data.id, { klingSubjectIntensity: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                                />
                            </div>
                        </>
                    )}

                    {/* Face Mode: Show single Reference Strength slider */}
                    {data.klingReferenceMode === 'face' && data.faceDetectionStatus === 'success' && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                                <span className="text-[var(--myml-text-muted)]">{t(language, 'referenceStrength')}</span>
                                <span className="text-[var(--myml-text-primary)] font-medium">{data.klingFaceIntensity ?? 42}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={data.klingFaceIntensity ?? 42}
                                onChange={(e) => onUpdate(data.id, { klingFaceIntensity: parseInt(e.target.value) })}
                                className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Advanced Settings Drawer - Only for Video nodes */}
            {
                isVideoNode && (
                    <div className="myml-section mt-2 p-2">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            aria-expanded={showAdvanced}
                            aria-controls="node-controls-advanced-settings"
                            className="w-full flex items-center justify-center gap-1 cursor-pointer rounded-[var(--myml-radius-control)] py-1.5 transition-[background-color,color] duration-[var(--myml-motion-base)] hover:bg-[var(--myml-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35"
                        >
                            <span className="text-[11px] font-semibold text-[var(--myml-text-muted)]">
                                {advancedSectionTitle}
                            </span>
                            {showAdvanced ? (
                                <ChevronUp size={12} className="text-neutral-600" />
                            ) : (
                                <ChevronDown size={12} className="text-neutral-600" />
                            )}
                        </button>

                        {/* Advanced Settings Content - Only for Video nodes */}
                        {showAdvanced && isVideoNode && (
                            <div id="node-controls-advanced-settings" className="mt-3 space-y-3 rounded-[var(--myml-radius-card)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-base)] p-3">
                                {/* Audio Toggle - Only for Kling 2.6 (Veo 3.1 SDK doesn't support generateAudio yet) */}
                                {data.videoModel === 'kling-v2-6' && (
                                    <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-[var(--myml-surface-raised)] rounded-lg border border-[var(--myml-border-subtle)] w-fit">
                                        <svg className={`w-3.5 h-3.5 ${isDark ? 'text-[#D8FF00]' : 'text-lime-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        </svg>
                                        <span className="text-[11px] text-[var(--myml-text-secondary)]">{t(language, 'audio')}</span>
                                        <button
                                            onClick={() => onUpdate(data.id, { generateAudio: !(data.generateAudio !== false) })}
                                            aria-label={data.generateAudio !== false ? t(language, 'disableAudioGeneration') : t(language, 'enableAudioGeneration')}
                                            aria-pressed={data.generateAudio !== false}
                                            className={`relative w-8 h-4 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${data.generateAudio !== false ? 'bg-[#D8FF00]' : 'bg-neutral-700'}`}
                                        >
                                            <span
                                                className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform ${data.generateAudio !== false ? 'left-4 bg-black' : 'left-0.5 bg-neutral-300'}`}
                                            />
                                        </button>
                                    </div>
                                )}

                                {/* Frame Inputs - Show when 2+ nodes are connected */}
                                {connectedImageNodes.length >= 2 && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-semibold text-neutral-500">
                                            {videoGenerationMode === 'motion-control' ? t(language, 'inputReferences') : t(language, 'connectedFrames')}
                                            {videoGenerationMode !== 'motion-control' && <span className="text-neutral-600"> ({t(language, 'dragToReorder')})</span>}
                                        </label>

                                        {frameInputsWithUrls.length === 0 ? (
                                            <div className="text-xs text-neutral-600 italic py-2">
                                                {videoGenerationMode === 'motion-control' ? t(language, 'connectVideoImageRefs') : t(language, 'connectImageStartEndFrames')}
                                            </div>
                                        ) : videoGenerationMode === 'motion-control' ? (
                                            /* Horizontal layout for Motion Control */
                                            <div className="flex gap-2">
                                                {frameInputsWithUrls.map((input, index) => (
                                                    <div
                                                        key={input.nodeId}
                                                        className="flex-1 flex flex-col items-center gap-2 p-2 bg-neutral-800 rounded-lg border border-neutral-700/50"
                                                    >
                                                        <div className="relative w-full aspect-video overflow-hidden rounded bg-black flex items-center justify-center">
                                                            {input.url ? (
                                                                <img
                                                                    src={input.url}
                                                                    alt={input.type === NodeType.VIDEO ? t(language, 'motionRef') : t(language, 'characterRef')}
                                                                    className="w-full h-full object-contain"
                                                                />
                                                            ) : (
                                                                <div className="text-[10px] text-neutral-600">{t(language, 'noPreview')}</div>
                                                            )}
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                            <div className="absolute bottom-1 left-1 right-1">
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded block text-center truncate ${input.type === NodeType.VIDEO
                                                                    ? 'bg-amber-500/80 text-black'
                                                                    : isDark ? 'bg-[#D8FF00]/80 text-black' : 'bg-lime-600/85 text-white'
                                                                    }`}>
                                                                    {input.type === NodeType.VIDEO ? t(language, 'motionRef') : t(language, 'characterRef')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            /* Vertical draggable layout for Frame-to-Frame */
                                            <div className="space-y-2">
                                                {frameInputsWithUrls.map((input, index) => (
                                                    <div
                                                        key={input.nodeId}
                                                        draggable
                                                        onDragStart={() => setDraggedIndex(index)}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        onDrop={() => {
                                                            if (draggedIndex !== null) {
                                                                handleFrameReorder(draggedIndex, index);
                                                                setDraggedIndex(null);
                                                            }
                                                        }}
                                                        onDragEnd={() => setDraggedIndex(null)}
                                                        className={`flex items-center gap-2 p-2 bg-neutral-800 rounded-lg cursor-grab active:cursor-grabbing transition-[background-color,opacity,transform] duration-150 ${draggedIndex === index ? 'opacity-50 scale-95' : ''
                                                            }`}
                                                    >
                                                        <GripVertical size={14} className="text-neutral-600" />
                                                        <img
                                                            src={input.url}
                                                            alt={`${t(language, 'frame')} ${index + 1}`}
                                                            className="w-12 h-12 object-cover rounded"
                                                        />
                                                        <div className="flex-1">
                                                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${input.order === 'start'
                                                                ? 'bg-green-600/30 text-green-400'
                                                                : 'bg-orange-600/30 text-orange-400'
                                                                }`}>
                                                                {input.order === 'start' ? t(language, 'start') : t(language, 'end')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {connectedImageNodes.length > frameInputsWithUrls.length && (
                                            <div className="text-xs text-neutral-500 mt-1">
                                                {connectedImageNodes.length - frameInputsWithUrls.length} {t(language, 'moreInputsAvailable')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
};

// Memoize to prevent re-renders when parent state changes
export const NodeControls = memo(NodeControlsComponent);
