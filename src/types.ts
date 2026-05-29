
export enum NodeType {
  TEXT = 'Text',
  IMAGE = 'Image',
  VIDEO = 'Video',
  AUDIO = 'Audio',
  IMAGE_EDITOR = 'Image Editor',
  VIDEO_EDITOR = 'Video Editor',
  STORYBOARD = 'Storyboard Manager',
  CAMERA_ANGLE = 'Camera Angle',
  HERMES_PROJECT = 'Hermes Project',
  // Local open-source model nodes
  LOCAL_IMAGE_MODEL = 'Local Image Model',
  LOCAL_VIDEO_MODEL = 'Local Video Model'
}

export enum NodeStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}

export type GenerationStatus = 'queued' | 'running' | 'polling' | 'completed' | 'failed' | 'timeout' | 'cancelled';
export const IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const;
export type ImageQuality = typeof IMAGE_QUALITY_OPTIONS[number];

export interface NodeData {
  id: string;
  type: NodeType;
  title?: string; // Custom title for the node (defaults to type if not set)
  x: number;
  y: number;
  prompt: string;
  status: NodeStatus;
  resultUrl?: string; // Image URL or Video URL
  lastFrame?: string; // For Video nodes: base64/url of the last frame to use as input for next node
  parentIds?: string[]; // For connecting lines (supports multiple inputs)
  groupId?: string; // ID of the group this node belongs to
  errorMessage?: string;
  hideGenerationControls?: boolean; // Hide bottom generation controls for plain result nodes

  // Text node specific
  textMode?: 'menu' | 'editing'; // For Text nodes: current mode
  linkedVideoNodeId?: string; // For Text nodes: linked video node for prompt sync
  textSource?: {
    type: 'image-prompt-reverse';
    parentNodeId: string;
    sourceImageUrl: string;
    sourceImageIndex: number;
    promptTemplateVersion: 'image-prompt-description-v1';
    generatedAt?: string;
    status?: 'idle' | 'loading' | 'success' | 'error';
    errorMessage?: string;
  };

  // Video node specific
  videoMode?: 'standard' | 'frame-to-frame' | 'motion-control'; // Video generation mode
  frameInputs?: { nodeId: string; order: 'start' | 'end' }[]; // For frame-to-frame: connected image nodes
  videoModel?: string; // Video model id
  videoDuration?: number; // Video duration in seconds (e.g., 5, 6, 8, 10)
  generateAudio?: boolean; // Whether to generate native audio when supported
  inputUrl?: string; // Input URL for video generation (image-to-video)

  // Video Editor specific
  trimStart?: number; // Trim start time in seconds
  trimEnd?: number; // Trim end time in seconds

  // Settings
  model: string;
  imageModel?: string; // Project image model id
  aspectRatio: string;
  resolution: string;
  quality?: ImageQuality; // T8 GPT Image 2 quality preset
  isPromptExpanded?: boolean; // Whether the prompt editing area is expanded
  resultAspectRatio?: string; // Actual aspect ratio of the generated image (e.g., '16/9')
  generationStartTime?: number; // Timestamp when generation started (for recovery race condition prevention)
  generationCount?: number; // Number of image variants to generate for Image nodes
  taskId?: string; // Async generation task id for queued image generation
  generationStatus?: GenerationStatus; // Backend task status for queued image generation
  progress?: number; // Backend task progress, if provider reports one

  // Legacy image reference settings retained for historical workflow compatibility
  klingReferenceMode?: 'subject' | 'face'; // Reference type for image-to-image
  klingFaceIntensity?: number; // Face reference intensity (0-100)
  klingSubjectIntensity?: number; // Subject reference intensity (0-100)
  detectedFaces?: { x: number; y: number; width: number; height: number }[]; // Detected face bounding boxes
  faceDetectionStatus?: 'idle' | 'loading' | 'success' | 'error'; // Face detection status

