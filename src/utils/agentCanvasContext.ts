import { NodeData, NodeGroup, Viewport } from '../types';

const NODE_LIMIT = 50;
const FOCUSED_NODE_LIMIT = 24;
const NO_SELECTION_NODE_LIMIT = 8;
const CONNECTION_LIMIT = 100;
const GROUP_LIMIT = 20;
const ACTIVE_TASK_LIMIT = 20;
const TITLE_LIMIT = 120;
const PROMPT_LIMIT = 500;
const ERROR_LIMIT = 300;

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'polling']);
const TERMINAL_ERROR_STATUSES = new Set(['failed', 'timeout', 'cancelled']);

export interface AgentCanvasNode {
    id: string;
    type: string;
    title?: string;
    x: number;
    y: number;
    status: string;
    prompt?: string;
    errorMessage?: string;
    parentIds?: string[];
    groupId?: string;
    model?: string;
    imageModel?: string;
    aspectRatio?: string;
    resolution?: string;
    taskId?: string;
    generationStatus?: string;
    progress?: number;
    hasResult: boolean;
    hasError: boolean;
    hasTask: boolean;
}

export interface AgentCanvasConnection {
    parentId: string;
    childId: string;
    relation: 'parent';
}

export interface AgentCanvasGroup {
    id: string;
    label?: string;
    nodeIds: string[];
    nodeCount: number;
    includedNodeCount: number;
    hasStoryContext: boolean;
    storySceneCount?: number;
}

export interface AgentCanvasTask {
    nodeId: string;
    taskId?: string;
    status?: string;
    progress?: number;
    model?: string;
    imageModel?: string;
}

export type AgentCanvasContextMode = 'focused' | 'workflow_summary';

export interface AgentCanvasContext {
    version: 1;
    contextMode: AgentCanvasContextMode;
    workflow: {
        id?: string | null;
        title?: string;
        nodeCount: number;
        groupCount: number;
        selectedNodeIds: string[];
        viewport: {
            x: number;
            y: number;
            zoom: number;
        };
    };
    limits: {
        nodesLimit: number;
        connectionsLimit: number;
        nodesIncluded: number;
        connectionsIncluded: number;
        truncated: boolean;
    };
    focus: {
        selectedNodeIds: string[];
        parentNodeIds: string[];
        childNodeIds: string[];
        includedNodeIds: string[];
        noSelectionOverview: boolean;
    };
    selectedNodes: AgentCanvasNode[];
    nodes: AgentCanvasNode[];
    connections: AgentCanvasConnection[];
    groups: AgentCanvasGroup[];
    activeTasks: AgentCanvasTask[];
    stats: {
        nodeCount: number;
        groupCount: number;
        selectedNodeCount: number;
        connectionCount: number;
        activeTaskCount: number;
        failedNodeCount: number;
        typeCounts: Record<string, number>;
        statusCounts: Record<string, number>;
    };
}

interface BuildAgentCanvasContextInput {
    nodes: NodeData[];
    groups: NodeGroup[];
    selectedNodeIds: string[];
    viewport: Viewport;
    workflowId?: string | null;
    canvasTitle?: string;
    userMessage?: string;
    contextMode?: AgentCanvasContextMode;
}

const WORKFLOW_SUMMARY_PATTERNS = [
    /总结.*(?:整个|当前)?画布/i,
    /分析.*(?:整个|当前)?(?:工作流|流程|画布)/i,
    /查看.*所有节点/i,
    /整理.*(?:完整流程|整个画布|当前画布)/i,
    /所有节点/i,
    /完整流程/i,
    /workflow\s+summary/i,
    /full\s+canvas/i,
    /entire\s+canvas/i,
    /whole\s+canvas/i,
    /all\s+nodes/i,
];

