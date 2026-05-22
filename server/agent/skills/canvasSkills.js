const PROMPT_EXCERPT_LIMIT = 180;
const ERROR_EXCERPT_LIMIT = 180;
const LIST_LIMIT = 20;
const CHAIN_LIMIT = 30;

const ACTIVE_STATUSES = new Set(["queued", "running", "polling"]);
const IMAGE_TYPES = new Set(["Image", "Image Editor", "Camera Angle", "Local Image Model"]);
const PROMPT_TYPES = new Set(["Text"]);

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function truncate(value, limit = PROMPT_EXCERPT_LIMIT) {
    if (typeof value !== "string") return "";
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function nodeLabel(node) {
    if (!node) return "unknown";
    const title = node.title ? ` "${node.title}"` : "";
    return `${node.id} (${node.type || "unknown"}${title})`;
}

function compactNode(node) {
    return {
        id: node.id,
        type: node.type || "unknown",
        status: node.status || "unknown",
        model: node.imageModel || node.model || "unknown",
        promptExcerpt: truncate(node.prompt),
    };
}

function compactFailedNode(node) {
    return {
        ...compactNode(node),
        errorExcerpt: truncate(node.errorMessage, ERROR_EXCERPT_LIMIT),
        generationStatus: node.generationStatus || undefined,
    };
}

function isFailedNode(node) {
    return Boolean(node?.hasError || node?.status === "error" || node?.errorMessage);
}

function isRunningNode(node) {
    return Boolean(
        node?.taskId ||
        node?.hasTask ||
        (node?.generationStatus && ACTIVE_STATUSES.has(node.generationStatus))
    );
}

function getNodesById(canvasContext) {
    return new Map(asArray(canvasContext?.nodes).map(node => [node.id, node]));
}

function getSelectedIdSet(canvasContext) {
    const ids = new Set(asArray(canvasContext?.workflow?.selectedNodeIds));
    for (const node of asArray(canvasContext?.selectedNodes)) {
        if (node?.id) ids.add(node.id);
    }
    return ids;
}

function countNodes(nodes, predicate) {
    return nodes.reduce((count, node) => count + (predicate(node) ? 1 : 0), 0);
}

function summarizeStructure(canvasContext, nodes, connections) {
    const typeCounts = canvasContext?.stats?.typeCounts || {};
    const statusCounts = canvasContext?.stats?.statusCounts || {};
    const topConnections = connections.slice(0, 6).map(connection => `${connection.parentId} -> ${connection.childId}`);
    const parts = [];

    if (Object.keys(typeCounts).length) {
        parts.push(`Types: ${Object.entries(typeCounts).map(([type, count]) => `${type} ${count}`).join(", ")}`);
    }
    if (Object.keys(statusCounts).length) {
        parts.push(`Statuses: ${Object.entries(statusCounts).map(([status, count]) => `${status} ${count}`).join(", ")}`);
    }
    if (topConnections.length) {
        parts.push(`Sample links: ${topConnections.join("; ")}`);
    }
    if (!parts.length && nodes.length) {
        parts.push(`Canvas contains ${nodes.length} included nodes.`);
    }

    return parts.join(" ");
}

function findRelevantConnections(canvasContext) {
    const connections = asArray(canvasContext?.connections);
    const selectedIds = getSelectedIdSet(canvasContext);
    if (!selectedIds.size) return connections.slice(0, CHAIN_LIMIT);

    return connections
        .filter(connection => selectedIds.has(connection.parentId) || selectedIds.has(connection.childId))
        .slice(0, CHAIN_LIMIT);
}

export const canvasSkills = [
    {
        name: "canvas.summarizeWorkflow",
        description: "Summarize the current canvas workflow using read-only node, connection, status, and selection metadata.",
        readOnly: true,
        execute({ canvasContext }) {
            const nodes = asArray(canvasContext?.nodes);
            const connections = asArray(canvasContext?.connections);
            const stats = canvasContext?.stats || {};
            const limits = canvasContext?.limits || {};
            const selectedCount = stats.selectedNodeCount ?? asArray(canvasContext?.workflow?.selectedNodeIds).length;
            const failedCount = stats.failedNodeCount ?? countNodes(nodes, isFailedNode);
            const runningCount = stats.activeTaskCount ?? countNodes(nodes, isRunningNode);
            const completedCount = stats.statusCounts?.success ?? countNodes(nodes, node => node.status === "success" || node.hasResult);
            const imageNodeCount = countNodes(nodes, node => IMAGE_TYPES.has(node.type));
            const promptNodeCount = countNodes(nodes, node => PROMPT_TYPES.has(node.type));

            return {
                nodeCount: stats.nodeCount ?? nodes.length,
                connectionCount: stats.connectionCount ?? connections.length,
                selectedCount,
                failedCount,
                runningCount,
                completedCount,
                imageNodeCount,
                promptNodeCount,
                structureSummary: summarizeStructure(canvasContext, nodes, connections),
                truncated: Boolean(limits.truncated),
                truncationNote: limits.truncated
                    ? `Only analyzed the first ${limits.nodesIncluded ?? nodes.length} included nodes and ${limits.connectionsIncluded ?? connections.length} included connections.`
                    : undefined,
            };
        },
    },
    {
        name: "canvas.inspectSelectedNodes",
        description: "Inspect currently selected canvas nodes using read-only metadata.",
        readOnly: true,
        execute({ canvasContext }) {
            const selectedNodes = asArray(canvasContext?.selectedNodes).slice(0, LIST_LIMIT).map(compactNode);
            return {
                selectedCount: canvasContext?.stats?.selectedNodeCount ?? selectedNodes.length,
                selectedNodes,
                message: selectedNodes.length ? undefined : "No nodes are currently selected.",
            };
        },
    },
    {
        name: "canvas.findFailedNodes",
        description: "List failed or errored nodes using read-only status and error metadata.",
        readOnly: true,
        execute({ canvasContext }) {
            const failedNodes = asArray(canvasContext?.nodes)
                .filter(isFailedNode)
                .slice(0, LIST_LIMIT)
                .map(compactFailedNode);

            return {
                failedCount: canvasContext?.stats?.failedNodeCount ?? failedNodes.length,
                failedNodes,
                message: failedNodes.length ? undefined : "No failed nodes were found in the included canvas context.",
            };
        },
    },
    {
        name: "canvas.listRunningTasks",
        description: "List queued, running, or polling generation tasks from read-only canvas metadata.",
        readOnly: true,
        execute({ canvasContext }) {
            const nodesById = getNodesById(canvasContext);
            const activeTasks = asArray(canvasContext?.activeTasks).slice(0, LIST_LIMIT).map(task => {
                const node = nodesById.get(task.nodeId);
                return {
                    nodeId: task.nodeId,
                    nodeType: node?.type || "unknown",
                    taskId: task.taskId || node?.taskId || undefined,
                    progress: task.progress ?? node?.progress,
                    generationStatus: task.status || node?.generationStatus || node?.status || "unknown",
                    model: task.imageModel || task.model || node?.imageModel || node?.model || "unknown",
                };
            });

            return {
                runningCount: canvasContext?.stats?.activeTaskCount ?? activeTasks.length,
                runningTasks: activeTasks,
                message: activeTasks.length ? undefined : "No running, queued, or polling tasks were found.",
            };
        },
    },
    {
        name: "canvas.explainGenerationChain",
        description: "Explain parent-child generation links with a lightweight read-only chain summary.",
        readOnly: true,
        execute({ canvasContext }) {
            const nodesById = getNodesById(canvasContext);
            const selectedIds = getSelectedIdSet(canvasContext);
            const relevantConnections = findRelevantConnections(canvasContext);
            const edges = relevantConnections.map(connection => {
                const parent = nodesById.get(connection.parentId);
                const child = nodesById.get(connection.childId);
                return {
                    parentId: connection.parentId,
                    parent: nodeLabel(parent),
                    childId: connection.childId,
                    child: nodeLabel(child),
                };
            });

            return {
                selectedNodeIds: Array.from(selectedIds),
                connectionCount: canvasContext?.stats?.connectionCount ?? asArray(canvasContext?.connections).length,
                explainedConnectionCount: edges.length,
                edges,
                message: edges.length
                    ? undefined
                    : selectedIds.size
                        ? "No parent-child links were found for the selected nodes in the included canvas context."
                        : "No parent-child links were found in the included canvas context.",
            };
        },
    },
];

export default canvasSkills;
