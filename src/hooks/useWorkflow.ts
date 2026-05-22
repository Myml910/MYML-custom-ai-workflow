/**
 * useWorkflow.ts
 * 
 * Custom hook for managing workflow save/load functionality.
 * Handles persistence to the backend server.
 */

import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { NodeData, NodeGroup, NodeType, Viewport } from '../types';
import { warnIfLargeWorkflowPayload } from '../utils/workflowSnapshot';

interface WorkflowData {
    id: string | null;
    title: string;
    nodes: NodeData[];
    groups: NodeGroup[];
    viewport: Viewport;
}

interface UseWorkflowOptions {
    nodes: NodeData[];
    groups: NodeGroup[];
    viewport: Viewport;
    canvasTitle: string;
    setNodes: Dispatch<SetStateAction<NodeData[]>>;
    setGroups: Dispatch<SetStateAction<NodeGroup[]>>; // For restoring groups when loading
    setSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
    setCanvasTitle: (title: string) => void;
    setEditingTitleValue: (value: string) => void;
    onPanelOpen?: () => void; // Called when workflow panel opens
}

const normalizeLoadedWorkflowNodes = (workflowNodes: NodeData[] | undefined): NodeData[] => {
    if (!Array.isArray(workflowNodes)) return [];

    return workflowNodes.map(node => {
        const isTextNode = node.type === NodeType.TEXT || Boolean(node.textMode);
        if (!isTextNode || node.textMode !== 'editing') return node;

        return {
            ...node,
            // Loaded workflows should open in browse mode. Users can still enter editing explicitly.
            textMode: 'menu'
        };
    });
};

export const useWorkflow = ({
    nodes,
    groups,
    viewport,
    canvasTitle,
    setNodes,
    setGroups,
    setSelectedNodeIds,
    setCanvasTitle,
    setEditingTitleValue,
    onPanelOpen
}: UseWorkflowOptions) => {
    // Workflow state
    const [workflowId, setWorkflowId] = useState<string | null>(null);
    const [isWorkflowPanelOpen, setIsWorkflowPanelOpen] = useState(false);
    const [workflowPanelY, setWorkflowPanelY] = useState(0);

    /**
     * Save current workflow to server
     */
    const handleSaveWorkflow = useCallback(async () => {
        try {
            const workflow: WorkflowData = {
                id: workflowId,
                title: canvasTitle,
                nodes,
                groups,
                viewport
            };

            const serializedWorkflow = JSON.stringify(workflow);
            warnIfLargeWorkflowPayload(workflow, serializedWorkflow);

            const response = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: serializedWorkflow
            });

            if (response.ok) {
                const result = await response.json();
                setWorkflowId(result.id);
                console.log('Workflow saved:', result.id);
            }
        } catch (error) {
            console.error('Failed to save workflow:', error);
        }
    }, [workflowId, canvasTitle, nodes, groups, viewport]);

    /**
     * Load workflow from server
     * Supports both user workflows and public workflows (prefixed with "public:")
     * Returns the loaded workflow's node count and title for tracking
     */
    const handleLoadWorkflow = useCallback(async (id: string): Promise<{ nodeCount: number; title: string } | null> => {
        try {
            // Check if loading a public workflow
            const isPublic = id.startsWith('public:');
            const workflowId = isPublic ? id.replace('public:', '') : id;
            const endpoint = isPublic
                ? `/api/public-workflows/${workflowId}`
                : `/api/workflows/${workflowId}`;

            const response = await fetch(endpoint, { credentials: 'include' });
            if (response.ok) {
                const workflow = await response.json();
                const loadedNodes = normalizeLoadedWorkflowNodes(workflow.nodes);

                // For public workflows, don't set the workflowId so it saves as a new workflow
                if (!isPublic) {
                    setWorkflowId(workflow.id);
                } else {
                    setWorkflowId(null); // New copy, not linked to public workflow
                }

                setCanvasTitle(workflow.title || 'Untitled');
                setEditingTitleValue(workflow.title || 'Untitled');
                setNodes(loadedNodes);
                setGroups(workflow.groups || []); // Restore groups
                // Reset selection
                setSelectedNodeIds([]);
                setIsWorkflowPanelOpen(false);
                console.log(isPublic ? 'Public workflow loaded:' : 'Workflow loaded:', workflowId);
                // Return info for tracking
                return {
                    nodeCount: loadedNodes.length,
                    title: workflow.title || 'Untitled'
                };
            }
        } catch (error) {
            console.error('Failed to load workflow:', error);
        }
        return null;
    }, [setNodes, setGroups, setSelectedNodeIds, setCanvasTitle, setEditingTitleValue]);

    /**
     * Handle workflow panel toggle from toolbar click
     */
    const handleWorkflowsClick = useCallback((e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setWorkflowPanelY(rect.top);
        setIsWorkflowPanelOpen(prev => !prev);
        onPanelOpen?.(); // Close other panels
    }, [onPanelOpen]);

    /**
     * Close workflow panel
     */
    const closeWorkflowPanel = useCallback(() => {
        setIsWorkflowPanelOpen(false);
    }, []);

    /**
     * Reset workflow ID (for creating a new canvas)
     */
    const resetWorkflowId = useCallback(() => {
        setWorkflowId(null);
    }, []);

    return {
        workflowId,
        isWorkflowPanelOpen,
        workflowPanelY,
        handleSaveWorkflow,
        handleLoadWorkflow,
        handleWorkflowsClick,
        closeWorkflowPanel,
        resetWorkflowId
    };
};