function truncate(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function shouldUseWorkflowSummary(userMessage?: string): boolean {
    if (typeof userMessage !== 'string' || !userMessage.trim()) return false;
    return WORKFLOW_SUMMARY_PATTERNS.some(pattern => pattern.test(userMessage));
}

function resolveContextMode(
    requestedMode?: AgentCanvasContextMode,
    userMessage?: string
): AgentCanvasContextMode {
    if (requestedMode === 'workflow_summary' || requestedMode === 'focused') {
        return requestedMode;
    }
    return shouldUseWorkflowSummary(userMessage) ? 'workflow_summary' : 'focused';
}

function isActiveTaskNode(node: NodeData): boolean {
    return Boolean(node.taskId && node.generationStatus && ACTIVE_TASK_STATUSES.has(node.generationStatus));
}

function isFailedNode(node: NodeData): boolean {
    return (
        node.status === 'error' ||
        Boolean(node.errorMessage) ||
        Boolean(node.generationStatus && TERMINAL_ERROR_STATUSES.has(node.generationStatus))
    );
}

function compactNode(node: NodeData, options: { includePrompt?: boolean } = {}): AgentCanvasNode {
    const includePrompt = options.includePrompt !== false;
    return {
        id: node.id,
        type: String(node.type),
        title: truncate(node.title, TITLE_LIMIT),
        x: Math.round(node.x),
        y: Math.round(node.y),
        status: String(node.status),
        prompt: includePrompt ? truncate(node.prompt, PROMPT_LIMIT) : undefined,
        errorMessage: truncate(node.errorMessage, ERROR_LIMIT),
        parentIds: node.parentIds?.slice(0, 12),
        groupId: node.groupId,
        model: truncate(node.model, TITLE_LIMIT),
        imageModel: truncate(node.imageModel, TITLE_LIMIT),
        aspectRatio: truncate(node.aspectRatio, 32),
        resolution: truncate(node.resolution, 32),
        taskId: truncate(node.taskId, TITLE_LIMIT),
        generationStatus: node.generationStatus,
        progress: typeof node.progress === 'number' ? node.progress : undefined,
        hasResult: Boolean(node.resultUrl),
        hasError: isFailedNode(node),
        hasTask: Boolean(node.taskId),
    };
}

function compactTask(node: NodeData): AgentCanvasTask {
    return {
        nodeId: node.id,
        taskId: node.taskId,
        status: node.generationStatus,
        progress: typeof node.progress === 'number' ? node.progress : undefined,
        model: truncate(node.model, TITLE_LIMIT),
        imageModel: truncate(node.imageModel, TITLE_LIMIT),
    };
}

function createConnections(nodes: NodeData[]): AgentCanvasConnection[] {
    const connections: AgentCanvasConnection[] = [];

    for (const node of nodes) {
        for (const parentId of node.parentIds || []) {
            if (!parentId) continue;
            connections.push({
                parentId,
                childId: node.id,
                relation: 'parent',
            });
        }
    }

    return connections;
}

function countBy<T>(items: T[], getKey: (item: T) => string | undefined): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
        const key = getKey(item) || 'unknown';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

interface ChosenContextNodes {
    nodes: NodeData[];
    parentNodeIds: string[];
    childNodeIds: string[];
    noSelectionOverview: boolean;
}

function chooseWorkflowSummaryNodes(nodes: NodeData[], selectedNodeIds: string[]): ChosenContextNodes {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const selectedSet = new Set(selectedNodeIds);
    const chosen = new Map<string, NodeData>();

    const addNode = (node: NodeData | undefined) => {
        if (!node || chosen.size >= NODE_LIMIT || chosen.has(node.id)) return;
        chosen.set(node.id, node);
    };

    selectedNodeIds.forEach(id => addNode(nodesById.get(id)));
    nodes.filter(node => isActiveTaskNode(node) || isFailedNode(node)).forEach(addNode);

    for (const node of nodes) {
        if (!selectedSet.has(node.id)) continue;
        node.parentIds?.forEach(parentId => addNode(nodesById.get(parentId)));
        nodes
            .filter(candidate => candidate.parentIds?.includes(node.id))
            .forEach(addNode);
    }

    nodes.forEach(addNode);
    return {
        nodes: Array.from(chosen.values()),
        parentNodeIds: [],
        childNodeIds: [],
        noSelectionOverview: false,
    };
}

function chooseFocusedContextNodes(nodes: NodeData[], selectedNodeIds: string[]): ChosenContextNodes {
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const selectedSet = new Set(selectedNodeIds);
    const parentNodeIds = new Set<string>();
    const childNodeIds = new Set<string>();
    const chosen = new Map<string, NodeData>();

    const addNode = (node: NodeData | undefined) => {
        if (!node || chosen.size >= FOCUSED_NODE_LIMIT || chosen.has(node.id)) return;
        chosen.set(node.id, node);
    };

    if (!selectedSet.size) {
        const overviewNodes = [
            ...nodes.filter(node => isActiveTaskNode(node) || isFailedNode(node)),
            ...nodes.slice(-NO_SELECTION_NODE_LIMIT),
        ];

        for (const node of overviewNodes) {
            if (chosen.size >= NO_SELECTION_NODE_LIMIT) break;
            addNode(node);
        }

        return {
            nodes: Array.from(chosen.values()),
            parentNodeIds: [],
            childNodeIds: [],
            noSelectionOverview: true,
        };
    }

    selectedNodeIds.forEach(id => addNode(nodesById.get(id)));

    for (const node of nodes) {
        if (!selectedSet.has(node.id)) continue;

        node.parentIds?.forEach(parentId => {
            parentNodeIds.add(parentId);
            addNode(nodesById.get(parentId));
        });

        nodes
            .filter(candidate => candidate.parentIds?.includes(node.id))
            .forEach(childNode => {
                childNodeIds.add(childNode.id);
                addNode(childNode);
            });
    }

    return {
        nodes: Array.from(chosen.values()),
        parentNodeIds: Array.from(parentNodeIds),
        childNodeIds: Array.from(childNodeIds),
        noSelectionOverview: false,
    };
}

export function buildAgentCanvasContext({
    nodes,
    groups,
    selectedNodeIds,
    viewport,
    workflowId,
    canvasTitle,
    userMessage,
    contextMode,
}: BuildAgentCanvasContextInput): AgentCanvasContext {
    const resolvedContextMode = resolveContextMode(contextMode, userMessage);
    const allConnections = createConnections(nodes);
    const chosenContext = resolvedContextMode === 'workflow_summary'
        ? chooseWorkflowSummaryNodes(nodes, selectedNodeIds)
        : chooseFocusedContextNodes(nodes, selectedNodeIds);
    const contextNodes = chosenContext.nodes;
    const contextNodeIds = new Set(contextNodes.map(node => node.id));
    const includeNodePrompts = !(resolvedContextMode === 'focused' && chosenContext.noSelectionOverview);

    const selectedNodes = selectedNodeIds
        .map(id => contextNodes.find(node => node.id === id))
        .filter((node): node is NodeData => Boolean(node))
        .map(node => compactNode(node));

    const contextConnections = allConnections
        .filter(connection => contextNodeIds.has(connection.parentId) && contextNodeIds.has(connection.childId))
        .slice(0, CONNECTION_LIMIT);

    const contextGroups = groups
        .filter(group => group.nodeIds.some(nodeId => contextNodeIds.has(nodeId)))
        .slice(0, GROUP_LIMIT)
        .map(group => ({
            id: group.id,
            label: truncate(group.label, TITLE_LIMIT),
            nodeIds: group.nodeIds.filter(nodeId => contextNodeIds.has(nodeId)).slice(0, NODE_LIMIT),
            nodeCount: group.nodeIds.length,
            includedNodeCount: group.nodeIds.filter(nodeId => contextNodeIds.has(nodeId)).length,
            hasStoryContext: Boolean(group.storyContext),
            storySceneCount: group.storyContext?.sceneCount,
        }));

    const activeTasks = nodes
        .filter(isActiveTaskNode)
        .slice(0, ACTIVE_TASK_LIMIT)
        .map(compactTask);

    const failedNodeCount = nodes.filter(isFailedNode).length;

    return {
        version: 1,
        contextMode: resolvedContextMode,
        workflow: {
            id: workflowId || null,
            title: truncate(canvasTitle, TITLE_LIMIT),
            nodeCount: nodes.length,
            groupCount: groups.length,
            selectedNodeIds: selectedNodeIds.slice(0, NODE_LIMIT),
            viewport: {
                x: Math.round(viewport.x),
                y: Math.round(viewport.y),
                zoom: Number(viewport.zoom.toFixed(3)),
            },
        },
        limits: {
            nodesLimit: NODE_LIMIT,
            connectionsLimit: CONNECTION_LIMIT,
            nodesIncluded: contextNodes.length,
            connectionsIncluded: contextConnections.length,
            truncated: contextNodes.length < nodes.length || contextConnections.length < allConnections.length,
        },
        focus: {
            selectedNodeIds: selectedNodeIds.slice(0, NODE_LIMIT),
            parentNodeIds: chosenContext.parentNodeIds.slice(0, NODE_LIMIT),
            childNodeIds: chosenContext.childNodeIds.slice(0, NODE_LIMIT),
            includedNodeIds: contextNodes.map(node => node.id).slice(0, NODE_LIMIT),
            noSelectionOverview: chosenContext.noSelectionOverview,
        },
        selectedNodes,
        nodes: contextNodes.map(node => compactNode(node, { includePrompt: includeNodePrompts })),
        connections: contextConnections,
        groups: contextGroups,
        activeTasks,
        stats: {
            nodeCount: nodes.length,
            groupCount: groups.length,
            selectedNodeCount: selectedNodeIds.length,
            connectionCount: allConnections.length,
            activeTaskCount: nodes.filter(isActiveTaskNode).length,
            failedNodeCount,
            typeCounts: countBy(nodes, node => String(node.type)),
            statusCounts: countBy(nodes, node => String(node.status)),
        },
    };
}
