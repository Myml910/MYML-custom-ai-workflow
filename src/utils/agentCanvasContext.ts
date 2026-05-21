import { NodeData, NodeGroup, Viewport } from '../types';

const NODE_LIMIT = 50;
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

export interface AgentCanvasContext {
    version: 1;
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
}

function truncate(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
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

function compactNode(node: NodeData): AgentCanvasNode {
    return {
        id: node.id,
        type: String(node.type),
        title: truncate(node.title, TITLE_LIMIT),
        x: Math.round(node.x),
        y: Math.round(node.y),
        status: String(node.status),
        prompt: truncate(node.prompt, PROMPT_LIMIT),
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

function chooseContextNodes(nodes: NodeData[], selectedNodeIds: string[]): NodeData[] {
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
    return Array.from(chosen.values());
}

export function buildAgentCanvasContext({
    nodes,
    groups,
    selectedNodeIds,
    viewport,
    workflowId,
    canvasTitle,
}: BuildAgentCanvasContextInput): AgentCanvasContext {
    const allConnections = createConnections(nodes);
    const contextNodes = chooseContextNodes(nodes, selectedNodeIds);
    const contextNodeIds = new Set(contextNodes.map(node => node.id));

    const selectedNodes = selectedNodeIds
        .map(id => contextNodes.find(node => node.id === id))
        .filter((node): node is NodeData => Boolean(node))
        .map(compactNode);

    const contextConnections = allConnections
        .filter(connection => contextNodeIds.has(connection.parentId) || contextNodeIds.has(connection.childId))
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
        selectedNodes,
        nodes: contextNodes.map(compactNode),
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
