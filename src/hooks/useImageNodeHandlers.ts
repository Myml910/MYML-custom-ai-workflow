/**
 * useImageNodeHandlers.ts
 *
 * Handles Image node menu actions:
 * - Image to Image
 * - Image to Video
 * - Image Editor
 * - Change Angle
 *
 * Change Angle now uses the existing third-party GPT Image 2 image generation path.
 */

import React from 'react';
import { NodeData, NodeType, NodeStatus } from '../types';
import { generateCameraAngle } from '../services/cameraAngleService';

// ============================================================================
// TYPES
// ============================================================================

interface UseImageNodeHandlersOptions {
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
    onGenerateNode?: (nodeId: string) => void;
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

// ============================================================================
// HOOK
// ============================================================================

export const useImageNodeHandlers = ({
    nodes,
    setNodes,
    setSelectedNodeIds,
    onGenerateNode
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
            imageModel: imageNode.imageModel || 'custom-image-gpt-image-2',
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: imageNode.resolution || 'Auto',
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
            imageModel: imageNode.imageModel || 'custom-image-gpt-image-2',
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: imageNode.resolution || 'Auto',
            parentIds: [nodeId]
        };

        setNodes(prev => [...prev, newEditorNode]);
        setSelectedNodeIds([newNodeId]);
    }, [nodes, setNodes, setSelectedNodeIds]);

    /**
     * Handle "Change Angle Generate".
     *
     * Creates a new CAMERA_ANGLE node immediately in LOADING state,
     * then calls GPT Image 2 through cameraAngleService.
     */
    const handleChangeAngleGenerate = React.useCallback(async (nodeId: string) => {
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

        const newCameraAngleNode: NodeData = {
            id: newNodeId,
            type: NodeType.CAMERA_ANGLE,
            x: position.x,
            y: position.y,
            prompt: buildCameraAngleNodePrompt(angleSettings),
            status: NodeStatus.LOADING,

            // Display model metadata for the node.
            model: 'GPT Image 2 Camera Angle',
            imageModel: 'custom-image-gpt-image-2',

            // Keep inherited output settings where possible.
            aspectRatio: imageNode.aspectRatio || 'Auto',
            resolution: imageNode.resolution || '2k',

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
            console.log('[ChangeAngle] Calling GPT Image 2 camera angle generation:', {
                nodeId,
                newNodeId,
                angleSettings,
                sourceImageUrl: imageNode.resultUrl
            });

            const result = await generateCameraAngle(
                imageNode.resultUrl,
                angleSettings.rotation,
                angleSettings.tilt,
                angleSettings.zoom,
                angleSettings.wideAngle
            );

            console.log('[ChangeAngle] GPT Image 2 camera angle success:', {
                newNodeId,
                inferenceTimeMs: result.inferenceTimeMs,
                provider: result.provider
            });

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        status: NodeStatus.SUCCESS,
                        resultUrl: result.imageUrl,
                        prompt: result.prompt || n.prompt,
                        model: 'GPT Image 2 Camera Angle',
                        imageModel: 'custom-image-gpt-image-2'
                    }
                    : n
            ));
        } catch (error: any) {
            console.error('[ChangeAngle] GPT Image 2 camera angle error:', error);

            setNodes(prev => prev.map(n =>
                n.id === newNodeId
                    ? {
                        ...n,
                        status: NodeStatus.ERROR,
                        errorMessage: error?.message || 'GPT Image 2 camera angle generation failed.'
                    }
                    : n
            ));
        }
    }, [nodes, setNodes, setSelectedNodeIds]);

    return {
        handleImageToImage,
        handleImageToVideo,
        handleImageToEditor,
        handleChangeAngleGenerate
    };
};