  // Image Editor state persistence
  editorElements?: Array<{
    id: string;
    type: 'arrow' | 'text' | 'shape';
    // Arrow properties
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    color?: string;
    lineWidth?: number;
    // Text properties
    x?: number;
    y?: number;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    // Shape properties
    shape?: 'rectangle' | 'ellipse';
    width?: number;
    height?: number;
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
    fillOpacity?: number;
    filled?: boolean;
  }>; // Elements (arrows, text) drawn in image editor
  editorCanvasData?: string; // Base64 brush/eraser canvas data
  editorCanvasSize?: { width: number; height: number }; // Size of the canvas when elements were saved (for scaling)
  editorBackgroundUrl?: string; // Clean background image URL (without elements) for re-editing

  // Change Angle mode (Image nodes only)
  angleMode?: boolean; // Whether the node is in angle editing mode
  angleSettings?: {
    rotation: number;  // Horizontal rotation in degrees (-180 to 180)
    tilt: number;      // Vertical tilt in degrees (-90 to 90)
    zoom: number;      // Camera/framing distance (-100 to 100)
    wideAngle: boolean; // Whether to use wide-angle lens perspective
  };

  // Local Model node specific
  localModelId?: string;        // ID of the selected local model
  localModelPath?: string;      // Absolute path to model file on disk
  localModelType?: 'diffusion' | 'controlnet' | 'lora' | 'camera-control';
  localModelArchitecture?: string; // Model architecture (e.g., 'sd15', 'sdxl', 'qwen')

  // Storyboard Generator specific
  characterReferenceUrls?: string[]; // URLs of character images for reference in generation

  // Hermes Project node specific
  hermesProject?: {
    hermesRunId?: string;
    chatSessionId?: string;
    projectCode?: string;
    status?: string;
    project?: unknown;
    projectBrief?: unknown;
    projectFields?: unknown;
    references?: unknown;
    designStrategy?: unknown;
    designTasks?: unknown[];
    expectedDesignTaskCount?: number | null;
    actualDesignTaskCount?: number | null;
    maxDesignsPerGeneration?: number | null;
    batchPlan?: unknown;
    generationReadiness?: unknown;
    warnings?: unknown[];
    generatedImages?: Array<{
      id: string;
      projectCode: string;
      hermesRunId?: string;
      designTaskId?: string;
      generationTaskId?: string;
      batchId?: string;
      title?: string;
      targetSize?: string;
      model: string;
      provider?: string;
      prompt?: string;
      negativePrompt?: string;
      structuredPromptDescription?: unknown;
      imageUrl?: string;
      thumbnailUrl?: string;
      resultUrl?: string;
      status: 'completed' | 'failed' | 'pending' | 'running' | 'queued';
      errorMessageSafe?: string;
      referenceIds?: string[];
      referenceUrls?: string[];
      triggerMode?: 'hermes_auto' | 'manual_task' | 'regeneration' | 'unknown';
      createdAt?: string;
      updatedAt?: string;
    }>;
    autoDraftGeneration?: {
      status?: 'idle' | 'pending' | 'running' | 'completed' | 'partial' | 'failed';
      startedAt?: string;
      completedAt?: string;
      expectedCount?: number | null;
      submittedCount?: number | null;
      completedCount?: number | null;
      failedCount?: number | null;
    };
    draftRunsByTaskId?: Record<string, {
      generationTaskId?: string;
      status: 'idle' | 'pending' | 'queued' | 'running' | 'polling' | 'completed' | 'failed';
      progress?: number | null;
      imageModel?: string;
      provider?: string;
      originalModelRecommendation?: string;
      normalizedModelRecommendation?: string;
      resultUrl?: string | null;
      errorMessage?: string | null;
      prompt?: string;
      negativePrompt?: string;
      submittedAt?: string;
      completedAt?: string;
      createdAt?: string;
      updatedAt?: string;
    }>;
  };
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  type: 'global' | 'node-connector' | 'node-options' | 'add-nodes'; // 'global' = right click on canvas, 'add-nodes' = double click
  sourceNodeId?: string; // If 'node-connector' or 'node-options', which node originated the click
  connectorSide?: 'left' | 'right';
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectionBox {
  isActive: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface NodeGroup {
  id: string;
  nodeIds: string[];
  label: string;
  storyContext?: {
    story: string;
    scripts: any[];
    selectedCharacters?: any[]; // CharacterAsset[]
    sceneCount?: number;
    styleAnchor?: string;
    characterDNA?: Record<string, string>;
    compositeImageUrl?: string | null;
  };
}
