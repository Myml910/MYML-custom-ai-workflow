import { NodeData, NodeGroup } from '../types';

const WORKFLOW_SIZE_WARNING_BYTES = 5 * 1024 * 1024;
const PROMPT_HASH_SAMPLE_LENGTH = 4096;

const isDevRuntime = () => Boolean(
    (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
);

const hashString = (value?: string | null) => {
    if (!value) return '';

    const sample = value.slice(0, PROMPT_HASH_SAMPLE_LENGTH);
    let hash = 5381;

    for (let i = 0; i < sample.length; i += 1) {
        hash = ((hash << 5) + hash) ^ sample.charCodeAt(i);
    }

    return `${value.length}:${(hash >>> 0).toString(36)}`;
};

const compactNodeForHistory = (node: NodeData) => ({
    id: node.id,
    type: node.type,
    title: node.title,
    x: Math.round(node.x),
    y: Math.round(node.y),
    status: node.status,
    prompt: hashString(node.prompt),
    parentIds: node.parentIds ?? [],
    groupId: node.groupId,
    model: node.model,
    imageModel: node.imageModel,
    aspectRatio: node.aspectRatio,
    resolution: node.resolution,
    videoMode: node.videoMode,
    videoModel: node.videoModel,
    videoDuration: node.videoDuration,
    trimStart: node.trimStart,
    trimEnd: node.trimEnd,
    angleMode: node.angleMode,
    angleSettings: node.angleSettings,
    hideGenerationControls: node.hideGenerationControls,
    isPromptExpanded: node.isPromptExpanded,
    editorElements: node.editorElements?.map(element => ({
        id: element.id,
        type: element.type,
        x: element.x,
        y: element.y,
        startX: element.startX,
        startY: element.startY,
        endX: element.endX,
        endY: element.endY,
        text: hashString(element.text),
        width: element.width,
        height: element.height
    })),
    editorCanvasSize: node.editorCanvasSize,
    localModelId: node.localModelId,
    localModelType: node.localModelType
});

const compactGroupForHistory = (group: NodeGroup) => ({
    id: group.id,
    nodeIds: group.nodeIds,
    label: group.label,
    storySceneCount: group.storyContext?.sceneCount,
    storyHash: hashString(group.storyContext?.story),
    scriptCount: group.storyContext?.scripts?.length ?? 0,
    characterCount: group.storyContext?.selectedCharacters?.length ?? 0
});

const isWorkflowHistoryState = (
    value: unknown
): value is { nodes?: NodeData[]; groups?: NodeGroup[] } => (
    Boolean(value) &&
    typeof value === 'object' &&
    (Array.isArray((value as { nodes?: unknown }).nodes) || Array.isArray((value as { groups?: unknown }).groups))
);

const summarizeUnknownValue = (value: unknown): unknown => {
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return hashString(value);
    }

    if (Array.isArray(value)) {
        return {
            type: 'array',
            length: value.length,
            items: value.slice(0, 20).map(item => summarizeUnknownValue(item))
        };
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([key]) => !/url|base64|canvasdata|payload|metadata|history/i.test(key))
            .slice(0, 40)
            .map(([key, entryValue]) => [key, summarizeUnknownValue(entryValue)]);

        return Object.fromEntries(entries);
    }

    return typeof value;
};

export const createWorkflowHistorySignature = (value: unknown): string => {
    if (isWorkflowHistoryState(value)) {
        return JSON.stringify({
            nodes: (value.nodes ?? []).map(compactNodeForHistory),
            groups: (value.groups ?? []).map(compactGroupForHistory)
        });
    }

    return JSON.stringify(summarizeUnknownValue(value));
};

export interface WorkflowPayloadDiagnosticsInput {
    title: string;
    nodes: NodeData[];
    groups: NodeGroup[];
}

export const warnIfLargeWorkflowPayload = (
    workflow: WorkflowPayloadDiagnosticsInput,
    serializedWorkflow: string
) => {
    if (!isDevRuntime()) return;
    if (serializedWorkflow.length < WORKFLOW_SIZE_WARNING_BYTES) return;

    const hasDataImage = serializedWorkflow.includes('data:image');
    const hasEditorCanvasData = workflow.nodes.some(node =>
        typeof node.editorCanvasData === 'string' && node.editorCanvasData.length > 0
    );

    console.warn('[Workflow] Large workflow payload', {
        title: workflow.title,
        sizeBytes: serializedWorkflow.length,
        sizeMB: Number((serializedWorkflow.length / (1024 * 1024)).toFixed(2)),
        nodeCount: workflow.nodes.length,
        groupCount: workflow.groups.length,
        hasDataImage,
        hasEditorCanvasData
    });
};
