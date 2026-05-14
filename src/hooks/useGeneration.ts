/**
 * useGeneration.ts
 * 
 * Custom hook for handling AI content generation (images and videos).
 * Manages generation state, API calls, and error handling.
 */

import type { Dispatch, SetStateAction } from 'react';
import { NodeData, NodeType, NodeStatus } from '../types';
import type { Language } from '../i18n/translations';
import { generateImage, generateVideo } from '../services/generationService';
import { generateLocalImage } from '../services/localModelService';
import { extractVideoLastFrame } from '../utils/videoHelpers';
import { getEffectiveImageReference } from '../utils/imageReferences';

const MAX_IMAGE_REFERENCES = 6;
const MIN_IMAGE_GENERATION_COUNT = 1;
const MAX_IMAGE_GENERATION_COUNT = 4;
const CANDIDATE_X_OFFSET = 500;
const CANDIDATE_Y_STEP = 460;

interface UseGenerationProps {
    nodes: NodeData[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
    setNodes?: Dispatch<SetStateAction<NodeData[]>>;
    setSelectedNodeIds?: Dispatch<SetStateAction<string[]>>;
    language?: Language;
}

export const useGeneration = ({ nodes, updateNode, setNodes, setSelectedNodeIds, language = 'en' }: UseGenerationProps) => {
    // ============================================================================
    // HELPERS
    // ============================================================================

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
     * Detect the actual aspect ratio of an image
     * @param imageUrl - URL or base64 of the image
     * @returns Promise with resultAspectRatio (exact) and aspectRatio (closest standard)
     */
    const getImageAspectRatio = (imageUrl: string): Promise<{ resultAspectRatio: string; aspectRatio: string }> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const resultAspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
                const aspectRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
                resolve({ resultAspectRatio, aspectRatio });
            };
            img.onerror = () => {
                resolve({ resultAspectRatio: '16/9', aspectRatio: '16:9' });
            };
            img.src = imageUrl;
        });
    };

    const getCombinedPrompt = (node: NodeData, allNodes: NodeData[]): string => {
        const textNodePrompts = (node.parentIds || [])
            .map(pid => allNodes.find(n => n.id === pid))
            .filter(n => n?.type === NodeType.TEXT && n.prompt)
            .map(n => n!.prompt);

        return [...textNodePrompts, node.prompt].filter(Boolean).join('\n\n');
    };

    const isPromptOptional = (node: NodeData): boolean => (
        node.type === NodeType.VIDEO &&
        Boolean(node.videoModel?.startsWith('kling-')) &&
        Boolean(node.parentIds && node.parentIds.length >= 2)
    );

    const clampImageGenerationCount = (count?: number): number => {
        const numericCount = Number.isFinite(count) ? Number(count) : MIN_IMAGE_GENERATION_COUNT;
        return Math.max(MIN_IMAGE_GENERATION_COUNT, Math.min(MAX_IMAGE_GENERATION_COUNT, Math.floor(numericCount)));
    };

    const collectImageReferences = (
        node: NodeData,
        nodesById: Map<string, NodeData>
    ): string[] => {
        const imageBase64s: string[] = [];

        if (node.parentIds && node.parentIds.length > 0) {
            for (const parentId of node.parentIds) {
                if (imageBase64s.length >= MAX_IMAGE_REFERENCES) {
                    break;
                }

                const parent = nodesById.get(parentId);
                const reference = getEffectiveImageReference(parent, nodesById);
                if (reference) {
                    imageBase64s.push(reference.url);
                }
            }
        }

        // Storyboard-generated nodes can carry internal references without connected parent images.
        if (imageBase64s.length === 0 && node.characterReferenceUrls && node.characterReferenceUrls.length > 0) {
            for (const charUrl of node.characterReferenceUrls) {
                if (imageBase64s.length < MAX_IMAGE_REFERENCES) {
                    imageBase64s.push(charUrl);
                }
            }
        }

        return imageBase64s;
    };

    const generateSingleImageNode = async (
        targetNode: NodeData,
        allNodes: NodeData[],
        nodesById: Map<string, NodeData>
    ) => {
        const combinedPrompt = getCombinedPrompt(targetNode, allNodes);
        const imageBase64s = collectImageReferences(targetNode, nodesById);

        const rawResultUrl = await generateImage({
            prompt: combinedPrompt,
            aspectRatio: targetNode.aspectRatio,
            resolution: targetNode.resolution,
            imageBase64: imageBase64s.length > 0 ? imageBase64s : undefined,
            imageModel: targetNode.imageModel,
            nodeId: targetNode.id,
            // Kling V1.5 reference settings
            klingReferenceMode: targetNode.klingReferenceMode,
            klingFaceIntensity: targetNode.klingFaceIntensity,
            klingSubjectIntensity: targetNode.klingSubjectIntensity
        });

        // Add cache-busting parameter to force browser to fetch new image.
        // Backend metadata is keyed by nodeId for recovery.
        const resultUrl = `${rawResultUrl}?t=${Date.now()}`;
        const { resultAspectRatio } = await getImageAspectRatio(resultUrl);

        updateNode(targetNode.id, {
            status: NodeStatus.SUCCESS,
            resultUrl,
            resultAspectRatio,
            // Note: aspectRatio is intentionally NOT updated to preserve user's selection.
            errorMessage: undefined
        });
    };

    const createImageCandidateNodes = (sourceNode: NodeData, count: number, generationStartTime: number): NodeData[] => {
        const inheritedParentIds = sourceNode.parentIds ? [...sourceNode.parentIds] : [];
        const candidateNodes: NodeData[] = [];
        const extraCount = count - 1;
        const startY = sourceNode.y - ((extraCount - 1) * CANDIDATE_Y_STEP) / 2;

        for (let index = 1; index < count; index++) {
            const candidateIndex = index - 1;
            candidateNodes.push({
                id: crypto.randomUUID(),
                type: NodeType.IMAGE,
                x: sourceNode.x + CANDIDATE_X_OFFSET,
                y: startY + (candidateIndex * CANDIDATE_Y_STEP),
                prompt: sourceNode.prompt,
                status: NodeStatus.LOADING,
                model: sourceNode.model,
                imageModel: sourceNode.imageModel,
                aspectRatio: sourceNode.aspectRatio,
                resolution: sourceNode.resolution,
                parentIds: inheritedParentIds,
                title: language === 'zh' ? `\u5019\u9009 ${index + 1}` : `Candidate ${index + 1}`,
                generationCount: 1,
                generationStartTime,
                klingReferenceMode: sourceNode.klingReferenceMode,
                klingFaceIntensity: sourceNode.klingFaceIntensity,
                klingSubjectIntensity: sourceNode.klingSubjectIntensity,
                characterReferenceUrls: sourceNode.characterReferenceUrls ? [...sourceNode.characterReferenceUrls] : undefined
            });
        }

        return candidateNodes;
    };

    const getGenerationErrorMessage = (error: any): string => {
        const msg = error.toString().toLowerCase();
        let errorMessage = error.message || 'Generation failed';

        if (msg.includes('permission_denied') || msg.includes('403')) {
            errorMessage = 'Permission denied. Check API Key configuration.';
        } else if (msg.includes('unable to process input image') || msg.includes('invalid_argument')) {
            errorMessage = 'Input image incompatible. Veo requires: JPEG format, 16:9 or 9:16 aspect ratio. Try a different image or generate without input.';
        }

        return errorMessage;
    };

    // ============================================================================
    // GENERATION HANDLER
    // ============================================================================

    /**
     * Handles content generation for a node
     * Supports image and video generation with parent node chaining
     * 
     * @param id - ID of the node to generate content for
     */
    const handleGenerate = async (id: string) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        const nodesById = new Map(nodes.map(n => [n.id, n]));

        const combinedPrompt = getCombinedPrompt(node, nodes);
        if (!combinedPrompt && !isPromptOptional(node)) return;

        const generationStartTime = Date.now();
        const imageGenerationCount = node.type === NodeType.IMAGE
            ? clampImageGenerationCount(node.generationCount)
            : MIN_IMAGE_GENERATION_COUNT;

        if (node.type === NodeType.IMAGE && imageGenerationCount > 1 && setNodes) {
            const candidateNodes = createImageCandidateNodes(node, imageGenerationCount, generationStartTime);
            const generationNodes = [
                { ...node, status: NodeStatus.LOADING, generationStartTime },
                ...candidateNodes
            ];

            updateNode(id, { status: NodeStatus.LOADING, generationStartTime });
            setNodes(prev => [...prev, ...candidateNodes]);
            setSelectedNodeIds?.([id, ...candidateNodes.map(candidate => candidate.id)]);

            for (const generationNode of generationNodes) {
                try {
                    await generateSingleImageNode(generationNode, [...nodes, ...candidateNodes], nodesById);
                } catch (error: any) {
                    const errorMessage = getGenerationErrorMessage(error);
                    updateNode(generationNode.id, { status: NodeStatus.ERROR, errorMessage });
                    console.error('Generation failed:', error);
                }
            }
            return;
        }

        updateNode(id, { status: NodeStatus.LOADING, generationStartTime });

        try {
            if (node.type === NodeType.IMAGE || node.type === NodeType.IMAGE_EDITOR) {
                await generateSingleImageNode(node, nodes, nodesById);


            } else if (node.type === NodeType.LOCAL_IMAGE_MODEL) {
                // --- LOCAL MODEL GENERATION ---
                // Check if model is selected
                if (!node.localModelId && !node.localModelPath) {
                    updateNode(id, {
                        status: NodeStatus.ERROR,
                        errorMessage: 'No local model selected. Please select a model first.'
                    });
                    return;
                }

                // Get parent images if any
                const imageBase64s: string[] = [];
                if (node.parentIds && node.parentIds.length > 0) {
                    for (const parentId of node.parentIds) {
                        const parent = nodes.find(n => n.id === parentId);
                        if (parent?.type !== NodeType.TEXT && parent?.resultUrl) {
                            imageBase64s.push(parent.resultUrl);
                        }
                    }
                }

                // Call local generation API
                const result = await generateLocalImage({
                    modelId: node.localModelId,
                    modelPath: node.localModelPath,
                    prompt: combinedPrompt,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution || '512'
                });

                if (result.success && result.resultUrl) {
                    // Add cache-busting parameter
                    const resultUrl = `${result.resultUrl}?t=${Date.now()}`;

                    // Detect actual image dimensions
                    const { resultAspectRatio } = await getImageAspectRatio(resultUrl);

                    updateNode(id, {
                        status: NodeStatus.SUCCESS,
                        resultUrl,
                        resultAspectRatio,
                        errorMessage: undefined
                    });
                } else {
                    throw new Error(result.error || 'Local generation failed');
                }

            } else if (node.type === NodeType.VIDEO) {
                // Get first parent image for video generation (start frame)
                let imageBase64: string | undefined;
                let lastFrameBase64: string | undefined;

                // Get non-TEXT parent nodes (image sources only)
                const imageParentIds = node.parentIds?.filter(pid => {
                    const parent = nodes.find(n => n.id === pid);
                    return parent?.type !== NodeType.TEXT;
                }) || [];

                // Check for frame-to-frame mode (explicit or auto-detected from 2+ image parents)
                const hasMultipleInputs = imageParentIds.length >= 2;
                const hasExplicitFrameInputs = node.frameInputs && node.frameInputs.length >= 2;

                // Motion Reference logic (Kling 2.6)
                let motionReferenceUrl: string | undefined;
                let isMotionControl = false;
                if (node.videoModel === 'kling-v2-6') {
                    // Find a parent video node that has a result
                    const videoParent = node.parentIds
                        ?.map(pid => nodes.find(n => n.id === pid))
                        .find(n => n?.type === NodeType.VIDEO && n.resultUrl);

                    if (videoParent) {
                        motionReferenceUrl = videoParent.resultUrl;
                        isMotionControl = true;
                    }
                }

                // Only evaluate as frame-to-frame if NOT in motion control mode
                const isFrameToFrame = !isMotionControl && (node.videoMode === 'frame-to-frame' || hasMultipleInputs || hasExplicitFrameInputs);

                if (isFrameToFrame && imageParentIds.length >= 2) {
                    // Get start and end frames from frameInputs (if user reordered) or default order
                    const parent1 = nodes.find(n => n.id === imageParentIds[0]);
                    const parent2 = nodes.find(n => n.id === imageParentIds[1]);

                    // Check if user has explicitly set frame order
                    if (node.frameInputs && node.frameInputs.length >= 2) {
                        const startFrameInput = node.frameInputs.find(f => f.order === 'start');
                        const endFrameInput = node.frameInputs.find(f => f.order === 'end');

                        if (startFrameInput) {
                            const startNode = nodes.find(n => n.id === startFrameInput.nodeId);
                            if (startNode?.resultUrl) {
                                imageBase64 = startNode.resultUrl;
                            }
                        }

                        if (endFrameInput) {
                            const endNode = nodes.find(n => n.id === endFrameInput.nodeId);
                            if (endNode?.resultUrl) {
                                lastFrameBase64 = endNode.resultUrl;
                            }
                        }
                    } else {
                        // Default: first parent = start, second parent = end
                        if (parent1?.resultUrl) imageBase64 = parent1.resultUrl;
                        if (parent2?.resultUrl) lastFrameBase64 = parent2.resultUrl;
                    }
                } else if (imageParentIds.length > 0) {
                    // Standard mode or Motion Control: get character reference or first parent image
                    if (isMotionControl) {
                        // For Motion Control, look specifically for an IMAGE parent as character reference
                        const characterParent = node.parentIds
                            ?.map(pid => nodes.find(n => n.id === pid))
                            .find(n => n?.type === NodeType.IMAGE && n.resultUrl);

                        if (characterParent?.resultUrl) {
                            imageBase64 = characterParent.resultUrl;
                        }
                    } else {
                        // Standard mode: get first parent image or video last frame
                        // Use imageParentIds (filtered to exclude TEXT nodes) instead of raw parentIds
                        const parent = nodes.find(n => n.id === imageParentIds[0]);

                        if (parent?.type === NodeType.VIDEO && parent.lastFrame) {
                            // Use last frame from parent video
                            imageBase64 = parent.lastFrame;
                        } else if (parent?.resultUrl) {
                            // Use parent image directly
                            imageBase64 = parent.resultUrl;
                        }
                    }
                }

                // Generate video
                const rawResultUrl = await generateVideo({
                    prompt: combinedPrompt,
                    imageBase64,
                    lastFrameBase64,
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    duration: node.videoDuration,
                    videoModel: node.videoModel,
                    motionReferenceUrl,
                    generateAudio: node.generateAudio, // For Kling 2.6 and Veo 3.1 native audio
                    nodeId: id
                });

                // Add cache-busting parameter to force browser to fetch new video
                // (Backend uses nodeId as filename, so URL is the same for regenerated videos)
                const resultUrl = `${rawResultUrl}?t=${Date.now()}`;

                // Extract last frame for chaining
                const lastFrame = await extractVideoLastFrame(resultUrl);

                // Detect video aspect ratio
                let resultAspectRatio: string | undefined;
                let aspectRatio: string | undefined;
                try {
                    const video = document.createElement('video');
                    await new Promise<void>((resolve) => {
                        video.onloadedmetadata = () => {
                            resultAspectRatio = `${video.videoWidth}/${video.videoHeight}`;
                            aspectRatio = getClosestAspectRatio(video.videoWidth, video.videoHeight);
                            resolve();
                        };
                        video.onerror = () => resolve();
                        video.src = resultUrl;
                    });
                } catch (e) {
                    // Ignore errors, use undefined aspect ratio
                }

                updateNode(id, {
                    status: NodeStatus.SUCCESS,
                    resultUrl,
                    resultAspectRatio,
                    aspectRatio,
                    lastFrame,
                    errorMessage: undefined // Clear any previous error
                });


            }
        } catch (error: any) {
            // Handle errors
            const msg = error.toString().toLowerCase();
            let errorMessage = error.message || 'Generation failed';

            if (msg.includes('permission_denied') || msg.includes('403')) {
                errorMessage = 'Permission denied. Check API Key configuration.';
            } else if (msg.includes('unable to process input image') || msg.includes('invalid_argument')) {
                errorMessage = 'Input image incompatible. Veo requires: JPEG format, 16:9 or 9:16 aspect ratio. Try a different image or generate without input.';
            }

            updateNode(id, { status: NodeStatus.ERROR, errorMessage });
            console.error('Generation failed:', error);
        }
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        handleGenerate
    };
};
