/**
 * useNodeManagement.ts
 * 
 * Custom hook for managing node state and operations.
 * Handles node creation, updates, selection, and deletion.
 */

import { useState } from 'react';
import { NodeData, NodeType, NodeStatus, Viewport } from '../types';
import { getEffectiveImageReference } from '../utils/imageReferences';

const IMAGE_PROMPT_REVERSE_LIMIT = 6;
const TEXT_NODE_VERTICAL_GAP = 240;
const NODE_WIDTH = 340;
const NODE_GAP = 100;
const IMAGE_PROMPT_REVERSE_TEMPLATE_VERSION = 'image-prompt-description-v1' as const;
const IMAGE_PROMPT_REVERSE_READY_TEXT = '\u5df2\u5173\u8054\u53c2\u8003\u56fe\uff0c\u70b9\u51fb\u8fd0\u884c\u751f\u6210\u56fe\u7247\u63d0\u793a\u8bcd\u63cf\u8ff0\u3002';

type ImageSourceRecord = Record<string, unknown>;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function collectImageUrlCandidates(value: unknown, addUrl: (url: string) => void) {
    if (!value) return;

    if (isNonEmptyString(value)) {
        addUrl(value);
        return;
    }

    if (Array.isArray(value)) {
        value.forEach(item => collectImageUrlCandidates(item, addUrl));
        return;
    }

    if (typeof value === 'object') {
        const record = value as ImageSourceRecord;
        [
            record.url,
            record.imageUrl,
            record.image_url,
            record.resultUrl,
            record.result_url,
            record.src
        ].forEach(candidate => collectImageUrlCandidates(candidate, addUrl));
    }
}

function collectImagePromptReverseSources(sourceNode: NodeData, nodesById: Map<string, NodeData>): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();
    const addUrl = (url: string) => {
        const trimmed = url.trim();
        if (!trimmed || seen.has(trimmed) || urls.length >= IMAGE_PROMPT_REVERSE_LIMIT) return;
        seen.add(trimmed);
        urls.push(trimmed);
    };

    const effectiveReference = getEffectiveImageReference(sourceNode, nodesById);
    collectImageUrlCandidates(effectiveReference?.url, addUrl);
    collectImageUrlCandidates(sourceNode.resultUrl, addUrl);
    collectImageUrlCandidates(sourceNode.lastFrame, addUrl);

    const extensibleSourceNode = sourceNode as NodeData & ImageSourceRecord;
    collectImageUrlCandidates(extensibleSourceNode.resultUrls, addUrl);
    collectImageUrlCandidates(extensibleSourceNode.imageUrls, addUrl);
    collectImageUrlCandidates(extensibleSourceNode.images, addUrl);
    collectImageUrlCandidates(extensibleSourceNode.outputs, addUrl);
    collectImageUrlCandidates(extensibleSourceNode.output, addUrl);

    return urls;
}

