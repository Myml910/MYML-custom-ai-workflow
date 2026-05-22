/**
 * useImageNodeHandlers.ts
 *
 * Handles Image node menu actions:
 * - Image to Image
 * - Image to Video
 * - Image Editor
 * - Change Angle
 *
 * Change Angle uses the existing T8 GPT Image 2 Edit image task path.
 */

import React from 'react';
import { NodeData, NodeType, NodeStatus, type ImageQuality } from '../types';
import {
    buildCameraAngleTaskInput,
    CAMERA_ANGLE_DISPLAY_MODEL,
    CAMERA_ANGLE_IMAGE_MODEL
} from '../services/cameraAngleService';
import { createImageTask, waitForImageTaskCompletion } from '../services/generationService';
import { removeImageBackground } from '../services/mattingService';
import { getCompatibleImageModelId, normalizeImageQuality } from '../config/imageModels';

// ============================================================================
// TYPES
// ============================================================================

interface UseImageNodeHandlersOptions {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
    onGenerateNode?: (nodeId: string) => void;
    workflowId?: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const DEFAULT_GAP = 100;
const DEFAULT_NODE_WIDTH = 340;

function getNextNodePosition(sourceNode: NodeData) {
    return {
        x: sourceNode.x + DEFAULT_NODE_WIDTH + DEFAULT_GAP,
        y: sourceNode.y
    };
}

function buildCameraAngleNodePrompt(settings: NonNullable<NodeData['angleSettings']>) {
    const parts: string[] = [];

    parts.push(`Camera angle test with GPT Image 2`);
    parts.push(`rotation=${settings.rotation} degrees`);
    parts.push(`tilt=${settings.tilt} degrees`);
    parts.push(`zoom=${settings.zoom}`);

    if (settings.wideAngle) {
        parts.push('wideAngle=true');
    }

    return parts.join(', ');
}

function normalizeAngleSettings(settings: NonNullable<NodeData['angleSettings']> & { scale?: number }) {
    return {
        rotation: settings.rotation,
        tilt: settings.tilt,
        zoom: settings.zoom ?? settings.scale ?? 0,
        wideAngle: settings.wideAngle
    };
}

function hasNoAngleChange(settings: NonNullable<NodeData['angleSettings']>) {
    return settings.rotation === 0 &&
        settings.tilt === 0 &&
        settings.zoom === 0 &&
        !settings.wideAngle;
}

// ============================================================================
// HOOK
// ============================================================================

export const useImageNodeHandlers = ({
    nodes,
    setNodes,
    setSelectedNodeIds,
    onGenerateNode,
    workflowId
}: UseImageNodeHandlersOptions) => {
    /**
     * Handle "Image to Image" - creates a new Image node connected to this Image node.
     * The current node becomes the input parent for the new Image node.
     */
    const handleImageToImage = React.useCallback((nodeId: string) => {
        const imageNode = nodes.find(n => n.id === nodeId);
        if (!imageNode) return;

        const newNodeId = crypto.randomUUID();
        const position = getNextNodePosition(imageNode);

        const newImageNode: NodeData = {
            id: newNodeId,
            type: NodeType.IMAGE,
            x: position.x,
            y: position.y,
            prompt: '',
            status: NodeStatus.IDLE,
            model: 'Banana Pro',
            imageModel: getCompatibleImageModelId(imageNode.imageModel, 1),
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: imageNode.resolution || 'Auto',
            quality: imageNode.quality,
            parentIds: [nodeId]
        };

        setNodes(prev => [...prev, newImageNode]);
        setSelectedNodeIds([newNodeId]);
    }, [nodes, setNodes, setSelectedNodeIds]);

    /**
     * Handle "Image to Video" - creates a new Video node connected to this Image node.
     * The current image node becomes the input frame for the new Video node.
     */
    const handleImageToVideo = React.useCallback((nodeId: string) => {
        const imageNode = nodes.find(n => n.id === nodeId);
        if (!imageNode) return;

        const newNodeId = crypto.randomUUID();
        const position = getNextNodePosition(imageNode);

        const newVideoNode: NodeData = {
            id: newNodeId,
            type: NodeType.VIDEO,
            x: position.x,
            y: position.y,
            prompt: '',
            status: NodeStatus.IDLE,
            model: 'Banana Pro',
            aspectRatio: 'Auto',
            resolution: 'Auto',
            parentIds: [nodeId]
        };

        setNodes(prev => [...prev, newVideoNode]);
        setSelectedNodeIds([newNodeId]);
    }, [nodes, setNodes, setSelectedNodeIds]);

    /**
     * Handle "Image to Editor" - creates a new Image Editor node connected to this Image node.
     * The current image node becomes the input for the Image Editor node.
     */
    const handleImageToEditor = React.useCallback((nodeId: string) => {
        const imageNode = nodes.find(n => n.id === nodeId);
        if (!imageNode) return;

        const newNodeId = crypto.randomUUID();
        const position = getNextNodePosition(imageNode);

        const newEditorNode: NodeData = {
            id: newNodeId,
            type: NodeType.IMAGE_EDITOR,
            x: position.x,
            y: position.y,
            prompt: '',
            status: NodeStatus.IDLE,
            model: 'Image Editor',
            imageModel: getCompatibleImageModelId(imageNode.imageModel, 1),
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: imageNode.resolution || 'Auto',
            quality: imageNode.quality,
            parentIds: [nodeId]
        };

        setNodes(prev => [...prev, newEditorNode]);
        setSelectedNodeIds([newNodeId]);
    }, [nodes, setNodes, setSelectedNodeIds]);

    /**
     * Handle local background removal.
     *
     * Creates a plain Image result node while keeping the original image node unchanged.
     */
    const handleRemoveBackground = React.useCallback(async (nodeId: string) => {
        console.log("[Matting] remove background clicked", nodeId);

        const imageNode = nodes.find(n => n.id === nodeId);
        if (!imageNode || imageNode.type !== NodeType.IMAGE || !imageNode.resultUrl) {
            console.error('[Matting] Missing image node or result URL:', {
                nodeId,
                hasNode: !!imageNode,
                type: imageNode?.type,
                hasResultUrl: !!imageNode?.resultUrl
            });
            return;
        }

        const newNodeId = crypto.randomUUID();
        const position = getNextNodePosition(imageNode);

        const newImageNode: NodeData = {
            id: newNodeId,
            type: NodeType.IMAGE,
            x: position.x,
            y: position.y,
            prompt: '抠除背景',
            status: NodeStatus.LOADING,
            model: 'MYML Matting',
            imageModel: imageNode.imageModel,
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: imageNode.resolution || 'Auto',
            parentIds: [nodeId],
            hideGenerationControls: true
        };

        setNodes(prev => [...prev, newImageNode]);
        setSelectedNodeIds([newNodeId]);

        try {
            const resultUrl = await removeImageBackground(imageNode.resultUrl);

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        status: NodeStatus.SUCCESS,
                        resultUrl,
                        model: 'MYML Matting'
                    }
                    : n
            ));
        } catch (error: any) {
            console.error('[Matting] Remove background error:', error);

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        status: NodeStatus.ERROR,
                        errorMessage: error?.message || 'Local background removal failed.'
                    }
                    : n
            ));
        }
    }, [nodes, setNodes, setSelectedNodeIds]);

    /**
     * Handle "Change Angle Generate".
     *
     * Creates a new CAMERA_ANGLE node immediately in LOADING state,
     * then calls GPT Image 2 through cameraAngleService.
     */
    const handleChangeAngleGenerate = React.useCallback(async (nodeId: string, explicitQuality?: ImageQuality) => {
        const imageNode = nodes.find(n => n.id === nodeId);

        if (!imageNode || !imageNode.angleSettings || !imageNode.resultUrl) {
            console.error('[ChangeAngle] Missing required data:', {
                nodeId,
                hasNode: !!imageNode,
                hasSettings: !!imageNode?.angleSettings,
                hasResultUrl: !!imageNode?.resultUrl
            });
            return;
        }

        const angleSettings = normalizeAngleSettings(imageNode.angleSettings);
        const newNodeId = crypto.randomUUID();
        const position = getNextNodePosition(imageNode);
        const selectedQuality = normalizeImageQuality(explicitQuality || imageNode.quality || 'auto');

        const newCameraAngleNode: NodeData = {
            id: newNodeId,
            type: NodeType.CAMERA_ANGLE,
            x: position.x,
            y: position.y,
            prompt: buildCameraAngleNodePrompt(angleSettings),
            status: NodeStatus.LOADING,

            // Display model metadata for the node.
            model: CAMERA_ANGLE_DISPLAY_MODEL,
            imageModel: CAMERA_ANGLE_IMAGE_MODEL,

            // Keep inherited output settings where possible.
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: 'Auto',
            quality: selectedQuality,

            // Keep graph connection.
            parentIds: [nodeId],

            // Keep angle data so the result can be tweaked again.
            angleSettings,
            angleMode: false
        };

        setNodes(prev => [
            ...prev.map(n =>
                n.id === nodeId
                    ? { ...n, angleMode: false }
                    : n
            ),
            newCameraAngleNode
        ]);

        setSelectedNodeIds([newNodeId]);

        try {
            if (hasNoAngleChange(angleSettings)) {
                console.log('[ChangeAngle] No camera movement requested, returning original image:', {
                    nodeId,
                    newNodeId
                });

                setNodes(prev => prev.map(n =>
                    n.id === newNodeId
                        ? {
                            ...n,
                            status: NodeStatus.SUCCESS,
                            resultUrl: imageNode.resultUrl,
                            prompt: 'No camera movement requested.',
                            model: CAMERA_ANGLE_DISPLAY_MODEL,
                            imageModel: CAMERA_ANGLE_IMAGE_MODEL,
                            taskId: undefined,
                            generationStatus: undefined,
                            progress: undefined,
                            errorMessage: undefined
                        }
                        : n
                ));
                return;
            }

            console.log('[ChangeAngle] Creating T8 GPT Image 2 Edit camera angle task:', {
                nodeId,
                newNodeId,
                angleSettings,
                imageModel: CAMERA_ANGLE_IMAGE_MODEL,
                quality: selectedQuality,
                sourceImageUrl: imageNode.resultUrl
            });

            const taskInput = await buildCameraAngleTaskInput(
                imageNode.resultUrl,
                angleSettings.rotation,
                angleSettings.tilt,
                angleSettings.zoom,
                angleSettings.wideAngle,
                {
                    aspectRatio: newCameraAngleNode.aspectRatio,
                    resolution: newCameraAngleNode.resolution,
                    quality: selectedQuality
                }
            );

            const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
            if (isDev) {
                console.debug('[ChangeAngle] Camera angle task quality payload', {
                    source: 'camera-angle',
                    selectedQuality,
                    payloadQuality: taskInput.quality,
                    nodeId: newNodeId,
                    imageModel: taskInput.imageModel
                });
            }

            const task = await createImageTask({
                nodeId: newNodeId,
                workflowId,
                prompt: taskInput.prompt,
                imageModel: taskInput.imageModel,
                aspectRatio: taskInput.aspectRatio,
                resolution: taskInput.resolution,
                quality: taskInput.quality,
                referenceImages: taskInput.referenceImages,
                source: taskInput.source,
                legacySource: taskInput.source,
                capability: taskInput.capability
            });

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        prompt: taskInput.prompt,
                        status: NodeStatus.LOADING,
                        taskId: task.taskId,
                        generationStatus: task.status,
                        progress: 0,
                        errorMessage: undefined
                    }
                    : n
            ));

            const completedTask = await waitForImageTaskCompletion(task.taskId, {
                onTaskUpdate: (nextTask) => {
                    if (nextTask.status !== 'queued' && nextTask.status !== 'running' && nextTask.status !== 'polling') {
                        return;
                    }

                    setNodes(prev => prev.map(n =>
                        n.id === newNodeId
                            ? {
                                ...n,
                                status: NodeStatus.LOADING,
                                taskId: nextTask.taskId,
                                generationStatus: nextTask.status,
                                progress: nextTask.progress ?? 0,
                                errorMessage: undefined
                            }
                            : n
                    ));
                }
            });

            if (completedTask.status !== 'completed' || !completedTask.resultUrl) {
                throw new Error(completedTask.errorMessage || `Camera angle task ended with status: ${completedTask.status}`);
            }

            console.log('[ChangeAngle] T8 GPT Image 2 Edit camera angle success:', {
                newNodeId,
                taskId: completedTask.taskId,
                provider: completedTask.provider,
                model: completedTask.model
            });

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        status: NodeStatus.SUCCESS,
                        resultUrl: completedTask.resultUrl || undefined,
                        prompt: taskInput.prompt || n.prompt,
                        model: CAMERA_ANGLE_DISPLAY_MODEL,
                        imageModel: CAMERA_ANGLE_IMAGE_MODEL,
                        taskId: undefined,
                        generationStatus: undefined,
                        progress: undefined,
                        errorMessage: undefined
                    }
                    : n
            ));
        } catch (error: any) {
            console.error('[ChangeAngle] T8 GPT Image 2 Edit camera angle error:', error);

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        status: NodeStatus.ERROR,
                        taskId: undefined,
                        generationStatus: 'failed',
                        progress: undefined,
                        errorMessage: error?.message || 'T8 GPT Image 2 camera angle generation failed.'
                    }
                    : n
            ));
        }
    }, [nodes, setNodes, setSelectedNodeIds, workflowId]);

    return {
        handleImageToImage,
        handleImageToVideo,
        handleImageToEditor,
        handleRemoveBackground,
        handleChangeAngleGenerate
    };
};
