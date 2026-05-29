/**
 * App.tsx
 * 
 * Main application component for TwitCanva.
 * Orchestrates canvas, nodes, connections, and user interactions.
 * Uses custom hooks for state management and logic separation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { CanvasNode } from './components/canvas/CanvasNode';
import { ConnectionsLayer } from './components/canvas/ConnectionsLayer';
import { ContextMenu } from './components/ContextMenu';
import { ContextMenuState, NodeData, NodeStatus, NodeType } from './types';
import { createImageTask, generateVideo, getHermesGenerationTasksForRun, waitForImageTaskCompletion } from './services/generationService';
import type { GenerationTask, GenerationTaskStatus, HermesGenerationTaskRecovery } from './services/generationService';
import { useCanvasNavigation } from './hooks/useCanvasNavigation';
import { useNodeManagement } from './hooks/useNodeManagement';
import { useConnectionDragging } from './hooks/useConnectionDragging';
import { useNodeDragging } from './hooks/useNodeDragging';
import { useGeneration } from './hooks/useGeneration';
import { useSelectionBox } from './hooks/useSelectionBox';
import { useGroupManagement } from './hooks/useGroupManagement';
import { useHistory } from './hooks/useHistory';
import { useCanvasTitle } from './hooks/useCanvasTitle';
import { useWorkflow } from './hooks/useWorkflow';
import { useImageEditor } from './hooks/useImageEditor';
import { useVideoEditor } from './hooks/useVideoEditor';
import { usePanelState } from './hooks/usePanelState';
import { useAssetHandlers } from './hooks/useAssetHandlers';
import { useTextNodeHandlers } from './hooks/useTextNodeHandlers';
import { useImageNodeHandlers } from './hooks/useImageNodeHandlers';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useContextMenuHandlers } from './hooks/useContextMenuHandlers';
import { useAutoSave } from './hooks/useAutoSave';
import { useGenerationRecovery } from './hooks/useGenerationRecovery';
import { useVideoFrameExtraction } from './hooks/useVideoFrameExtraction';
import { extractVideoLastFrame } from './utils/videoHelpers';
import { SelectionBoundingBox } from './components/canvas/SelectionBoundingBox';
import { WorkflowPanel } from './components/WorkflowPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ChatPanel, ChatBubble } from './components/ChatPanel';
import { ImageEditorModal } from './components/modals/ImageEditorModal';
import { VideoEditorModal } from './components/modals/VideoEditorModal';
import { ExpandedMediaModal } from './components/modals/ExpandedMediaModal';
import { CreateAssetModal } from './components/modals/CreateAssetModal';
import { TikTokImportModal } from './components/modals/TikTokImportModal';
import { TwitterPostModal } from './components/modals/TwitterPostModal';
import { TikTokPostModal } from './components/modals/TikTokPostModal';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { useTikTokImport } from './hooks/useTikTokImport';
import { useStoryboardGenerator } from './hooks/useStoryboardGenerator';
import { StoryboardGeneratorModal } from './components/modals/StoryboardGeneratorModal';
import { StoryboardVideoModal } from './components/modals/StoryboardVideoModal';
import { Language, t } from './i18n/translations';
import { uploadAsset } from './services/assetService';
import { getEffectiveImageReference } from './utils/imageReferences';
import { AuthUser, useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import type { HermesRunPayload } from './hooks/useChatAgent';
import {
  T8_GPT_IMAGE_2_EDIT_MODEL_ID,
  T8_GPT_IMAGE_2_MODEL_ID,
  imageModelSupportsQuality,
  normalizeImageQuality
} from './config/imageModels';
import {
  debugCanvasSurfaceEventIgnored,
  getCanvasSurfaceEventIgnoreReason
} from './utils/canvasEventTarget';
import { buildAgentCanvasContext } from './utils/agentCanvasContext';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Helper to convert URL/Blob to Base64
const urlToBase64 = async (url: string): Promise<string> => {
  if (url.startsWith('data:image')) return url;

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error converting URL to base64:", e);
    return "";
  }
};

const getConnectedMediaReference = (node: NodeData | undefined, nodesById: Map<string, NodeData>) => {
  if (!node) return null;

  if (node.type === NodeType.VIDEO && node.resultUrl) {
    return {
      id: node.id,
      url: node.lastFrame || node.resultUrl,
      type: node.type,
      status: node.status,
      resultUrl: node.resultUrl,
      referenceSourceId: node.id,
      referenceSourceType: node.type,
      isFallbackReference: false
    };
  }

  const imageReference = getEffectiveImageReference(node, nodesById);
  if (!imageReference) return null;

  return {
    id: node.id,
    url: imageReference.url,
    type: node.type,
    status: node.status,
    resultUrl: node.resultUrl,
    referenceSourceId: imageReference.sourceNodeId,
    referenceSourceType: imageReference.sourceNodeType,
    isFallbackReference: imageReference.isFallback
  };
};

const HERMES_AUTO_DRAFT_MAX_PER_BATCH = 6;
const HERMES_DRAFT_T8_GPT_IMAGE_MODEL = 'custom-image-t8-gpt-image-2';
const HERMES_DRAFT_T8_NANO_BANANA_MODEL = 'custom-image-t8-nano-banana-3-1-flash';
const HERMES_DRAFT_DEFAULT_IMAGE_MODEL = HERMES_DRAFT_T8_NANO_BANANA_MODEL;

type HermesDraftRun = NonNullable<NonNullable<NodeData['hermesProject']>['draftRunsByTaskId']>[string];
type HermesDraftRunStatus = HermesDraftRun['status'];
type HermesProjectMetadata = NonNullable<NodeData['hermesProject']>;
type HermesGeneratedImage = NonNullable<HermesProjectMetadata['generatedImages']>[number];

const asHermesString = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const asHermesStringList = (value: unknown): string[] => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(asHermesString).filter(Boolean);
};

const getHermesRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const getHermesProjectCodeFromRun = (hermesRun: HermesRunPayload): string => {
  const project = getHermesRecord(hermesRun.project);
  const projectBrief = getHermesRecord(hermesRun.projectBrief);
  return asHermesString(hermesRun.projectCode) ||
    asHermesString(project?.code) ||
    asHermesString(project?.projectCode) ||
    asHermesString(projectBrief?.projectCode);
};

const hasHermesCanvasNodePayload = (hermesRun: HermesRunPayload): boolean => {
  const project = getHermesRecord(hermesRun.project);
  const projectBrief = getHermesRecord(hermesRun.projectBrief);
  const references = getHermesRecord(hermesRun.references);
  const companyFields = getHermesRecord(project?.companyFields);

  const hasDesignTasks = Array.isArray(hermesRun.designTasks) && hermesRun.designTasks.length > 0;
  const hasProductTasks = Array.isArray(hermesRun.productTasks) && hermesRun.productTasks.length > 0;
  const hasProjectBrief = Boolean(projectBrief && Object.keys(projectBrief).length > 0);
  const hasProjectFields = Boolean(project && Object.keys(project).length > 0);
  const hasCompanyFields = Boolean(companyFields && Object.keys(companyFields).length > 0);
  const hasReferenceImages = Array.isArray(references?.images) && references.images.length > 0;
  const hasReferenceLinks = Array.isArray(references?.links) && references.links.length > 0;

  return hasDesignTasks || hasProductTasks || hasProjectBrief || hasProjectFields || hasCompanyFields || hasReferenceImages || hasReferenceLinks;
};

const canCreateHermesCanvasNodeFromRun = (hermesRun: HermesRunPayload): boolean => (
  hermesRun.status === 'completed' &&
  Boolean(getHermesProjectCodeFromRun(hermesRun)) &&
  hasHermesCanvasNodePayload(hermesRun)
);

const normalizeHermesDraftImageModel = (model: unknown): string => {
  const normalized = asHermesString(model);
  if (normalized === HERMES_DRAFT_T8_GPT_IMAGE_MODEL || normalized === HERMES_DRAFT_T8_NANO_BANANA_MODEL) {
    return normalized;
  }
  if (normalized === 'custom-image-gpt-image-2') {
    return HERMES_DRAFT_T8_GPT_IMAGE_MODEL;
  }
  if (normalized === 'custom-image-nano-banana-3-1-flash') {
    return HERMES_DRAFT_T8_NANO_BANANA_MODEL;
  }
  return HERMES_DRAFT_DEFAULT_IMAGE_MODEL;
};

const mapImageTaskStatusToHermesDraftStatus = (
  status: GenerationTaskStatus
): HermesDraftRunStatus => {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'timeout' || status === 'cancelled') return 'failed';
  if (status === 'queued') return 'queued';
  if (status === 'polling') return 'polling';
  return 'running';
};

const getGenerationTaskResultUrl = (task: GenerationTask): string | null => {
  if (typeof task.resultUrl === 'string' && task.resultUrl.trim()) {
    return task.resultUrl.trim();
  }

  const output = task.output && typeof task.output === 'object' && !Array.isArray(task.output)
    ? task.output
    : null;
  if (!output) return null;

  const directUrl = output.resultUrl || output.url || output.imageUrl;
  if (typeof directUrl === 'string' && directUrl.trim()) {
    return directUrl.trim();
  }

  const images = output.images;
  if (!Array.isArray(images)) return null;

  for (const image of images) {
    if (typeof image === 'string' && image.trim()) return image.trim();
    if (image && typeof image === 'object' && !Array.isArray(image)) {
      const url = image.url || image.resultUrl || image.imageUrl;
      if (typeof url === 'string' && url.trim()) return url.trim();
    }
  }

  return null;
};

const getSafeHermesDraftErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (!raw.trim()) return '生成失败，请稍后重试。';
  if (/(402|payment required|insufficient balance|quota|billing|balance)/i.test(raw)) {
    return '生成失败：供应商余额不足或请求被拒绝。';
  }
  if (/(403|401|unauthorized|forbidden|permission|credential|api[_ -]?key)/i.test(raw)) {
    return '生成失败：请检查模型供应商额度或配置。';
  }
  if (/(sk-[a-z0-9_*.-]+|bearer|authorization|token|key|password|database_url|postgres|mysql|connection string)/i.test(raw)) {
    return '生成失败，请稍后重试。';
  }
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
};

const getHermesDesignTaskId = (task: unknown, index: number): string => {
  if (task && typeof task === 'object' && !Array.isArray(task)) {
    const record = task as Record<string, unknown>;
    const explicitId = asHermesString(record.taskId || record.id);
    if (explicitId) return explicitId;
  }
  return `concept_${String(index + 1).padStart(2, '0')}`;
};

const sanitizeHermesTaskIdPart = (value: string): string => (
  value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'task'
);

const getHermesAutoDraftTasks = (hermesRun: HermesRunPayload) => {
  if (hermesRun.lightweightMode === true) return [];
  const designTasks = Array.isArray(hermesRun.designTasks) ? hermesRun.designTasks : [];
  const reportedMaxPerBatch = typeof hermesRun.maxDesignsPerGeneration === 'number' && hermesRun.maxDesignsPerGeneration > 0
    ? hermesRun.maxDesignsPerGeneration
    : HERMES_AUTO_DRAFT_MAX_PER_BATCH;
  const maxPerBatch = Math.min(reportedMaxPerBatch, HERMES_AUTO_DRAFT_MAX_PER_BATCH);
  const expected = typeof hermesRun.expectedDesignTaskCount === 'number' && hermesRun.expectedDesignTaskCount > 0
    ? hermesRun.expectedDesignTaskCount
    : null;
  const targetCount = expected
    ? Math.min(expected, maxPerBatch, designTasks.length)
    : Math.min(maxPerBatch, designTasks.length);

  return designTasks.slice(0, targetCount).map((task, index) => ({
    task,
    designTaskId: getHermesDesignTaskId(task, index),
    index
  }));
};

const getHermesProjectCodeFromMetadata = (hermesProject: HermesProjectMetadata): string => {
  const project = getHermesRecord(hermesProject.project);
  const projectBrief = getHermesRecord(hermesProject.projectBrief);
  return asHermesString(hermesProject.projectCode) ||
    asHermesString(project?.code) ||
    asHermesString(project?.projectCode) ||
    asHermesString(projectBrief?.projectCode);
};

const getHermesReferenceUrlsByIds = (references: unknown, referenceIds: string[]): string[] => {
  if (referenceIds.length === 0) return [];
  const referencesRecord = getHermesRecord(references);
  if (!referencesRecord) return [];
  const candidates = [
    ...(Array.isArray(referencesRecord.images) ? referencesRecord.images : []),
    ...(Array.isArray(referencesRecord.links) ? referencesRecord.links : [])
  ];
  const wantedIds = new Set(referenceIds);
  return candidates
    .map(item => getHermesRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item && wantedIds.has(asHermesString(item.id))))
    .map(item => asHermesString(item.url) || asHermesString(item.resolvedUrl) || asHermesString(item.rawValue))
    .filter(Boolean);
};

const mapDraftStatusToGeneratedImageStatus = (status: HermesDraftRunStatus): HermesGeneratedImage['status'] => {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'queued') return 'queued';
  if (status === 'running' || status === 'polling') return 'running';
  return 'pending';
};

const buildHermesGeneratedImages = (hermesProject: HermesProjectMetadata): HermesGeneratedImage[] => {
  const draftRunsByTaskId = hermesProject.draftRunsByTaskId || {};
  const designTasks = Array.isArray(hermesProject.designTasks) ? hermesProject.designTasks : [];
  const designTaskById = new Map<string, Record<string, unknown>>();

  designTasks.forEach((task, index) => {
    const record = getHermesRecord(task);
    if (!record) return;
    designTaskById.set(getHermesDesignTaskId(record, index), record);
  });

  const projectCode = getHermesProjectCodeFromMetadata(hermesProject);
  const hermesRunId = asHermesString(hermesProject.hermesRunId);
  const batchPlan = getHermesRecord(hermesProject.batchPlan);

  return Object.entries(draftRunsByTaskId).map(([designTaskId, draftRun]) => {
    const task = designTaskById.get(designTaskId) || {};
    const referenceIds = asHermesStringList(task.referenceIds);
    const resultUrl = asHermesString(draftRun.resultUrl);
    const imageModel = asHermesString(draftRun.imageModel) ||
      asHermesString(draftRun.normalizedModelRecommendation) ||
      asHermesString(task.modelRecommendation) ||
      HERMES_DRAFT_DEFAULT_IMAGE_MODEL;

    return {
      id: `hermes_image_${sanitizeHermesTaskIdPart(hermesRunId || projectCode || 'run')}_${sanitizeHermesTaskIdPart(designTaskId)}`,
      projectCode,
      hermesRunId: hermesRunId || undefined,
      designTaskId,
      generationTaskId: draftRun.generationTaskId,
      batchId: asHermesString(batchPlan?.batchLabel) || undefined,
      title: asHermesString(task.title) || undefined,
      targetSize: asHermesString(task.targetSize) || undefined,
      model: imageModel,
      provider: draftRun.provider,
      prompt: asHermesString(draftRun.prompt) || asHermesString(task.prompt) || undefined,
      negativePrompt: asHermesString(draftRun.negativePrompt) || asHermesString(task.negativePrompt) || undefined,
      structuredPromptDescription: task.structuredPromptDescription,
      imageUrl: resultUrl || undefined,
      resultUrl: resultUrl || undefined,
      status: mapDraftStatusToGeneratedImageStatus(draftRun.status),
      errorMessageSafe: asHermesString(draftRun.errorMessage) || undefined,
      referenceIds,
      referenceUrls: getHermesReferenceUrlsByIds(hermesProject.references, referenceIds),
      triggerMode: 'hermes_auto' as const,
      createdAt: draftRun.createdAt || draftRun.submittedAt,
      updatedAt: draftRun.updatedAt || draftRun.completedAt
    };
  });
};

const withHermesGeneratedImages = (hermesProject: HermesProjectMetadata): HermesProjectMetadata => ({
  ...hermesProject,
  generatedImages: buildHermesGeneratedImages(hermesProject)
});

const mapRecoveredHermesTaskToDraftRun = (task: HermesGenerationTaskRecovery): HermesDraftRun => ({
  generationTaskId: task.generationTaskId,
  status: mapImageTaskStatusToHermesDraftStatus(task.status),
  progress: task.progress ?? null,
  imageModel: task.model || task.normalizedModelRecommendation || undefined,
  provider: task.provider || undefined,
  originalModelRecommendation: task.originalModelRecommendation || undefined,
  normalizedModelRecommendation: task.normalizedModelRecommendation || task.model || undefined,
  resultUrl: task.resultUrl || null,
  errorMessage: task.errorMessageSafe || null,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  completedAt: task.status === 'completed' || task.status === 'failed' || task.status === 'timeout' || task.status === 'cancelled'
    ? (task.updatedAt || new Date().toISOString())
    : undefined
});


// Canvas render memo helpers.
type ConnectedImageNode = {
  id: string;
  url: string;
  type?: NodeType;
  status?: NodeStatus;
  resultUrl?: string;
  referenceSourceId?: string;
  referenceSourceType?: NodeType;
  isFallbackReference?: boolean;
};

interface NodeRenderMeta {
  inputUrl?: string;
  connectedImageNodes: ConnectedImageNode[];
  selected: boolean;
  showControls: boolean;
}

const EMPTY_CONNECTED_IMAGE_NODES: ConnectedImageNode[] = [];

const useStableCallback = <T extends (...args: any[]) => any>(callback: T): T => {
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  return React.useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
};

//用于给非https 环境下的crypto兼容
if (typeof window !== 'undefined') {
  if (!window.crypto) {
    (window as any).crypto = {};
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = function () {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    } as any;
  }
}

const isEditableElement = (element: Element | null): boolean => {
  if (!element) return false;

  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  const editableTarget = element.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
  );

  return Boolean(editableTarget);
};

function CanvasApp({
  currentUser,
  onLogout
}: {
  currentUser: AuthUser;
  onLogout: () => Promise<void>;
}) {
  // ============================================================================
  // STATE
  // ============================================================================

  const [hasApiKey] = useState(true); // Backend handles API key
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'global'
  });

  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('dark');
  const [isSpacePanMode, setIsSpacePanMode] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('myml-language') as Language) || 'zh';
  });

  const toggleLanguage = () => {
    setLanguage(prev => {
      const next = prev === 'zh' ? 'en' : 'zh';
      localStorage.setItem('myml-language', next);
      return next;
    });
  };

  // Panel state management (history, chat, asset library, expand)
  const {
    isHistoryPanelOpen,
    historyPanelY,
    handleHistoryClick: panelHistoryClick,
    closeHistoryPanel,
    expandedImageUrl,
    handleExpandImage,
    handleCloseExpand,
    isChatOpen,
    toggleChat,
    closeChat,
    isAssetLibraryOpen,
    assetLibraryY,
    assetLibraryVariant,
    handleAssetsClick: panelAssetsClick,
    closeAssetLibrary,
    openAssetLibraryModal,
    isDraggingNodeToChat,
    handleNodeDragStart,
    handleNodeDragEnd
  } = usePanelState();

  const [canvasHoveredNodeId, setCanvasHoveredNodeId] = useState<string | null>(null);


  // Canvas title state (via hook)
  const {
    canvasTitle,
    setCanvasTitle,
    isEditingTitle,
    setIsEditingTitle,
    editingTitleValue,
    setEditingTitleValue,
    canvasTitleInputRef
  } = useCanvasTitle();

  const {
    viewport,
    setViewport,
    canvasRef,
    handleWheel: baseHandleWheel,
    handleZoomWheel,
    handleSliderZoom,
    isWheelInteracting
  } = useCanvasNavigation();

  const {
    nodes,
    setNodes,
    selectedNodeIds,
    setSelectedNodeIds,
    addNode,
    updateNode,
    deleteNode,
    deleteNodes,
    clearSelection,
    handleSelectTypeFromMenu
  } = useNodeManagement();

  const nodesById = React.useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const selectedNodeSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const nodeRenderMetaById = React.useMemo(() => {
    const metaById = new Map<string, NodeRenderMeta>();

    nodes.forEach(node => {
      let inputUrl: string | undefined;

      if (node.parentIds && node.parentIds.length > 0) {
        const parent = nodesById.get(node.parentIds[0]);

        if (node.type === NodeType.VIDEO_EDITOR && parent?.type === NodeType.VIDEO) {
          inputUrl = parent.resultUrl;
        } else if (parent?.type === NodeType.VIDEO && parent.lastFrame) {
          inputUrl = parent.lastFrame;
        } else {
          inputUrl = parent?.resultUrl;
        }
      }

      const connectedImageNodes = node.parentIds && node.parentIds.length > 0
        ? node.parentIds
          .map(parentId => nodesById.get(parentId))
          .map(parent => getConnectedMediaReference(parent, nodesById))
          .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference))
        : EMPTY_CONNECTED_IMAGE_NODES;

      const selected = selectedNodeSet.has(node.id);

      metaById.set(node.id, {
        inputUrl,
        connectedImageNodes: connectedImageNodes.length > 0 ? connectedImageNodes : EMPTY_CONNECTED_IMAGE_NODES,
        selected,
        showControls: selectedNodeSet.size === 1 && selected
      });
    });

    return metaById;
  }, [nodes, nodesById, selectedNodeSet]);
  const canvasHoveredNode = React.useMemo(
    () => canvasHoveredNodeId ? nodesById.get(canvasHoveredNodeId) : undefined,
    [canvasHoveredNodeId, nodesById]
  );
  // Wrap handleWheel to pass hovered node for zoom-to-center.
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    baseHandleWheel(e, canvasHoveredNode);
  }, [baseHandleWheel, canvasHoveredNode]);

  const {
    isDraggingConnection,
    connectionStart,
    tempConnectionEnd,
    hoveredNodeId: connectionHoveredNodeId,
    selectedConnection,
    setSelectedConnection,
    handleConnectorPointerDown,
    updateConnectionDrag,
    completeConnectionDrag,
    handleEdgeClick,
    deleteSelectedConnection
  } = useConnectionDragging();

  const {
    handleNodePointerDown,
    updateNodeDrag,
    endNodeDrag,
    startPanning,
    updatePanning,
    endPanning,
    isDragging,
    isPanning,
    releasePointerCapture
  } = useNodeDragging();

  const {
    selectionBox,
    isSelecting,
    startSelection,
    updateSelection,
    endSelection,
    clearSelectionBox
  } = useSelectionBox();

  const {
    groups,
    setGroups, // For workflow loading
    groupNodes,
    ungroupNodes,
    cleanupInvalidGroups,
    getCommonGroup,
    sortGroupNodes,
    renameGroup
  } = useGroupManagement();

  // History for undo/redo
  const {
    present: historyState,
    undo,
    redo,
    pushHistory,
    canUndo,
    canRedo
  } = useHistory({ nodes, groups }, 10);

  // Workflow management
  const {
    workflowId,
    isWorkflowPanelOpen,
    workflowPanelY,
    handleSaveWorkflow,
    handleLoadWorkflow,
    handleWorkflowsClick,
    closeWorkflowPanel,
    resetWorkflowId
  } = useWorkflow({
    nodes,
    groups,
    viewport,
    canvasTitle,
    setNodes,
    setGroups,
    setSelectedNodeIds,
    setCanvasTitle,
    setEditingTitleValue,
    onPanelOpen: () => {
      closeHistoryPanel();
      closeAssetLibrary();
    }
  });

  // Simple dirty flag for unsaved changes tracking
  const [isDirty, setIsDirty] = React.useState(false);
  const hasUnsavedChanges = isDirty && nodes.length > 0;

  // Mark as dirty when nodes or title change
  const isInitialMount = React.useRef(true);
  const savedRecoveryTaskIdsRef = React.useRef<Set<string>>(new Set());
  const ignoreNextChange = React.useRef(false);
  const activeTaskStatuses = React.useMemo(() => new Set(['queued', 'running', 'polling']), []);
  const isActiveTaskNode = React.useCallback((node: NodeData) => (
    Boolean(node.taskId) &&
    Boolean(node.generationStatus) &&
    activeTaskStatuses.has(node.generationStatus)
  ), [activeTaskStatuses]);

  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (ignoreNextChange.current) {
      ignoreNextChange.current = false;
      return;
    }

    setIsDirty(true);

    const activeTaskIds = nodes
      .filter(isActiveTaskNode)
      .map(node => node.taskId)
      .filter((taskId): taskId is string => Boolean(taskId));

    const unsavedActiveTaskId = activeTaskIds.find(taskId => !savedRecoveryTaskIdsRef.current.has(taskId));
    if (unsavedActiveTaskId) {
      savedRecoveryTaskIdsRef.current.add(unsavedActiveTaskId);
      console.log('[App] New active generation task detected, triggering immediate save for recovery protection');
      handleSaveWithTracking();
    }
  }, [nodes, canvasTitle, isActiveTaskNode]);

  // Update saved state after workflow save
  const handleSaveWithTracking = async () => {
    await handleSaveWorkflow();
    setIsDirty(false);
  };

  // Load workflow and update tracking
  const handleLoadWithTracking = async (id: string) => {
    ignoreNextChange.current = true;
    await handleLoadWorkflow(id);
    setIsDirty(false);
  };

  const { handleGenerate } = useGeneration({
    nodes,
    updateNode,
    setNodes,
    setSelectedNodeIds,
    language,
    workflowId
  });

  // Keep a ref to handleGenerate so setTimeout callbacks can access the latest version
  const handleGenerateRef = React.useRef(handleGenerate);
  React.useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  // Create new canvas
  const handleNewCanvas = () => {
    ignoreNextChange.current = true;
    savedRecoveryTaskIdsRef.current.clear();
    setNodes([]);
    setGroups([]); // Reset groups for new canvas
    setSelectedNodeIds([]);
    setCanvasTitle('Untitled Canvas');
    setEditingTitleValue('Untitled Canvas');
    resetWorkflowId(); // Important: ensures new workflow gets a new ID
    setIsDirty(false);
  };

  // Image editor modal
  const {
    editorModal,
    handleOpenImageEditor,
    handleCloseImageEditor,
    handleUpload
  } = useImageEditor({ nodes, updateNode });

  const imageEditorGenerationAbortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      imageEditorGenerationAbortRef.current?.abort();
      imageEditorGenerationAbortRef.current = null;
    };
  }, []);

  const handleCloseImageEditorWithAbort = React.useCallback(() => {
    imageEditorGenerationAbortRef.current?.abort();
    imageEditorGenerationAbortRef.current = null;
    handleCloseImageEditor();
  }, [handleCloseImageEditor]);

  // Video editor modal
  const {
    videoEditorModal,
    handleOpenVideoEditor,
    handleCloseVideoEditor,
    handleExportTrimmedVideo
  } = useVideoEditor({ nodes, updateNode });
  const editorNode = React.useMemo(
    () => editorModal.nodeId ? nodesById.get(editorModal.nodeId) : undefined,
    [editorModal.nodeId, nodesById]
  );
  const videoEditorNode = React.useMemo(
    () => videoEditorModal.nodeId ? nodesById.get(videoEditorModal.nodeId) : undefined,
    [videoEditorModal.nodeId, nodesById]
  );

  /**
   * Routes editor open to the correct handler based on node type
   */
  const handleOpenEditor = React.useCallback((nodeId: string) => {
    const node = nodesById.get(nodeId);
    if (!node) return;

    if (node.type === NodeType.VIDEO_EDITOR) {
      handleOpenVideoEditor(nodeId);
    } else {
      handleOpenImageEditor(nodeId);
    }
  }, [nodesById, handleOpenVideoEditor, handleOpenImageEditor]);

  // Text node handlers
  const {
    handleWriteContent,
    handleTextToVideo,
    handleTextToImage
  } = useTextNodeHandlers({ nodes, updateNode, setNodes, setSelectedNodeIds });

  // Image node handlers
  const {
    handleImageToImage,
    handleImageToVideo,
    handleImageToEditor,
    handleRemoveBackground,
    handleChangeAngleGenerate
  } = useImageNodeHandlers({ nodes, setNodes, setSelectedNodeIds, onGenerateNode: handleGenerate, workflowId });

  // Asset handlers (create asset modal)
  const {
    isCreateAssetModalOpen,
    setIsCreateAssetModalOpen,
    nodeToSnapshot,
    handleOpenCreateAsset,
    handleSaveAssetToLibrary,
    handleContextUpload
  } = useAssetHandlers({ nodes, viewport, contextMenu, setNodes });

  // Keyboard shortcuts (copy/paste/delete/undo/redo)
  const {
    handleCopy,
    handlePaste,
    handleDuplicate
  } = useKeyboardShortcuts({
    nodes,
    selectedNodeIds,
    selectedConnection,
    setNodes,
    setSelectedNodeIds,
    setContextMenu,
    deleteNodes,
    deleteSelectedConnection,
    clearSelection,
    clearSelectionBox,
    undo,
    redo
  });

  // Auto-Save Management
  const { lastSaveTime: lastAutoSaveTime } = useAutoSave({
    isDirty,
    nodes,
    onSave: handleSaveWithTracking,
    interval: 60000 // Save every 60 seconds
  });

  // Generation Recovery Management
  useGenerationRecovery({
    nodes,
    updateNode,
    workflowId
  });

  const getAgentCanvasContext = React.useCallback((userMessage?: string) => buildAgentCanvasContext({
    nodes,
    groups,
    selectedNodeIds,
    viewport,
    workflowId,
    canvasTitle,
    userMessage
  }), [nodes, groups, selectedNodeIds, viewport, workflowId, canvasTitle]);

  const createdHermesProjectRunIdsRef = React.useRef<Set<string>>(new Set());
  const autoSubmittedHermesDraftKeysRef = React.useRef<Set<string>>(new Set());
  const recoveredHermesDraftRunIdsRef = React.useRef<Set<string>>(new Set());

  const summarizeHermesDraftRuns = React.useCallback((
    draftRunsByTaskId: Record<string, HermesDraftRun>,
    currentSummary?: NonNullable<NodeData['hermesProject']>['autoDraftGeneration']
  ): NonNullable<NodeData['hermesProject']>['autoDraftGeneration'] => {
    const runs = Object.values(draftRunsByTaskId);
    const activeCount = runs.filter(run => ['pending', 'queued', 'running', 'polling'].includes(run.status)).length;
    const completedCount = runs.filter(run => run.status === 'completed').length;
    const failedCount = runs.filter(run => run.status === 'failed').length;
    const submittedCount = runs.length;

    let status: NonNullable<NodeData['hermesProject']>['autoDraftGeneration']['status'] = currentSummary?.status || 'idle';
    if (submittedCount === 0) {
      status = 'idle';
    } else if (activeCount > 0) {
      status = 'running';
    } else if (failedCount > 0 && completedCount > 0) {
      status = 'partial';
    } else if (failedCount > 0) {
      status = 'failed';
    } else if (completedCount === submittedCount) {
      status = 'completed';
    }

    const finished = submittedCount > 0 && activeCount === 0;
    return {
      ...currentSummary,
      status,
      expectedCount: currentSummary?.expectedCount ?? submittedCount,
      submittedCount,
      completedCount,
      failedCount,
      completedAt: finished ? (currentSummary?.completedAt || new Date().toISOString()) : undefined
    };
  }, []);

  const patchHermesDraftRun = React.useCallback((
    nodeId: string,
    designTaskId: string,
    patch: Partial<HermesDraftRun>
  ) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId || node.type !== NodeType.HERMES_PROJECT) {
        return node;
      }

      const hermesProject = node.hermesProject || {};
      const existingRuns = hermesProject.draftRunsByTaskId || {};
      const existingRun = existingRuns[designTaskId] || { status: 'idle' as HermesDraftRunStatus };
      const nextRuns: Record<string, HermesDraftRun> = {
        ...existingRuns,
        [designTaskId]: {
          ...existingRun,
          ...patch,
          status: patch.status || existingRun.status
        }
      };

      const nextHermesProject = withHermesGeneratedImages({
        ...hermesProject,
        draftRunsByTaskId: nextRuns,
        autoDraftGeneration: summarizeHermesDraftRuns(nextRuns, hermesProject.autoDraftGeneration)
      });

      return {
        ...node,
        hermesProject: nextHermesProject
      };
    }));
  }, [setNodes, summarizeHermesDraftRuns]);

  const applyRecoveredHermesDraftTasks = React.useCallback((
    nodeId: string,
    recoveredTasks: HermesGenerationTaskRecovery[]
  ) => {
    if (recoveredTasks.length === 0) return;

    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId || node.type !== NodeType.HERMES_PROJECT) {
        return node;
      }

      const hermesProject = node.hermesProject || {};
      const nextRuns: Record<string, HermesDraftRun> = {
        ...(hermesProject.draftRunsByTaskId || {})
      };

      for (const task of recoveredTasks) {
        const designTaskId = asHermesString(task.designTaskId);
        if (!designTaskId) continue;

        const existingRun = nextRuns[designTaskId] || { status: 'idle' as HermesDraftRunStatus };
        nextRuns[designTaskId] = {
          ...existingRun,
          ...mapRecoveredHermesTaskToDraftRun(task),
          prompt: existingRun.prompt,
          negativePrompt: existingRun.negativePrompt
        };
      }

      const nextHermesProject = withHermesGeneratedImages({
        ...hermesProject,
        draftRunsByTaskId: nextRuns,
        autoDraftGeneration: summarizeHermesDraftRuns(nextRuns, hermesProject.autoDraftGeneration)
      });

      return {
        ...node,
        hermesProject: nextHermesProject
      };
    }));
  }, [setNodes, summarizeHermesDraftRuns]);

  const startHermesAutoDraftGeneration = React.useCallback((nodeId: string, hermesRun: HermesRunPayload) => {
    if (hermesRun.status !== 'completed') return;
    if (hermesRun.lightweightMode === true) return;

    const hermesRunId = typeof hermesRun.id === 'string' ? hermesRun.id : '';
    if (!hermesRunId) return;

    const projectRecord = hermesRun.project && typeof hermesRun.project === 'object'
      ? hermesRun.project
      : null;
    const projectCode = asHermesString(hermesRun.projectCode) ||
      asHermesString(projectRecord && 'code' in projectRecord ? projectRecord.code : undefined) ||
      asHermesString(projectRecord && 'projectCode' in projectRecord ? projectRecord.projectCode : undefined);

    const autoDraftTasks = getHermesAutoDraftTasks(hermesRun);
    if (autoDraftTasks.length === 0) return;

    for (const { task, designTaskId } of autoDraftTasks) {
      const dedupeKey = `${hermesRunId}:${projectCode || 'no-project'}:${designTaskId}`;
      if (autoSubmittedHermesDraftKeysRef.current.has(dedupeKey)) {
        continue;
      }
      autoSubmittedHermesDraftKeysRef.current.add(dedupeKey);

      const prompt = asHermesString(task.prompt);
      const negativePrompt = asHermesString(task.negativePrompt);
      const originalModelRecommendation = asHermesString(task.modelRecommendation);
      const normalizedModelRecommendation = normalizeHermesDraftImageModel(originalModelRecommendation);
      const title = asHermesString(task.title);
      const targetSize = asHermesString(task.targetSize);
      const referenceIds = asHermesStringList(task.referenceIds);
      const referenceUsage = asHermesString(task.referenceUsage);
      const submittedAt = new Date().toISOString();

      if (!prompt) {
        patchHermesDraftRun(nodeId, designTaskId, {
          status: 'failed',
          imageModel: normalizedModelRecommendation,
          originalModelRecommendation,
          normalizedModelRecommendation,
          errorMessage: '生成失败：该设计方向缺少 prompt。',
          submittedAt,
          completedAt: submittedAt
        });
        continue;
      }

      patchHermesDraftRun(nodeId, designTaskId, {
        status: 'pending',
        imageModel: normalizedModelRecommendation,
        originalModelRecommendation,
        normalizedModelRecommendation,
        prompt,
        negativePrompt,
        progress: 0,
        errorMessage: null,
        submittedAt
      });

      void (async () => {
        try {
          const createdTask = await createImageTask({
            nodeId: `hermes-draft-${sanitizeHermesTaskIdPart(hermesRunId)}-${sanitizeHermesTaskIdPart(designTaskId)}`,
            workflowId,
            prompt,
            imageModel: normalizedModelRecommendation,
            negativePrompt,
            source: 'hermes_design_task',
            capability: 'hermes-design-auto-candidate',
            projectCode,
            hermesRunId,
            designTaskId,
            title,
            targetSize,
            referenceIds,
            referenceUsage,
            originalModelRecommendation,
            normalizedModelRecommendation
          });

          patchHermesDraftRun(nodeId, designTaskId, {
            generationTaskId: createdTask.taskId,
            status: mapImageTaskStatusToHermesDraftStatus(createdTask.status),
            progress: 0
          });

          const completedTask = await waitForImageTaskCompletion(createdTask.taskId, {
            pollIntervalMs: 3000,
            maxWaitMs: 10 * 60 * 1000,
            onTaskUpdate: taskUpdate => {
              patchHermesDraftRun(nodeId, designTaskId, {
                generationTaskId: taskUpdate.taskId,
                status: mapImageTaskStatusToHermesDraftStatus(taskUpdate.status),
                progress: taskUpdate.progress ?? null,
                provider: taskUpdate.provider,
                resultUrl: getGenerationTaskResultUrl(taskUpdate),
                errorMessage: taskUpdate.errorMessage ? getSafeHermesDraftErrorMessage(taskUpdate.errorMessage) : null,
                updatedAt: taskUpdate.updatedAt
              });
            }
          });

          const resultUrl = getGenerationTaskResultUrl(completedTask);
          if (completedTask.status === 'completed' && resultUrl) {
            patchHermesDraftRun(nodeId, designTaskId, {
              generationTaskId: completedTask.taskId,
              status: 'completed',
              progress: completedTask.progress ?? 100,
              provider: completedTask.provider,
              resultUrl,
              errorMessage: null,
              completedAt: new Date().toISOString(),
              updatedAt: completedTask.updatedAt
            });
          } else {
            patchHermesDraftRun(nodeId, designTaskId, {
              generationTaskId: completedTask.taskId,
              status: 'failed',
              progress: completedTask.progress ?? null,
              provider: completedTask.provider,
              resultUrl: resultUrl || null,
              errorMessage: getSafeHermesDraftErrorMessage(
                completedTask.errorMessage || '生成任务未返回可用图片。'
              ),
              completedAt: new Date().toISOString(),
              updatedAt: completedTask.updatedAt
            });
          }
        } catch (error) {
          patchHermesDraftRun(nodeId, designTaskId, {
            status: 'failed',
            errorMessage: getSafeHermesDraftErrorMessage(error),
            completedAt: new Date().toISOString()
          });
        }
      })();
    }
  }, [patchHermesDraftRun, workflowId]);

  const createHermesProjectNodeFromRun = React.useCallback((hermesRun: HermesRunPayload) => {
    const hermesRunId = typeof hermesRun.id === 'string' ? hermesRun.id : '';
    if (!hermesRunId) return;

    const projectCode = getHermesProjectCodeFromRun(hermesRun);
    if (!canCreateHermesCanvasNodeFromRun(hermesRun)) {
      return;
    }

    const existingNode = nodes.find(node =>
      node.type === NodeType.HERMES_PROJECT &&
      node.hermesProject?.hermesRunId === hermesRunId
    );

    if (existingNode) {
      createdHermesProjectRunIdsRef.current.add(hermesRunId);
      setSelectedNodeIds([existingNode.id]);
      return;
    }

    if (createdHermesProjectRunIdsRef.current.has(hermesRunId)) {
      return;
    }
    createdHermesProjectRunIdsRef.current.add(hermesRunId);

    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const visibleWidth = canvasBounds?.width ?? window.innerWidth;
    const visibleHeight = canvasBounds?.height ?? window.innerHeight;
    const chatPanelWidth = isChatOpen ? 400 : 0;
    const screenCenterX = Math.max(380, (visibleWidth - chatPanelWidth) / 2);
    const screenCenterY = Math.max(280, visibleHeight * 0.42);
    const x = Math.round((screenCenterX - viewport.x) / viewport.zoom - 360);
    const y = Math.round((screenCenterY - viewport.y) / viewport.zoom - 260);
    const autoDraftTasks = hermesRun.status === 'completed' ? getHermesAutoDraftTasks(hermesRun) : [];
    const autoDraftStartedAt = autoDraftTasks.length > 0 ? new Date().toISOString() : undefined;
    const initialDraftRunsByTaskId = autoDraftTasks.reduce<Record<string, HermesDraftRun>>((acc, { task, designTaskId }) => {
      const originalModelRecommendation = asHermesString(task.modelRecommendation);
      const normalizedModelRecommendation = normalizeHermesDraftImageModel(originalModelRecommendation);
      acc[designTaskId] = {
        status: 'pending',
        imageModel: normalizedModelRecommendation,
        originalModelRecommendation,
        normalizedModelRecommendation,
        prompt: asHermesString(task.prompt),
        negativePrompt: asHermesString(task.negativePrompt),
        progress: 0,
        resultUrl: null,
        errorMessage: null,
        submittedAt: autoDraftStartedAt
      };
      return acc;
    }, {});
    const initialHermesProject = withHermesGeneratedImages({
      hermesRunId,
      chatSessionId: undefined,
      projectCode,
      status: hermesRun.status,
      project: hermesRun.project,
      projectBrief: hermesRun.projectBrief,
      projectFields: hermesRun.project,
      lightweightMode: hermesRun.lightweightMode === true,
      fallbackReason: hermesRun.fallbackReason ?? null,
      multiProductBundle: hermesRun.multiProductBundle === true,
      productTasks: Array.isArray(hermesRun.productTasks) ? hermesRun.productTasks : [],
      references: hermesRun.references,
      designStrategy: hermesRun.designStrategy,
      designTasks: Array.isArray(hermesRun.designTasks) ? hermesRun.designTasks : [],
      expectedDesignTaskCount: hermesRun.expectedDesignTaskCount ?? null,
      actualDesignTaskCount: hermesRun.actualDesignTaskCount ?? null,
      maxDesignsPerGeneration: hermesRun.maxDesignsPerGeneration ?? null,
      batchPlan: hermesRun.batchPlan,
      generationReadiness: hermesRun.generationReadiness,
      warnings: hermesRun.warnings,
      autoDraftGeneration: {
        status: autoDraftTasks.length > 0 ? 'pending' : 'idle',
        startedAt: autoDraftStartedAt,
        expectedCount: autoDraftTasks.length,
        submittedCount: autoDraftTasks.length,
        completedCount: 0,
        failedCount: 0
      },
      draftRunsByTaskId: initialDraftRunsByTaskId
    });

    const newNode: NodeData = {
      id: crypto.randomUUID(),
      type: NodeType.HERMES_PROJECT,
      x,
      y,
      prompt: '',
      status: hermesRun.status === 'failed' ? NodeStatus.ERROR : NodeStatus.SUCCESS,
      model: 'Hermes',
      aspectRatio: 'Auto',
      resolution: 'Auto',
      title: `Hermes 项目：${projectCode || hermesRunId.slice(0, 8)}`,
      hideGenerationControls: true,
      hermesProject: initialHermesProject
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeIds([newNode.id]);
    startHermesAutoDraftGeneration(newNode.id, hermesRun);
  }, [
    canvasRef,
    isChatOpen,
    nodes,
    setNodes,
    setSelectedNodeIds,
    startHermesAutoDraftGeneration,
    viewport.x,
    viewport.y,
    viewport.zoom
  ]);

  React.useEffect(() => {
    const hermesProjectNodes = nodes.filter(node =>
      node.type === NodeType.HERMES_PROJECT &&
      typeof node.hermesProject?.hermesRunId === 'string' &&
      node.hermesProject.hermesRunId.trim()
    );

    for (const node of hermesProjectNodes) {
      const hermesRunId = node.hermesProject?.hermesRunId?.trim();
      if (!hermesRunId || recoveredHermesDraftRunIdsRef.current.has(hermesRunId)) {
        continue;
      }

      recoveredHermesDraftRunIdsRef.current.add(hermesRunId);
      const projectCode = asHermesString(node.hermesProject?.projectCode);

      void (async () => {
        try {
          const { tasks } = await getHermesGenerationTasksForRun(hermesRunId, projectCode || null);
          applyRecoveredHermesDraftTasks(node.id, tasks);
        } catch (error) {
          console.warn('[Hermes] Failed to recover draft generation tasks:', error instanceof Error ? error.message : 'unknown_error');
        }
      })();
    }
  }, [applyRecoveredHermesDraftTasks, nodes]);

  // Video Frame Extraction (auto-extract lastFrame for videos missing thumbnails)
  useVideoFrameExtraction({
    nodes,
    updateNode
  });

  // TikTok Import Tool
  const {
    isModalOpen: isTikTokModalOpen,
    openModal: openTikTokModal,
    closeModal: closeTikTokModal,
    handleVideoImported: handleTikTokVideoImported
  } = useTikTokImport({
    nodes,
    setNodes,
    setSelectedNodeIds,
    viewport
  });

  // Storyboard Generator Tool
  const handleCreateStoryboardNodes = React.useCallback((
    newNodeData: Partial<NodeData>[],
    groupInfo?: { groupId: string; groupLabel: string }
  ) => {
    console.log('[Storyboard] handleCreateStoryboardNodes called with', newNodeData.length, 'nodes, groupInfo:', !!groupInfo);
    const newNodes: NodeData[] = newNodeData.map(data => ({
      id: data.id || crypto.randomUUID(),
      type: data.type || NodeType.IMAGE,
      x: data.x || 0,
      y: data.y || 0,
      prompt: data.prompt || '',
      status: data.status || NodeStatus.IDLE,
      model: data.model || T8_GPT_IMAGE_2_MODEL_ID,
      imageModel: data.imageModel,
      aspectRatio: data.aspectRatio || '16:9',
      resolution: data.resolution || '1K',
      title: data.title,
      parentIds: data.parentIds || [],
      groupId: data.groupId,
      characterReferenceUrls: data.characterReferenceUrls
    }));

    setNodes(prev => [...prev, ...newNodes]);

    // Auto-group the storyboard nodes
    if (groupInfo && newNodes.length > 0) {
      const newGroup = {
        id: groupInfo.groupId,
        nodeIds: newNodes.map(n => n.id),
        label: groupInfo.groupLabel,
        // Save story context if available to help AI understand the full narrative later
        storyContext: (groupInfo as any).storyContext
      };
      setGroups(prev => [...prev, newGroup]);
    }

    if (newNodes.length > 0) {
      setSelectedNodeIds(newNodes.map(n => n.id));
    }

    // Auto-trigger generation for each storyboard node with a small delay
    // to ensure state is updated before generation starts
    if (groupInfo) {
      setTimeout(() => {
        console.log('[Storyboard] Auto-triggering generation for', newNodes.length, 'nodes');
        newNodes.forEach((node, index) => {
          // Stagger generation calls slightly to avoid overwhelming the API
          setTimeout(() => {
            console.log(`[Storyboard] Starting generation for node ${index + 1}:`, node.id);
            // Use ref to get the latest handleGenerate function
            handleGenerateRef.current(node.id);
          }, index * 500); // 500ms delay between each node
        });
      }, 100); // Initial delay to let state settle
    }
  }, [setNodes, setSelectedNodeIds, setGroups]);

  const storyboardGenerator = useStoryboardGenerator({
    onCreateNodes: handleCreateStoryboardNodes,
    viewport
  });

  const handleEditStoryboard = React.useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group?.storyContext) {
      console.log('[App] Editing storyboard:', groupId);
      storyboardGenerator.editStoryboard(group.storyContext);
    }
  }, [groups, storyboardGenerator]);

  // Storyboard Video Modal State
  const [storyboardVideoModal, setStoryboardVideoModal] = useState<{
    isOpen: boolean;
    nodes: NodeData[];
    storyContext?: { story: string; scripts: any[] };
  }>({ isOpen: false, nodes: [] });

  const handleCreateStoryboardVideo = React.useCallback((targetNodeIds?: string[]) => {
    // Determine which nodes to use: explicit list or current selection
    const nodeIdsToCheck = targetNodeIds || selectedNodeIds;

    // Filter for Image nodes only (can't make video from text/video directly in this flow)
    const selectedImageNodes = nodes.filter(n => nodeIdsToCheck.includes(n.id) && n.type === NodeType.IMAGE);

    if (selectedImageNodes.length === 0) {
      console.warn("No image nodes selected for video generation. Checked IDs:", nodeIdsToCheck);
      return;
    }

    // Check if nodes belong to a group with story context
    const firstNode = selectedImageNodes[0];
    const group = firstNode.groupId ? groups.find(g => g.id === firstNode.groupId) : undefined;
    const storyContext = group?.storyContext;

    if (storyContext) {
      console.log('[App] Found Story Context for Video Modal:', {
        storyLength: storyContext.story.length,
        scriptsCount: storyContext.scripts.length
      });
    }

    setStoryboardVideoModal({
      isOpen: true,
      nodes: selectedImageNodes,
      storyContext
    });
  }, [nodes, selectedNodeIds, groups]);

  const handleGenerateStoryVideos = React.useCallback((
    prompts: Record<string, string>,
    settings: { model: string; duration: number; resolution: string; },
    activeNodeIds?: string[]
  ) => {
    // Close modal
    setStoryboardVideoModal(prev => ({ ...prev, isOpen: false }));

    const newNodes: NodeData[] = [];
    // Use activeNodeIds to filter source nodes if provided, otherwise use all
    const sourceNodes = activeNodeIds
      ? storyboardVideoModal.nodes.filter(n => activeNodeIds.includes(n.id))
      : storyboardVideoModal.nodes;

    // Calculate layout bounds of the ENTIRE storyboard to position videos to the RIGHT
    // Use all storyboard nodes to properly calculate the bounding box
    const allStoryboardNodes = storyboardVideoModal.nodes;

    // Assume a default width if not present (though images usually have it)
    const DEFAULT_WIDTH = 400;

    // Find the rightmost edge of the entire group
    const groupMaxX = Math.max(...allStoryboardNodes.map(n => n.x + ((n as any).width || DEFAULT_WIDTH)));

    // Calculate the left edge of the group to maintain relative offsets
    const groupMinX = Math.min(...allStoryboardNodes.map(n => n.x));

    // Shift Amount: Move everything to the right of the group with a gap
    const GAP_X = 100;
    const xOffset = groupMaxX + GAP_X - groupMinX;

    sourceNodes.forEach((sourceNode) => {
      // Create a new Video node for each image
      const newNodeId = crypto.randomUUID();
      const PROMPT = prompts[sourceNode.id] || sourceNode.prompt || 'Animated video';

      const newVideoNode: NodeData = {
        id: newNodeId,
        type: NodeType.VIDEO,
        // Clone the layout pattern but shifted to the right
        x: sourceNode.x + xOffset,
        y: sourceNode.y,
        prompt: PROMPT,
        status: NodeStatus.IDLE, // Will switch to LOADING when generated
        model: settings.model,
        videoModel: settings.model, // Explicitly set video model
        videoDuration: settings.duration,
        aspectRatio: sourceNode.aspectRatio || '16:9',
        resolution: settings.resolution,
        parentIds: [sourceNode.id], // Connect to source image
        // groupId: undefined, // Explicitly NOT in the group
        videoMode: 'frame-to-frame', // Important for image-to-video
        inputUrl: sourceNode.resultUrl, // Pass image as input
      };

      newNodes.push(newVideoNode);
    });

    // added new nodes to state
    setNodes(prev => [...prev, ...newNodes]);

    // Auto-trigger generation (staggered)
    setTimeout(() => {
      newNodes.forEach((node, index) => {
        setTimeout(() => {
          handleGenerateRef.current(node.id);
        }, index * 1000); // 1s delay between each to avoid rate limits
      });
    }, 500);

  }, [storyboardVideoModal.nodes, setNodes]);

  // Twitter Post Modal State
  const [twitterModal, setTwitterModal] = useState<{
    isOpen: boolean;
    mediaUrl: string | null;
    mediaType: 'image' | 'video';
  }>({ isOpen: false, mediaUrl: null, mediaType: 'image' });

  const handlePostToX = React.useCallback((nodeId: string, mediaUrl: string, mediaType: 'image' | 'video') => {
    console.log('[Twitter] Opening post modal for:', nodeId, mediaUrl, mediaType);
    setTwitterModal({
      isOpen: true,
      mediaUrl,
      mediaType
    });
  }, []);

  // TikTok Post Modal State
  const [tiktokModal, setTiktokModal] = useState<{
    isOpen: boolean;
    mediaUrl: string | null;
  }>({ isOpen: false, mediaUrl: null });

  const handlePostToTikTok = React.useCallback((nodeId: string, mediaUrl: string) => {
    console.log('[TikTok] Opening post modal for:', nodeId, mediaUrl);
    setTiktokModal({
      isOpen: true,
      mediaUrl
    });
  }, []);

  const isModalBlockingSpacePan =
    isCreateAssetModalOpen ||
    isTikTokModalOpen ||
    storyboardGenerator.isModalOpen ||
    storyboardVideoModal.isOpen ||
    twitterModal.isOpen ||
    tiktokModal.isOpen ||
    editorModal.isOpen ||
    videoEditorModal.isOpen ||
    Boolean(expandedImageUrl);

  const endTemporarySpacePan = React.useCallback(() => {
    setIsSpacePanMode(false);
    setIsSpacePanning(false);
    endPanning();
  }, [endPanning]);

  React.useEffect(() => {
    const isSpaceKey = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isSpacePanMode || isSpacePanning)) {
        endTemporarySpacePan();
        return;
      }

      if (!isSpaceKey(e)) return;

      if (isSpacePanMode || isSpacePanning) {
        e.preventDefault();
        return;
      }

      if (e.repeat || isModalBlockingSpacePan) return;
      if (isEditableElement(e.target instanceof Element ? e.target : null)) return;
      if (isEditableElement(document.activeElement)) return;

      e.preventDefault();
      setIsSpacePanMode(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isSpaceKey(e)) return;

      if (isSpacePanMode || isSpacePanning) {
        e.preventDefault();
      }

      endTemporarySpacePan();
    };

    const handleWindowBlur = () => {
      endTemporarySpacePan();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    endTemporarySpacePan,
    isModalBlockingSpacePan,
    isSpacePanMode,
    isSpacePanning
  ]);

  React.useEffect(() => {
    if (isModalBlockingSpacePan && (isSpacePanMode || isSpacePanning)) {
      endTemporarySpacePan();
    }
  }, [
    endTemporarySpacePan,
    isModalBlockingSpacePan,
    isSpacePanMode,
    isSpacePanning
  ]);

  // Context menu handlers
  const {
    handleDoubleClick,
    handleGlobalContextMenu,
    handleAddNext,
    handleNodeContextMenu,
    handleContextMenuCreateAsset,
    handleContextMenuSelect,
    handleToolbarAdd
  } = useContextMenuHandlers({
    nodes,
    viewport,
    contextMenu,
    setContextMenu,
    handleOpenCreateAsset,
    handleSelectTypeFromMenu
  });

  // Wrapper functions that pass closeWorkflowPanel to panel handlers
  const handleHistoryClick = (e: React.MouseEvent) => {
    panelHistoryClick(e, closeWorkflowPanel);
  };

  const handleAssetsClick = (e: React.MouseEvent) => {
    panelAssetsClick(e, closeWorkflowPanel);
  };

  const handleContextMenuAddAssets = () => {
    openAssetLibraryModal(contextMenu.y, closeWorkflowPanel);
  };

  /**
   * Convert pixel dimensions to closest standard aspect ratio
   */
  const getClosestAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    const standardRatios = [
      { label: '1:1', value: 1 },
      { label: '16:9', value: 16 / 9 },
      { label: '9:16', value: 9 / 16 },
      { label: '4:3', value: 4 / 3 },
      { label: '3:4', value: 3 / 4 },
      { label: '3:2', value: 3 / 2 },
      { label: '2:3', value: 2 / 3 },
      { label: '5:4', value: 5 / 4 },
      { label: '4:5', value: 4 / 5 },
      { label: '21:9', value: 21 / 9 }
    ];

    let closest = standardRatios[0];
    let minDiff = Math.abs(ratio - closest.value);

    for (const r of standardRatios) {
      const diff = Math.abs(ratio - r.value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }

    return closest.label;
  };

  /**
   * Convert pixel dimensions to closest video aspect ratio (only 16:9 or 9:16)
   */
  const getClosestVideoAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    // Video models only support 16:9 (1.78) and 9:16 (0.56)
    // If wider than 1:1 (ratio > 1), use 16:9; otherwise use 9:16
    return ratio >= 1 ? '16:9' : '9:16';
  };

  const hasFileDrag = (dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    return Array.from(dataTransfer.items || []).some(item => item.kind === 'file');
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const detectImageAspect = (url: string): Promise<{ resultAspectRatio?: string; aspectRatio: string }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          resultAspectRatio: `${img.naturalWidth}/${img.naturalHeight}`,
          aspectRatio: getClosestAspectRatio(img.naturalWidth, img.naturalHeight)
        });
      };
      img.onerror = () => resolve({ aspectRatio: '1:1' });
      img.src = url;
    });
  };

  const handleCanvasDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e.dataTransfer)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    const imageFiles = files
      .filter(file => file.type.startsWith('image/'))
      .slice(0, 6);

    if (imageFiles.length === 0) return;

    const dropX = (e.clientX - viewport.x) / viewport.zoom;
    const dropY = (e.clientY - viewport.y) / viewport.zoom;
    const maxFileSize = 100 * 1024 * 1024;

    for (let index = 0; index < imageFiles.length; index++) {
      const file = imageFiles[index];

      if (file.size > maxFileSize) {
        console.warn(`[CanvasDrop] Skipping ${file.name}: file exceeds 100MB limit.`);
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const resultUrl = await uploadAsset(dataUrl, 'image', file.name);
        const { resultAspectRatio, aspectRatio } = await detectImageAspect(resultUrl);
        const offset = index * 32;

        const newNode: NodeData = {
          id: crypto.randomUUID(),
          type: NodeType.IMAGE,
          x: dropX - 170 + offset,
          y: dropY - 150 + offset,
          prompt: file.name,
          status: NodeStatus.SUCCESS,
          resultUrl,
          resultAspectRatio,
          model: 'Upload',
          imageModel: T8_GPT_IMAGE_2_MODEL_ID,
          aspectRatio,
          resolution: 'Auto'
        };

        setNodes(prev => [...prev, newNode]);
      } catch (error) {
        console.error(`[CanvasDrop] Failed to import ${file.name}:`, error);
      }
    }
  };

  /**
   * Handle selecting an asset from history - creates new node with the image/video
   */
  const handleSelectAsset = (type: 'images' | 'videos', url: string, prompt: string, model?: string) => {
    // Calculate position at center of canvas
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom - 170;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom - 150;

    // Create node with detected aspect ratio
    const createNode = (resultAspectRatio?: string, aspectRatio?: string) => {
      const isVideo = type === 'videos';
      // Use the original model from asset metadata, or fall back to defaults
      const defaultModel = isVideo ? 'video-disabled' : T8_GPT_IMAGE_2_MODEL_ID;
      const nodeModel = model || defaultModel;

      const newNode: NodeData = {
        id: Date.now().toString(),
        type: isVideo ? NodeType.VIDEO : NodeType.IMAGE,
        x: centerX,
        y: centerY,
        prompt: prompt,
        status: NodeStatus.SUCCESS,
        resultUrl: url,
        resultAspectRatio,
        model: nodeModel,
        videoModel: isVideo ? nodeModel : undefined,
        imageModel: !isVideo ? nodeModel : undefined,
        aspectRatio: aspectRatio || '16:9',
        resolution: isVideo ? 'Auto' : '1K'
      };

      setNodes(prev => [...prev, newNode]);
      closeHistoryPanel();
      closeAssetLibrary();
    };

    if (type === 'images') {
      // Detect image dimensions
      const img = new Image();
      img.onload = () => {
        const resultAspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
        const aspectRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
        console.log(`[App] Image loaded: ${img.naturalWidth}x${img.naturalHeight} -> ${aspectRatio}`);
        createNode(resultAspectRatio, aspectRatio);
      };
      img.onerror = () => {
        console.log('[App] Image load error, using default 16:9');
        createNode(undefined, '16:9');
      };
      img.src = url;
    } else {
      // Detect video dimensions
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        const resultAspectRatio = `${video.videoWidth}/${video.videoHeight}`;
        // Use video-specific function that only returns 16:9 or 9:16
        const aspectRatio = getClosestVideoAspectRatio(video.videoWidth, video.videoHeight);
        console.log(`[App] Video loaded: ${video.videoWidth}x${video.videoHeight} -> ${aspectRatio}`);
        createNode(resultAspectRatio, aspectRatio);
      };
      video.onerror = () => {
        console.log('[App] Video load error, using default 16:9');
        createNode(undefined, '16:9');
      };
      video.src = url;
    }
  };

  const handleLibrarySelect = (url: string, type: 'image' | 'video') => {
    handleSelectAsset(type === 'image' ? 'images' : 'videos', url, 'Asset Library Item');
    closeAssetLibrary();
  };

  // Create asset modal (isCreateAssetModalOpen, handleOpenCreateAsset, handleSaveAssetToLibrary) provided by useAssetHandlers hook

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Prevent browser zoom and route Ctrl/Cmd + wheel to the canvas zoom logic.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (isModalBlockingSpacePan) return;
      if (isEditableElement(e.target instanceof Element ? e.target : null)) return;

      handleZoomWheel(e, canvasHoveredNode);
      e.stopPropagation();
    };

    const listenerOptions = { passive: false, capture: true } as const;
    canvas.addEventListener('wheel', handleNativeWheel, listenerOptions);
    return () => canvas.removeEventListener('wheel', handleNativeWheel, listenerOptions);
  }, [canvasRef, canvasHoveredNode, handleZoomWheel, isModalBlockingSpacePan]);

  // Keyboard shortcuts (handleCopy, handlePaste, handleDuplicate) provided by useKeyboardShortcuts hook

  // Cleanup invalid groups (groups with less than 2 nodes)
  useEffect(() => {
    cleanupInvalidGroups(nodes, setNodes);
  }, [nodes, cleanupInvalidGroups]);

  // Track state changes for undo/redo (only after drag ends, not during)
  const isApplyingHistory = React.useRef(false);

  useEffect(() => {
    // Don't push to history if we're currently applying history (undo/redo)
    if (isApplyingHistory.current) {
      isApplyingHistory.current = false;
      return;
    }

    // Don't push to history while dragging (wait until drag ends)
    if (isDragging) {
      return;
    }

    // Push to history when nodes or groups change
    pushHistory({ nodes, groups });
  }, [nodes, groups, isDragging]);

  // Apply history state when undo/redo is triggered
  // IMPORTANT: Don't revert nodes if any node is in LOADING status (generation in progress)
  useEffect(() => {
    // Skip if any node is currently generating - don't interrupt the loading state
    const hasLoadingNode = nodes.some(n => n.status === NodeStatus.LOADING);
    if (hasLoadingNode) {
      return;
    }

    if (historyState.nodes !== nodes || historyState.groups !== groups) {
      isApplyingHistory.current = true;
      if (historyState.nodes !== nodes) {
        setNodes(historyState.nodes);
      }
      if (historyState.groups !== groups) {
        setGroups(historyState.groups);
      }
    }
    // Only react to history pointer changes. Including live nodes/groups here
    // re-applies the old history snapshot after every drag update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyState]);

  // Simple wrapper for updateNode (sync code removed - TEXT node prompts are combined at generation time)
  const updateNodeWithSync = React.useCallback((id: string, updates: Partial<NodeData>) => {
    updateNode(id, updates);
  }, [updateNode]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const startTemporaryPanFromPointer = (e: React.PointerEvent, shouldStopPropagation = false) => {
    if (!isSpacePanMode || e.button !== 0) return false;
    if (isEditableElement(e.target instanceof Element ? e.target : null)) return false;

    e.preventDefault();
    if (shouldStopPropagation) {
      e.stopPropagation();
    }

    startPanning(e);
    setIsSpacePanning(true);
    setSelectedConnection(null);
    setContextMenu(prev => ({ ...prev, isOpen: false }));

    return true;
  };

  const captureCanvasPointer = (e: React.PointerEvent) => {
    if (!(e.currentTarget instanceof HTMLElement)) return;

    try {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    } catch {
      // Pointer capture can fail for synthetic or already-released pointers.
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const ignoreReason = getCanvasSurfaceEventIgnoreReason(e);
    if (ignoreReason) {
      debugCanvasSurfaceEventIgnored('pointerdown', e, ignoreReason);
      return;
    }

    if (startTemporaryPanFromPointer(e)) {
      return;
    }

    setSelectedConnection(null);
    setContextMenu(prev => ({ ...prev, isOpen: false }));
    closeWorkflowPanel();
    closeHistoryPanel();
    closeAssetLibrary();

    // Shift + left-drag keeps marquee selection available; plain blank drag pans.
    if (e.button === 0 && e.shiftKey) {
      startSelection(e);
      clearSelection();
      return;
    }

    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      captureCanvasPointer(e);
      startPanning(e);
    }
  };

  const handleGlobalPointerMove = (e: React.PointerEvent) => {
    // 1. Space-hand pan takes priority over selection, node drag, and connection drag.
    if (isSpacePanning && updatePanning(e, setViewport)) return;

    // 1. Handle Selection Box Update
    if (updateSelection(e)) return;

    // 2. Handle Node Dragging
    if (updateNodeDrag(e, viewport, setNodes, selectedNodeIds)) return;

    // 3. Handle Connection Dragging
    if (updateConnectionDrag(e, nodes, viewport)) return;

    // 4. Handle Canvas Panning (disabled when selection box is active)
    if (!isSelecting) {
      updatePanning(e, setViewport);
    }
  };

  /**
   * Handle when a connection is made between nodes
   * Syncs prompt if parent is a Text node
   */
  const handleConnectionMade = React.useCallback((parentId: string, childId: string) => {
    // Find the parent node
    const parentNode = nodesById.get(parentId);
    if (!parentNode) return;

    // If parent is a Text node, sync its prompt to the child
    if (parentNode.type === NodeType.TEXT && parentNode.prompt) {
      updateNode(childId, { prompt: parentNode.prompt });
    }
  }, [nodesById, updateNode]);

  const handleDisconnectConnection = React.useCallback((parentId: string, childId: string) => {
    setNodes(prev =>
      prev.map(node =>
        node.id === childId
          ? {
              ...node,
              parentIds: (node.parentIds || []).filter(id => id !== parentId)
            }
          : node
      )
    );

    setSelectedConnection(null);
  }, [setNodes]);

  const handleGlobalPointerUp = (e: React.PointerEvent) => {
    // 1. End Space-hand panning before selection or connection completion.
    if (isSpacePanning) {
      endPanning();
      setIsSpacePanning(false);
      releasePointerCapture(e);
      return;
    }

    // 1. Handle Selection Box End
    if (isSelecting) {
      const selectedIds = endSelection(nodes, viewport);
      setSelectedNodeIds(selectedIds);
      releasePointerCapture(e);
      return;
    }

    // 2. Handle Connection Drop
    if (completeConnectionDrag(handleAddNext, setNodes, nodes, handleConnectionMade)) {
      releasePointerCapture(e);
      return;
    }

    // 3. Stop Panning
    endPanning();

    // 4. Stop Node Dragging
    endNodeDrag();

    // 5. Release capture
    releasePointerCapture(e);
  };

  const canvasCursorClass = isSpacePanning
    ? 'cursor-grabbing'
    : isSpacePanMode
      ? 'cursor-grab'
      : 'cursor-grab active:cursor-grabbing';
  const isViewportInteracting = isPanning || isWheelInteracting;
  const disableConnectionSensors = isDragging || isPanning || isDraggingConnection || isWheelInteracting;
  const selectedNodeIdsRef = React.useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  const isViewportInteractingRef = React.useRef(isViewportInteracting);
  isViewportInteractingRef.current = isViewportInteracting;

  const stableStartTemporaryPanFromPointer = useStableCallback(startTemporaryPanFromPointer);
  const stableHandleNodePointerDownBase = useStableCallback(handleNodePointerDown);
  const stableUpdateNodeWithSync = useStableCallback(updateNodeWithSync);
  const stableHandleGenerate = useStableCallback(handleGenerate);
  const stableHandleAddNext = useStableCallback(handleAddNext);
  const stableHandleNodeContextMenu = useStableCallback(handleNodeContextMenu);
  const stableHandleConnectorPointerDown = useStableCallback(handleConnectorPointerDown);
  const stableHandleEdgeClick = useStableCallback(handleEdgeClick);
  const stableHandleDisconnectConnection = useStableCallback(handleDisconnectConnection);
  const stableHandleOpenEditor = useStableCallback(handleOpenEditor);
  const stableHandleUpload = useStableCallback(handleUpload);
  const stableHandleExpandImage = useStableCallback(handleExpandImage);
  const stableHandleNodeDragStart = useStableCallback(handleNodeDragStart);
  const stableHandleNodeDragEnd = useStableCallback(handleNodeDragEnd);
  const stableHandleWriteContent = useStableCallback(handleWriteContent);
  const stableHandleTextToVideo = useStableCallback(handleTextToVideo);
  const stableHandleTextToImage = useStableCallback(handleTextToImage);
  const stableHandleImageToImage = useStableCallback(handleImageToImage);
  const stableHandleImageToVideo = useStableCallback(handleImageToVideo);
  const stableHandleImageToEditor = useStableCallback(handleImageToEditor);
  const stableHandleRemoveBackground = useStableCallback(handleRemoveBackground);
  const stableHandleChangeAngleGenerate = useStableCallback(handleChangeAngleGenerate);
  const stableHandlePostToX = useStableCallback(handlePostToX);
  const stableHandlePostToTikTok = useStableCallback(handlePostToTikTok);
  const handleCanvasNodeSelect = React.useCallback((id: string) => {
    setSelectedNodeIds([id]);
  }, [setSelectedNodeIds]);
  const handleCanvasNodePointerDown = React.useCallback((e: React.PointerEvent, nodeId: string) => {
    if (stableStartTemporaryPanFromPointer(e, true)) {
      return;
    }

    const currentSelectedNodeIds = selectedNodeIdsRef.current;

    if (e.shiftKey) {
      if (currentSelectedNodeIds.includes(nodeId)) {
        stableHandleNodePointerDownBase(e, nodeId, undefined);
      } else {
        setSelectedNodeIds(prev => [...prev, nodeId]);
        stableHandleNodePointerDownBase(e, nodeId, undefined);
      }
    } else {
      setSelectedNodeIds([nodeId]);
      stableHandleNodePointerDownBase(e, nodeId, undefined);
    }
  }, [
    setSelectedNodeIds,
    stableHandleNodePointerDownBase,
    stableStartTemporaryPanFromPointer
  ]);
  const handleCanvasNodeMouseEnter = React.useCallback((nodeId: string) => {
    if (!isViewportInteractingRef.current) {
      setCanvasHoveredNodeId(nodeId);
    }
  }, []);
  const handleCanvasNodeMouseLeave = React.useCallback(() => {
    setCanvasHoveredNodeId(null);
  }, []);

  React.useEffect(() => {
    if (isViewportInteracting) {
      setCanvasHoveredNodeId(null);
    }
  }, [isViewportInteracting]);

  // Context menu handlers provided by useContextMenuHandlers hook
  // handleDoubleClick, handleGlobalContextMenu, handleAddNext, handleNodeContextMenu,
  // handleContextMenuCreateAsset, handleContextMenuSelect, handleToolbarAdd
  const showZoomControl = false;

  return (
    <div
      data-theme={canvasTheme}
      data-viewport-interacting={isViewportInteracting ? 'true' : undefined}
      className={`w-screen h-screen ${canvasTheme === 'dark' ? 'bg-[#030303] text-white' : 'bg-neutral-50 text-neutral-900'} overflow-hidden select-none font-sans transition-colors duration-300`}
    >
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <Toolbar
          onAddClick={handleToolbarAdd}
          onWorkflowsClick={handleWorkflowsClick}
          onHistoryClick={handleHistoryClick}
          onAssetsClick={handleAssetsClick}
          onTikTokClick={openTikTokModal}
          onStoryboardClick={storyboardGenerator.openModal}
          onToolsOpen={() => {
            closeWorkflowPanel();
            closeHistoryPanel();
            closeAssetLibrary();
          }}
          canvasTheme={canvasTheme}
          language={language}
        />
      )}

      {/* Workflow Panel */}
      <WorkflowPanel
        isOpen={isWorkflowPanelOpen}
        onClose={closeWorkflowPanel}
        onLoadWorkflow={handleLoadWithTracking}
        currentWorkflowId={workflowId || undefined}
        panelY={workflowPanelY}
        canvasTheme={canvasTheme}
        language={language}
      />

      {/* History Panel */}
      <HistoryPanel
        isOpen={isHistoryPanelOpen}
        onClose={closeHistoryPanel}
        onSelectAsset={handleSelectAsset}
        panelY={historyPanelY}
        canvasTheme={canvasTheme}
        language={language}
      />

      <AssetLibraryPanel
        isOpen={isAssetLibraryOpen}
        onClose={closeAssetLibrary}
        onSelectAsset={handleLibrarySelect}
        panelY={assetLibraryY}
        variant={assetLibraryVariant}
        canvasTheme={canvasTheme}
        language={language}
      />

      <CreateAssetModal
        isOpen={isCreateAssetModalOpen}
        onClose={() => setIsCreateAssetModalOpen(false)}
        nodeToSnapshot={nodeToSnapshot}
        onSave={handleSaveAssetToLibrary}
        language={language}
        canvasTheme={canvasTheme}
      />

      {/* TikTok Import Modal */}
      <TikTokImportModal
        isOpen={isTikTokModalOpen}
        onClose={closeTikTokModal}
        onVideoImported={handleTikTokVideoImported}
        language={language}
        canvasTheme={canvasTheme}
      />

      {/* Twitter Post Modal */}
      <TwitterPostModal
        isOpen={twitterModal.isOpen}
        onClose={() => setTwitterModal(prev => ({ ...prev, isOpen: false }))}
        mediaUrl={twitterModal.mediaUrl}
        mediaType={twitterModal.mediaType}
      />

      {/* TikTok Post Modal */}
      <TikTokPostModal
        isOpen={tiktokModal.isOpen}
        onClose={() => setTiktokModal(prev => ({ ...prev, isOpen: false }))}
        mediaUrl={tiktokModal.mediaUrl}
      />

      {/* Storyboard Generator Modal */}
      <StoryboardGeneratorModal
        isOpen={storyboardGenerator.isModalOpen}
        onClose={storyboardGenerator.closeModal}
        state={storyboardGenerator.state}
        onSetStep={storyboardGenerator.setStep}
        onToggleCharacter={storyboardGenerator.toggleCharacter}
        onSetSceneCount={storyboardGenerator.setSceneCount}
        onSetStory={storyboardGenerator.setStory}
        onUpdateScript={storyboardGenerator.updateScript}
        onGenerateScripts={storyboardGenerator.generateScripts}
        onBrainstormStory={storyboardGenerator.brainstormStory}
        onOptimizeStory={storyboardGenerator.optimizeStory}
        onGenerateComposite={storyboardGenerator.generateComposite}
        onRegenerateComposite={storyboardGenerator.regenerateComposite}
        onCreateNodes={storyboardGenerator.createStoryboardNodes}
        language={language}
        canvasTheme={canvasTheme}
      />

      {/* Agent Chat */}
      <ChatBubble
        onClick={toggleChat}
        isOpen={isChatOpen && !storyboardGenerator.isModalOpen && !isTikTokModalOpen}
        language={language}
      />
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <ChatPanel
          isOpen={isChatOpen}
          onClose={closeChat}
          isDraggingNode={isDraggingNodeToChat}
          canvasTheme={canvasTheme}
          language={language}
          getCanvasContext={getAgentCanvasContext}
          onHermesRunReceived={createHermesProjectNodeFromRun}
        />
      )}

      {/* Top Bar */}
      {/* Top Bar */}
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <TopBar
          canvasTitle={canvasTitle}
          isEditingTitle={isEditingTitle}
          editingTitleValue={editingTitleValue}
          canvasTitleInputRef={canvasTitleInputRef}
          setCanvasTitle={setCanvasTitle}
          setIsEditingTitle={setIsEditingTitle}
          setEditingTitleValue={setEditingTitleValue}
          onSave={handleSaveWithTracking}
          onNew={handleNewCanvas}
          hasUnsavedChanges={hasUnsavedChanges}
          isChatOpen={isChatOpen}
          canvasTheme={canvasTheme}
          onToggleTheme={() => setCanvasTheme(prev => prev === 'dark' ? 'light' : 'dark')}
          language={language}
          onToggleLanguage={toggleLanguage}
          lastAutoSaveTime={lastAutoSaveTime}
          currentUser={currentUser}
          onLogout={onLogout}
        />
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        id="canvas-background"
        className={`absolute inset-0 ${canvasCursorClass}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handleGlobalPointerMove}
        onPointerUp={handleGlobalPointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleGlobalContextMenu}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        <div
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {/* Background Grid */}
          <div
            className="absolute -top-[10000px] -left-[10000px] w-[20000px] h-[20000px]"
            style={{
              backgroundImage: canvasTheme === 'dark'
                ? 'radial-gradient(rgba(217, 255, 0, 0.9) 1px, transparent 1px)'
                : 'radial-gradient(#ccc 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              opacity: canvasTheme === 'dark' ? 0.28 : 0.8
            }}
          />

          {/* SVG Layer for Connections */}
          <svg
            className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-0"
            style={{ pointerEvents: 'none' }}
          >
            <ConnectionsLayer
              nodes={nodes}
              viewport={viewport}
              canvasTheme={canvasTheme}
              isDraggingConnection={isDraggingConnection}
              disableInteractiveSensors={disableConnectionSensors}
              connectionStart={connectionStart}
              tempConnectionEnd={tempConnectionEnd}
              selectedConnection={selectedConnection}
              onEdgeClick={stableHandleEdgeClick}
              onDisconnectConnection={stableHandleDisconnectConnection}
            />
          </svg>

          {/* Nodes Layer */}
          <div className="pointer-events-auto">
            {nodes.map(node => {
              const nodeMeta = nodeRenderMetaById.get(node.id);
              if (!nodeMeta) return null;

              return (
                <CanvasNode
                  key={node.id}
                  data={node}
                  inputUrl={nodeMeta.inputUrl}
                  connectedImageNodes={nodeMeta.connectedImageNodes}
                  onUpdate={stableUpdateNodeWithSync}
                  onGenerate={stableHandleGenerate}
                  onAddNext={stableHandleAddNext}
                  selected={nodeMeta.selected}
                  showControls={nodeMeta.showControls}
                  onNodePointerDown={handleCanvasNodePointerDown}
                  onContextMenu={stableHandleNodeContextMenu}
                  onSelect={handleCanvasNodeSelect}
                  onConnectorDown={stableHandleConnectorPointerDown}
                  isHoveredForConnection={connectionHoveredNodeId === node.id}
                  onOpenEditor={stableHandleOpenEditor}
                  onUpload={stableHandleUpload}
                  onExpand={stableHandleExpandImage}
                  onDragStart={stableHandleNodeDragStart}
                  onDragEnd={stableHandleNodeDragEnd}
                  onWriteContent={stableHandleWriteContent}
                  onTextToVideo={stableHandleTextToVideo}
                  onTextToImage={stableHandleTextToImage}
                  onImageToImage={stableHandleImageToImage}
                  onImageToVideo={stableHandleImageToVideo}
                  onImageToEditor={stableHandleImageToEditor}
                  onRemoveBackground={stableHandleRemoveBackground}
                  onChangeAngleGenerate={stableHandleChangeAngleGenerate}
                  zoom={viewport.zoom}
                  suppressHoverInteractions={isViewportInteracting}
                  onMouseEnter={handleCanvasNodeMouseEnter}
                  onMouseLeave={handleCanvasNodeMouseLeave}
                  canvasTheme={canvasTheme}
                  language={language}
                  onPostToX={stableHandlePostToX}
                  onPostToTikTok={stableHandlePostToTikTok}
                />
              );
            })}
          </div>



          {/* Selection Bounding Box - for selected nodes (2 or more) */}
          {selectedNodeIds.length > 1 && !selectionBox.isActive && (
            <SelectionBoundingBox
              selectedNodes={nodes.filter(n => selectedNodeIds.includes(n.id))}
              group={getCommonGroup(selectedNodeIds)}
              viewport={viewport}
              language={language}
              canvasTheme={canvasTheme}
              onGroup={() => groupNodes(selectedNodeIds, setNodes, t(language, 'newGroup'))}
              onUngroup={() => {
                const group = getCommonGroup(selectedNodeIds);
                if (group) ungroupNodes(group.id, setNodes);
              }}
              onBoundingBoxPointerDown={(e) => {
                // Start dragging all selected nodes when clicking on bounding box
                if (startTemporaryPanFromPointer(e, true)) {
                  return;
                }

                e.stopPropagation();
                if (selectedNodeIds.length > 0) {
                  handleNodePointerDown(e, selectedNodeIds[0], undefined);
                }
              }}
              onRenameGroup={renameGroup}
              onSortNodes={(direction) => {
                const group = getCommonGroup(selectedNodeIds);
                if (group) sortGroupNodes(group.id, direction, nodes, setNodes);
              }}
              onEditStoryboard={handleEditStoryboard}
            />
          )}

          {/* Group Bounding Boxes - for all groups (even when not selected) */}
          {groups.map(group => {
            const groupNodes = nodes.filter(n => n.groupId === group.id);

            // Don't render if group has less than 2 nodes
            if (groupNodes.length < 2) return null;

            const isSelected = groupNodes.every(n => selectedNodeIds.includes(n.id)) && groupNodes.length > 0;

            // Don't render if this group is already shown above (when selected)
            if (isSelected) return null;

            return (
              <SelectionBoundingBox
                key={group.id}
                selectedNodes={groupNodes}
                group={group}
                viewport={viewport}
                language={language}
                onGroup={() => { }} // Already grouped
                onUngroup={() => ungroupNodes(group.id, setNodes)}
                onBoundingBoxPointerDown={(e) => {
                  // Select all nodes in this group and start dragging
                  if (startTemporaryPanFromPointer(e, true)) {
                    return;
                  }

                  e.stopPropagation();
                  const nodeIds = groupNodes.map(n => n.id);
                  setSelectedNodeIds(nodeIds);
                  if (nodeIds.length > 0) {
                    handleNodePointerDown(e, nodeIds[0], undefined);
                  }
                }}
                onRenameGroup={renameGroup}
                onSortNodes={(direction) => sortGroupNodes(group.id, direction, nodes, setNodes)}
                onCreateVideo={() => {
                  // Pass group nodes directly to avoid selection state race conditions
                  const groupNodeIds = nodes.filter(n => n.groupId === group.id).map(n => n.id);
                  handleCreateStoryboardVideo(groupNodeIds);
                }}
                onEditStoryboard={handleEditStoryboard}
              />
            );
          })}
        </div>
      </div >

      {/* Selection Box Overlay - Outside transformed canvas for screen-space coordinates */}
      {selectionBox.isActive && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.abs(selectionBox.endX - selectionBox.startX),
            height: Math.abs(selectionBox.endY - selectionBox.startY),
            border: `2px solid ${canvasTheme === 'dark' ? '#D8FF00' : '#84cc16'}`,
            backgroundColor: canvasTheme === 'dark' ? 'rgba(216, 255, 0, 0.1)' : 'rgba(132, 204, 22, 0.1)',
            zIndex: 1000
          }}
        />
      )}

      {/* Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        onSelectType={handleContextMenuSelect}
        onUpload={handleContextUpload}
        onUndo={undo}
        onRedo={redo}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onDuplicate={handleDuplicate}
        onCreateAsset={handleContextMenuCreateAsset}
        onAddAssets={handleContextMenuAddAssets}
        canUndo={canUndo}
        canRedo={canRedo}
        canvasTheme={canvasTheme}
        language={language}
      />

      {/* Zoom Slider */}
      {/* Zoom Slider */}
      {showZoomControl && !storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <div className={`fixed bottom-6 left-16 rounded-full px-4 py-2 flex items-center gap-3 z-50 transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-base)] ${canvasTheme === 'dark' ? 'bg-[var(--myml-surface-floating)] border border-[var(--myml-border-active)] shadow-[var(--myml-shadow-floating)]' : 'bg-white/90 backdrop-blur-sm border border-neutral-200'}`} >
          <span className={`text-xs font-semibold uppercase ${canvasTheme === 'dark' ? 'text-[var(--myml-accent)]' : 'text-neutral-500'}`}>{t(language, 'zoom')}</span>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={viewport.zoom}
            onChange={handleSliderZoom}
            className={`w-36 ${canvasTheme === 'dark' ? 'accent-[#D8FF00]' : 'accent-lime-600'}`}
          />
          <span className={`text-xs font-bold w-10 ${canvasTheme === 'dark' ? 'text-[#D8FF00]' : 'text-neutral-600'}`}>{Math.round(viewport.zoom * 100)}%</span>
        </div>
      )}

      <ImageEditorModal
        isOpen={editorModal.isOpen}
        nodeId={editorModal.nodeId || ''}
        imageUrl={editorModal.imageUrl}
        initialPrompt={editorNode?.prompt}
        initialModel={editorNode?.imageModel || T8_GPT_IMAGE_2_EDIT_MODEL_ID}
        initialAspectRatio={editorNode?.aspectRatio || 'Auto'}
        initialResolution={editorNode?.resolution || '1K'}
        initialQuality={normalizeImageQuality(editorNode?.quality)}
        initialElements={editorNode?.editorElements as any}
        initialCanvasData={editorNode?.editorCanvasData}
        initialCanvasSize={editorNode?.editorCanvasSize}
        initialBackgroundUrl={editorNode?.editorBackgroundUrl}
        onClose={handleCloseImageEditorWithAbort}
        onGenerate={async (sourceId, prompt, count, options) => {
          imageEditorGenerationAbortRef.current?.abort();
          const generationAbortController = new AbortController();
          imageEditorGenerationAbortRef.current = generationAbortController;

          const sourceNode = nodesById.get(sourceId);
          if (!sourceNode) {
            if (imageEditorGenerationAbortRef.current === generationAbortController) {
              imageEditorGenerationAbortRef.current = null;
            }
            return;
          }

          // Prefer modal-selected settings because node updates may still be batched.
          const imageModel = options?.imageModel || sourceNode.imageModel || T8_GPT_IMAGE_2_EDIT_MODEL_ID;
          const aspectRatio = options?.aspectRatio || sourceNode.aspectRatio || 'Auto';
          const resolution = options?.resolution || sourceNode.resolution || '1K';
          const quality = imageModelSupportsQuality(imageModel)
            ? normalizeImageQuality(options?.quality || sourceNode.quality)
            : undefined;

          const startX = sourceNode.x + 360; // Source width + gap
          const startY = sourceNode.y;
          const generationStartTime = Date.now();

          const newNodes: NodeData[] = [];

          const yStep = 500;
          const totalHeight = (count - 1) * yStep;
          const startYOffset = -totalHeight / 2;

          // Create N nodes with inherited settings
          for (let i = 0; i < count; i++) {
            newNodes.push({
              id: crypto.randomUUID(),
              type: NodeType.IMAGE,
              x: startX,
              y: startY + startYOffset + (i * yStep),
              prompt: prompt,
              status: NodeStatus.LOADING,
              generationStatus: 'queued',
              progress: 0,
              generationStartTime,
              errorMessage: undefined,
              model: 'Banana Pro',
              imageModel: imageModel,
              aspectRatio: aspectRatio,
              resolution: resolution,
              quality,
              parentIds: [sourceId]
            });
          }

          // Add new nodes and edges immediately
          // Note: State updates might be batched
          setNodes(prev => [...prev, ...newNodes]);
          setSelectedNodeIds(newNodes.map(node => node.id));
          if (newNodes.length > 0) {
            const firstNode = newNodes[0];
            setViewport(prev => ({
              ...prev,
              x: Math.round(window.innerWidth * 0.45 - (firstNode.x + 170) * prev.zoom),
              y: Math.round(window.innerHeight * 0.5 - (firstNode.y + 150) * prev.zoom)
            }));
          }

          // Prefer the editor's current composite image, then fall back to saved/current node image.
          const editorReferenceUrl =
            options?.compositeImageDataUrl ||
            sourceNode.resultUrl ||
            editorModal.imageUrl;

          let imageBase64: string | undefined = undefined;
          if (editorReferenceUrl) {
            imageBase64 = await urlToBase64(editorReferenceUrl);
          }

          const generationPromises = newNodes.map(async (node) => {
            try {
              if (generationAbortController.signal.aborted) {
                throw new Error('Image task polling aborted');
              }

              const task = await createImageTask({
                nodeId: node.id,
                workflowId,
                prompt: node.prompt || '',
                imageModel,
                aspectRatio,
                resolution,
                quality,
                referenceImages: imageBase64 ? [imageBase64] : undefined
              });

              updateNode(node.id, {
                status: NodeStatus.LOADING,
                taskId: task.taskId,
                generationStatus: task.status,
                progress: 0,
                errorMessage: undefined
              });

              const completedTask = await waitForImageTaskCompletion(task.taskId, {
                signal: generationAbortController.signal,
                onTaskUpdate: (nextTask) => {
                  if (generationAbortController.signal.aborted) {
                    return;
                  }

                  if (nextTask.status === 'queued' || nextTask.status === 'running' || nextTask.status === 'polling') {
                    updateNode(node.id, {
                      status: NodeStatus.LOADING,
                      taskId: nextTask.taskId,
                      generationStatus: nextTask.status,
                      progress: nextTask.progress ?? 0,
                      errorMessage: undefined
                    });
                  }
                }
              });

              if (completedTask.status !== 'completed' || !completedTask.resultUrl) {
                throw new Error(completedTask.errorMessage || `Image editor task ended with status: ${completedTask.status}`);
              }

              updateNode(node.id, {
                status: NodeStatus.SUCCESS,
                resultUrl: completedTask.resultUrl,
                taskId: undefined,
                generationStatus: undefined,
                progress: undefined,
                errorMessage: undefined
              });
            } catch (error: any) {
              if (generationAbortController.signal.aborted || error?.message === 'Image task polling aborted') {
                updateNode(node.id, {
                  status: NodeStatus.IDLE,
                  taskId: undefined,
                  generationStatus: undefined,
                  progress: undefined,
                  errorMessage: undefined
                });
                return;
              }

              updateNode(node.id, {
                status: NodeStatus.ERROR,
                taskId: undefined,
                generationStatus: 'failed',
                progress: undefined,
                errorMessage: error.message || 'Image editor generation failed'
              });
            }
          });
          void Promise.allSettled(generationPromises).then(() => {
            if (imageEditorGenerationAbortRef.current === generationAbortController) {
              imageEditorGenerationAbortRef.current = null;
            }
          });
          handleCloseImageEditor();
        }}
        canvasTheme={canvasTheme}
        language={language}
        onUpdate={updateNode}
      />

      {/* Storyboard Video Generation Modal */}
      <StoryboardVideoModal
        isOpen={storyboardVideoModal.isOpen}
        onClose={() => setStoryboardVideoModal(prev => ({ ...prev, isOpen: false }))}
        scenes={storyboardVideoModal.nodes}
        storyContext={storyboardVideoModal.storyContext}
        onCreateVideos={handleGenerateStoryVideos}
        language={language}
        canvasTheme={canvasTheme}
      />

      {/* Video Editor Modal */}
      <VideoEditorModal
        isOpen={videoEditorModal.isOpen}
        nodeId={videoEditorModal.nodeId}
        videoUrl={videoEditorModal.videoUrl}
        initialTrimStart={videoEditorNode?.trimStart}
        initialTrimEnd={videoEditorNode?.trimEnd}
        onClose={handleCloseVideoEditor}
        onExport={handleExportTrimmedVideo}
      />

      {/* Fullscreen Media Preview Modal */}
      <ExpandedMediaModal
        mediaUrl={expandedImageUrl}
        onClose={handleCloseExpand}
      />
    </div >
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const [path, setPath] = React.useState(() => window.location.pathname);

  React.useEffect(() => {
    const handleLocationChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  React.useEffect(() => {
    if (loading) return;

    if (!user && path !== '/login') {
      window.history.replaceState(null, '', '/login');
      setPath('/login');
    } else if (user && path === '/login') {
      window.history.replaceState(null, '', '/');
      setPath('/');
    }
  }, [loading, path, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#D8FF00] flex items-center justify-center text-xs font-black uppercase tracking-[0.16em]">
        Loading MYML Canvas
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <CanvasApp currentUser={user} onLogout={logout} />;
}