export const useNodeManagement = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [nodes, setNodes] = useState<NodeData[]>([]);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

    // ============================================================================
    // NODE OPERATIONS
    // ============================================================================

    /**
     * Adds a new node to the canvas
     * @param type - Type of node to create
     * @param x - Screen X coordinate
     * @param y - Screen Y coordinate
     * @param parentId - Optional parent node ID for connections
     * @param viewport - Current viewport for coordinate conversion
     */
    const addNode = (
        type: NodeType,
        x: number,
        y: number,
        parentId: string | undefined,
        viewport: Viewport
    ) => {
        const canvasX = (x - viewport.x) / viewport.zoom;
        const canvasY = (y - viewport.y) / viewport.zoom;

        const newNode: NodeData = {
            id: crypto.randomUUID(),
            type,
            x: parentId ? canvasX : canvasX - 170,
            y: parentId ? canvasY : canvasY - 100,
            prompt: '',
            status: NodeStatus.IDLE,
            model: 'Banana Pro',
            aspectRatio: 'Auto',
            resolution: 'Auto',
            parentIds: parentId ? [parentId] : []
        };

        setNodes(prev => [...prev, newNode]);
        setSelectedNodeIds([newNode.id]);

        return newNode.id;
    };

    /**
     * Updates a node with partial data
     * @param id - Node ID to update
     * @param updates - Partial node data to merge
     */
    const updateNode = (id: string, updates: Partial<NodeData>) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    };

    /**
     * Deletes a node by ID
     * @param id - Node ID to delete
     */
    const deleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
        setSelectedNodeIds(prev => prev.filter(nodeId => nodeId !== id));
    };

    /**
     * Deletes multiple nodes by IDs
     * @param ids - Array of node IDs to delete
     */
    const deleteNodes = (ids: string[]) => {
        setNodes(prev => prev.filter(n => !ids.includes(n.id)));
        setSelectedNodeIds([]);
    };

    /**
     * Clears all node selections
     */
    const clearSelection = () => {
        setSelectedNodeIds([]);
    };

    /**
     * Handles node type selection from context menu
     * Creates new node or deletes existing node
     */
    const handleSelectTypeFromMenu = (
        type: NodeType | 'DELETE',
        contextMenu: any,
        viewport: Viewport,
        onCloseMenu: () => void
    ) => {
        // Handle Delete Action
        if (type === 'DELETE') {
            if (contextMenu.sourceNodeId) {
                deleteNode(contextMenu.sourceNodeId);
            }
            onCloseMenu();
            return;
        }

        if (contextMenu.type === 'node-connector' && contextMenu.sourceNodeId) {
            const sourceNode = nodes.find(n => n.id === contextMenu.sourceNodeId);
            if (sourceNode) {
                const direction = contextMenu.connectorSide || 'right';

                if (type === NodeType.TEXT && direction === 'right') {
                    const nodesById = new Map(nodes.map(node => [node.id, node]));
                    const sourceImageUrls = collectImagePromptReverseSources(sourceNode, nodesById);

                    if (sourceImageUrls.length > 0) {
                        const textNodes = sourceImageUrls.map((imageUrl, index): NodeData => ({
                            id: crypto.randomUUID(),
                            type: NodeType.TEXT,
                            x: sourceNode.x + NODE_WIDTH + NODE_GAP,
                            y: sourceNode.y + index * TEXT_NODE_VERTICAL_GAP,
                            prompt: IMAGE_PROMPT_REVERSE_READY_TEXT,
                            status: NodeStatus.IDLE,
                            model: 'Banana Pro',
                            aspectRatio: 'Auto',
                            resolution: 'Auto',
                            parentIds: [contextMenu.sourceNodeId],
                            textMode: 'menu',
                            textSource: {
                                type: 'image-prompt-reverse',
                                parentNodeId: contextMenu.sourceNodeId,
                                sourceImageUrl: imageUrl,
                                sourceImageIndex: index,
                                promptTemplateVersion: IMAGE_PROMPT_REVERSE_TEMPLATE_VERSION,
                                status: 'idle'
                            }
                        }));

                        setNodes(prev => [...prev, ...textNodes]);
                        setSelectedNodeIds(textNodes.map(node => node.id));
                        onCloseMenu();
                        return;
                    }
                }

                const newNodeId = crypto.randomUUID();

                let newNode: NodeData;

                if (direction === 'right') {
                    // Append: Source -> New
                    newNode = {
                        id: newNodeId,
                        type,
                        x: sourceNode.x + NODE_WIDTH + NODE_GAP,
                        y: sourceNode.y,
                        prompt: '',
                        status: NodeStatus.IDLE,
                        model: 'Banana Pro',
                        aspectRatio: 'Auto',
                        resolution: 'Auto',
                        parentIds: contextMenu.sourceNodeId ? [contextMenu.sourceNodeId] : []
                    };
                } else {
                    // Prepend: New -> Source
                    newNode = {
                        id: newNodeId,
                        type,
                        x: sourceNode.x - NODE_WIDTH - NODE_GAP,
                        y: sourceNode.y,
                        prompt: '',
                        status: NodeStatus.IDLE,
                        model: 'Banana Pro',
                        aspectRatio: 'Auto',
                        resolution: 'Auto',
                        parentIds: []
                    };
                    // Update source to add new node as parent
                    const existingParentIds = sourceNode.parentIds || [];
                    updateNode(contextMenu.sourceNodeId, { parentIds: [...existingParentIds, newNodeId] });
                }

                setNodes(prev => [...prev, newNode]);
                setSelectedNodeIds([newNodeId]);
            }
        } else {
            // Global menu - add at click position
            addNode(type, contextMenu.x, contextMenu.y, undefined, viewport);
        }

        onCloseMenu();
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
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
    };
};
