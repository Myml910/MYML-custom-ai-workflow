/**
 * useGenerationRecovery.ts
 * 
 * Custom hook that checks for nodes in 'loading' status and polls
 * the backend to see if their generation has finished.
 */

import { useEffect, useCallback, useRef } from 'react';
import { NodeData, NodeStatus } from '../types';
import { extractVideoLastFrame } from '../utils/videoHelpers';
import { getTask, getTaskByNodeId, type GenerationTask, type GenerationTaskStatus } from '../services/generationService';

interface UseGenerationRecoveryOptions {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
    workflowId?: string | null;
}

export const useGenerationRecovery = ({
    nodes,
    updateNode,
    workflowId = null
}: UseGenerationRecoveryOptions) => {
    // Use a ref to access current nodes without causing re-renders
    const nodesRef = useRef<NodeData[]>(nodes);
    nodesRef.current = nodes;

    const ACTIVE_TASK_STATUSES = new Set<GenerationTaskStatus>(['queued', 'running', 'polling']);

    const withCacheBusting = (url: string): string => {
        if (!url || url.startsWith('data:')) return url;
        return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    };

    const getTaskErrorMessage = (task: GenerationTask): string => {
        if (task.errorMessage) return task.errorMessage;
        if (task.status === 'timeout') return 'Image generation timed out.';
        return 'Image generation failed.';
    };

    const applyTaskStatus = useCallback(async (nodeId: string, task: GenerationTask): Promise<boolean> => {
        if (ACTIVE_TASK_STATUSES.has(task.status)) {
            updateNode(nodeId, {
                status: NodeStatus.LOADING,
                taskId: task.taskId,
                generationStatus: task.status,
                progress: task.progress ?? undefined,
                errorMessage: undefined
            });
            return true;
        }

        if (task.status === 'completed' && task.resultUrl) {
            updateNode(nodeId, {
                status: NodeStatus.SUCCESS,
                resultUrl: withCacheBusting(task.resultUrl),
                taskId: task.taskId,
                generationStatus: 'completed',
                progress: 100,
                errorMessage: undefined,
                generationStartTime: undefined
            });
            return true;
        }

        if (task.status === 'cancelled') {
            const node = nodesRef.current.find(n => n.id === nodeId);
            updateNode(nodeId, {
                status: node?.resultUrl ? NodeStatus.SUCCESS : NodeStatus.IDLE,
                taskId: undefined,
                generationStatus: undefined,
                progress: undefined,
                errorMessage: undefined,
                generationStartTime: undefined
            });
            return true;
        }

        if (task.status === 'failed' || task.status === 'timeout') {
            updateNode(nodeId, {
                status: NodeStatus.ERROR,
                taskId: task.taskId,
                generationStatus: task.status,
                errorMessage: getTaskErrorMessage(task),
                generationStartTime: undefined
            });
            return true;
        }

        return false;
    }, [updateNode]);

    const checkLegacyStatus = useCallback(async (nodeId: string) => {
        try {
            const response = await fetch(`/api/generation-status/${nodeId}`, { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && data.resultUrl) {
                    // Access nodes via ref to avoid stale closure
                    const node = nodesRef.current.find(n => n.id === nodeId);

                    // Race condition check: If node has a generationStartTime, compare with result's createdAt
                    // This prevents applying stale results from previous generations
                    if (node?.generationStartTime && data.createdAt) {
                        const resultCreatedAt = new Date(data.createdAt).getTime();
                        if (resultCreatedAt < node.generationStartTime) {
                            // Stale result, skip silently (don't spam console)
                            return;
                        }
                    }

                    console.log(`[Recovery] Found new result for node ${nodeId}`);

                    // Update node with success status and result URL
                    const updates: Partial<NodeData> = {
                        status: NodeStatus.SUCCESS,
                        resultUrl: data.resultUrl,
                        errorMessage: undefined,
                        generationStartTime: undefined // Clear the timestamp after successful recovery
                    };

                    // If it's a video, extract the last frame for chaining
                    if (data.type === 'video') {
                        try {
                            const lastFrame = await extractVideoLastFrame(data.resultUrl);
                            updates.lastFrame = lastFrame;
                        } catch (err) {
                            console.error(`[Recovery] Failed to extract last frame for node ${nodeId}:`, err);
                        }
                    }

                    updateNode(nodeId, updates);
                }
            }
        } catch (error) {
            console.error(`[Recovery] Error checking legacy status for node ${nodeId}:`, error);
        }
    }, [updateNode]);

    const checkStatus = useCallback(async (nodeId: string) => {
        try {
            const node = nodesRef.current.find(n => n.id === nodeId);

            if (node?.taskId) {
                const task = await getTask(node.taskId);
                if (await applyTaskStatus(nodeId, task)) {
                    return;
                }
            }

            if (node?.status === NodeStatus.LOADING) {
                const { task } = await getTaskByNodeId(nodeId, workflowId);
                if (task && await applyTaskStatus(nodeId, task)) {
                    return;
                }
            }

            await checkLegacyStatus(nodeId);
        } catch (error) {
            console.error(`[Recovery] Error checking task status for node ${nodeId}:`, error);
            await checkLegacyStatus(nodeId);
        }
    }, [applyTaskStatus, checkLegacyStatus, workflowId]); // nodes accessed via ref

    // Track loading node IDs for stable dependency
    const loadingNodeIds = nodes
        .filter(n => n.status === NodeStatus.LOADING || n.taskId)
        .map(n => n.id)
        .join(',');

    useEffect(() => {
        if (!loadingNodeIds) return;

        const nodeIds = loadingNodeIds.split(',');

        // Check each loading node every 10 seconds
        const checkAll = () => {
            nodeIds.forEach(nodeId => checkStatus(nodeId));
        };

        checkAll(); // Initial check

        const interval = setInterval(checkAll, 10000); // Check every 10s

        return () => clearInterval(interval);
    }, [loadingNodeIds, checkStatus]); // Stable string dependency instead of nodes array
};

