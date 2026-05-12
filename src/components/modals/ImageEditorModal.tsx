/**
 * ImageEditorModal.tsx
 * 
 * Full-screen image editor modal with drawing tools, model selection,
 * and image generation controls. Refactored into modular components.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { t } from '../../i18n/translations';

// Types and constants
import {
    ImageEditorModalProps,
    EditorElement,
    IMAGE_MODELS
} from './imageEditor/imageEditor.types';

// Custom hooks
import { useImageEditorHistory } from '../../hooks/useImageEditorHistory';
import { useImageEditorDrawing } from '../../hooks/useImageEditorDrawing';
import { useImageEditorArrows, drawArrowWithStyle } from '../../hooks/useImageEditorArrows';
import { uploadAsset } from '../../services/assetService';
import { useImageEditorSelection } from '../../hooks/useImageEditorSelection';
import { useImageEditorText } from '../../hooks/useImageEditorText';
import { useImageEditorCrop } from '../../hooks/useImageEditorCrop';
import { useImageEditorShapes, drawShapeElement } from '../../hooks/useImageEditorShapes';
import { NodeStatus } from '../../types';
import { EditorShell, EditorStatusBar, EditorTopBar, ToolButton } from '../ui';

// Sub-components
import { DrawingToolbar } from './imageEditor/DrawingToolbar';
import { BottomToolbar } from './imageEditor/BottomToolbar';
import { MarkupToolbar } from './imageEditor/MarkupToolbar';
import { PromptBar } from './imageEditor/PromptBar';

// ============================================================================
// COMPONENT
// ============================================================================

const isFiniteNumber = (value: number) => Number.isFinite(value);

const isRenderableElement = (element: EditorElement) => {
    if (element.type === 'arrow') {
        return [
            element.startX,
            element.startY,
            element.endX,
            element.endY,
            element.lineWidth
        ].every(isFiniteNumber);
    }

    if (element.type === 'text') {
        return [
            element.x,
            element.y,
            element.fontSize
        ].every(isFiniteNumber);
    }

    return [
        element.x,
        element.y,
        element.width,
        element.height,
        element.strokeWidth
    ].every(isFiniteNumber);
};

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
    isOpen,
    nodeId,
    imageUrl,
    initialPrompt,
    initialModel,
    initialAspectRatio,
    initialResolution,
    initialElements,
    initialCanvasData,
    initialCanvasSize,
    initialBackgroundUrl,
    canvasTheme = 'dark',
    language = 'zh',
    onClose,
    onGenerate,
    onUpdate
}) => {
    // --- Prompt & Generation State ---
    const [prompt, setPrompt] = useState(initialPrompt || '');
    const [batchCount, setBatchCount] = useState(4);
    const [isGenerating, setIsGenerating] = useState(false);
    const [promptError, setPromptError] = useState('');
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showAspectDropdown, setShowAspectDropdown] = useState(false);
    const [showResolutionDropdown, setShowResolutionDropdown] = useState(false);

    // --- Model State ---
    const [selectedModel, setSelectedModel] = useState(initialModel || 'custom-image-gpt-image-2');
    const [selectedAspectRatio, setSelectedAspectRatio] = useState(initialAspectRatio || 'Auto');
    const [selectedResolution, setSelectedResolution] = useState(initialResolution || '1K');

    // --- Element State (persisted to node) ---
    const [elements, setElements] = useState<EditorElement[]>(initialElements || []);

    // --- Image State (for crop undo/redo) ---
    const [localImageUrl, setLocalImageUrl] = useState<string | undefined>(imageUrl);
    const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // --- Theme / Language ---
    const isDark = canvasTheme === 'dark';

    const editorText = {
        download: t(language, 'download'),
        exit: t(language, 'exitImageEditor'),
        apply: t(language, 'apply'),
        noImageLoaded: t(language, 'noImageLoaded'),
        enterEditPromptError: t(language, 'enterEditPromptError'),
        editingImageAlt: t(language, 'editingImageAlt'),
    };

    const accentBgClass = 'bg-[var(--myml-accent)] hover:bg-[var(--myml-accent-hover)] text-[var(--myml-accent-contrast)]';
    const canvasAreaClass = 'bg-[var(--myml-editor-canvas)]';
    const emptyCanvasClass = 'bg-[var(--myml-surface-floating)] border border-[var(--myml-border-default)] text-[var(--myml-text-muted)]';

    const selectionColor = isDark ? '#D8FF00' : '#65a30d';
    const selectionHandleStroke = isDark ? '#050505' : '#ffffff';
    const editorTargetKey = `${nodeId}:${initialBackgroundUrl || imageUrl || ''}`;
    const historyResetKey = `${isOpen ? 'open' : 'closed'}:${nodeId || 'no-node'}`;

    // --- Refs ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const arrowCanvasRef = useRef<HTMLCanvasElement>(null);
    const shapeCanvasRef = useRef<HTMLCanvasElement>(null);
    const selectCanvasRef = useRef<HTMLCanvasElement>(null);
    const textCanvasRef = useRef<HTMLCanvasElement>(null);
    const elementsCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const imageViewportRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);
    const isMountedRef = useRef(false);
    const isOpenRef = useRef(isOpen);
    const isGeneratingRef = useRef(false);
    const editorTargetKeyRef = useRef(editorTargetKey);
    const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autosaveRequestSeqRef = useRef(0);
    const lastSavedElementsRef = useRef<string>('');
    const scaledElementsKeyRef = useRef<string | null>(null);
    const displaySizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const targetChanged = editorTargetKeyRef.current !== editorTargetKey;
        isOpenRef.current = isOpen;
        editorTargetKeyRef.current = editorTargetKey;
        if (!isOpen) {
            isGeneratingRef.current = false;
            setIsGenerating(false);
        }
        if (!isOpen || targetChanged) {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
                autosaveTimeoutRef.current = null;
            }
            autosaveRequestSeqRef.current += 1;
            displaySizeRef.current = { width: 0, height: 0 };
            setDisplaySize({ width: 0, height: 0 });
        }
    }, [editorTargetKey, isOpen]);

    // --- Custom Hooks ---

    const {
        historyStack,
        redoStack,
        saveState,
        handleUndo,
        handleRedo
    } = useImageEditorHistory({
        canvasRef,
        elements,
        setElements,
        setSelectedElementId: (id) => selection.setSelectedElementId(id),
        isOpen,
        resetKey: historyResetKey,
        imageUrl: localImageUrl,
        setImageUrl: setLocalImageUrl,
        onImageUrlChange: (url) => onUpdate(nodeId, { resultUrl: url, status: NodeStatus.SUCCESS })
    });

    const drawing = useImageEditorDrawing({
        canvasRef,
        imageRef,
        saveState
    });

    const arrows = useImageEditorArrows({
        arrowCanvasRef,
        imageRef,
        saveState,
        setElements
    });

    const selection = useImageEditorSelection({
        selectCanvasRef,
        elements,
        setElements,
        saveState
    });

    const text = useImageEditorText({
        imageRef,
        saveState,
        setElements
    });

    const shapes = useImageEditorShapes({
        shapeCanvasRef,
        imageRef,
        saveState,
        setElements,
        strokeColor: drawing.brushColor,
        strokeWidth: drawing.brushWidth
    });

    const syncCanvasToDisplaySize = useCallback((
        canvas: HTMLCanvasElement | null,
        width: number,
        height: number,
        preserveContent = false
    ) => {
        if (!canvas || width <= 0 || height <= 0) return;
        if (canvas.width === width && canvas.height === height) return;

        if (preserveContent && canvas.width > 0 && canvas.height > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.drawImage(canvas, 0, 0);
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(tempCanvas, 0, 0, width, height);
            }
            return;
        }

        canvas.width = width;
        canvas.height = height;
    }, []);

    const syncOverlayCanvases = useCallback((width: number, height: number) => {
        syncCanvasToDisplaySize(canvasRef.current, width, height, true);
        syncCanvasToDisplaySize(arrowCanvasRef.current, width, height);
        syncCanvasToDisplaySize(shapeCanvasRef.current, width, height);
        syncCanvasToDisplaySize(elementsCanvasRef.current, width, height);
        syncCanvasToDisplaySize(textCanvasRef.current, width, height);
        syncCanvasToDisplaySize(selectCanvasRef.current, width, height);
    }, [syncCanvasToDisplaySize]);

    const scaleElementsToDisplaySize = useCallback((sourceElements: EditorElement[], sourceSize: { width: number; height: number }, targetSize: { width: number; height: number }): EditorElement[] => {
        if (sourceSize.width <= 0 || sourceSize.height <= 0 || targetSize.width <= 0 || targetSize.height <= 0) {
            return sourceElements;
        }

        if (sourceSize.width === targetSize.width && sourceSize.height === targetSize.height) {
            return sourceElements;
        }

        const scaleX = targetSize.width / sourceSize.width;
        const scaleY = targetSize.height / sourceSize.height;
        const fontScale = (scaleX + scaleY) / 2;

        return sourceElements.map(element => {
            if (element.type === 'arrow') {
                return {
                    ...element,
                    startX: element.startX * scaleX,
                    startY: element.startY * scaleY,
                    endX: element.endX * scaleX,
                    endY: element.endY * scaleY,
                    lineWidth: element.lineWidth * fontScale
                };
            }

            if (element.type === 'text') {
                return {
                    ...element,
                    x: element.x * scaleX,
                    y: element.y * scaleY,
                    fontSize: element.fontSize * fontScale
                };
            }

            return {
                ...element,
                x: element.x * scaleX,
                y: element.y * scaleY,
                width: element.width * scaleX,
                height: element.height * scaleY,
                strokeWidth: element.strokeWidth * fontScale
            };
        });
    }, []);

    const updateDisplaySizeFromImage = useCallback(() => {
        const img = imageRef.current;
        if (!img) return;

        const width = Math.round(img.clientWidth);
        const height = Math.round(img.clientHeight);
        if (width <= 0 || height <= 0) return;

        const previousSize = displaySizeRef.current;
        const hasPreviousSize = previousSize.width > 0 && previousSize.height > 0;
        const sizeChanged = previousSize.width !== width || previousSize.height !== height;

        syncOverlayCanvases(width, height);

        if (hasPreviousSize && sizeChanged) {
            setElements(prev => scaleElementsToDisplaySize(prev, previousSize, { width, height }));
        }

        if (sizeChanged) {
            displaySizeRef.current = { width, height };
            setDisplaySize({ width, height });
        }
    }, [scaleElementsToDisplaySize, syncOverlayCanvases]);

    // Helper to generate composite image (Background + Brush + Elements)
    const generateCompositeImage = useCallback(async () => {
        if (!imageRef.current) return null;

        const width = imageRef.current.clientWidth;
        const height = imageRef.current.clientHeight;

        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // 1. Draw Background Image
        if (localImageUrl) {
            await new Promise<void>((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = localImageUrl;
            });
        }

        // 2. Draw Brush Layer
        if (canvasRef.current) {
            ctx.drawImage(canvasRef.current, 0, 0, width, height);
        }

        // 3. Draw Elements (Arrows/Text)
        elements.filter(isRenderableElement).forEach(element => {
            try {
                if (element.type === 'arrow') {
                    drawArrowWithStyle(
                        ctx,
                        element.startX,
                        element.startY,
                        element.endX,
                        element.endY,
                        element.color,
                        element.lineWidth
                    );
                } else if (element.type === 'text') {
                    ctx.font = `${element.fontSize}px ${element.fontFamily}`;
                    ctx.fillStyle = element.color;
                    ctx.textBaseline = 'top';
                    ctx.fillText(element.text, element.x, element.y);
                } else if (element.type === 'shape') {
                    drawShapeElement(ctx, element);
                }
            } catch (error) {
                console.error('Failed to render image editor element into composite:', error);
            }
        });

        return canvas.toDataURL('image/png');
    }, [elements, localImageUrl]);

    const hasCanvasContent = useCallback((canvas: HTMLCanvasElement | null) => {
        if (!canvas || canvas.width === 0 || canvas.height === 0) return false;

        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;

            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            for (let index = 3; index < data.length; index += 4) {
                if (data[index] > 0) return true;
            }
        } catch (error) {
            console.error("Failed to inspect image editor canvas:", error);
            return false;
        }

        return false;
    }, []);

    const persistCompositeToNode = useCallback(async (force = false) => {
        const canvas = canvasRef.current;
        if (!nodeId) return;
        if (!force && !isOpenRef.current) return;

        const requestTargetKey = editorTargetKeyRef.current;

        const hasBrushContent = hasCanvasContent(canvas);
        const hasElementContent = elements.length > 0;

        if (!force && !hasBrushContent && !hasElementContent) {
            return;
        }

        const canvasData = canvas ? canvas.toDataURL('image/png') : undefined;

        let savedCanvasDataUrl = canvasData;
        let savedCompositeUrl = '';
        let savedBackgroundUrl = localImageUrl || '';

        try {
            if (canvasData && hasBrushContent) {
                savedCanvasDataUrl = await uploadAsset(canvasData, 'image', 'brush-layer');
            }

            const compositeDataUrl = await generateCompositeImage();
            if (compositeDataUrl) {
                savedCompositeUrl = await uploadAsset(compositeDataUrl, 'image', 'composite-result');
            }

            // 3. Upload Background if it's base64 (clean crop or initial upload)
            if (localImageUrl && localImageUrl.startsWith('data:')) {
                savedBackgroundUrl = await uploadAsset(localImageUrl, 'image', 'clean-background');
                // Update local state to use the new URL locally too
                if (isMountedRef.current && editorTargetKeyRef.current === requestTargetKey) {
                    setLocalImageUrl(savedBackgroundUrl);
                }
            }
        } catch (error) {
            console.error("Failed to upload assets during save:", error);
            // Fallback: continue with what we have (base64)
            if (!savedCompositeUrl) {
                const fallbackComposite = await generateCompositeImage();
                if (fallbackComposite) savedCompositeUrl = fallbackComposite;
            }
        }

        const updates: any = {
            editorElements: elements
        };

        if (savedCanvasDataUrl) {
            updates.editorCanvasData = savedCanvasDataUrl;
        }

        if (canvas && canvas.width > 0 && canvas.height > 0) {
            updates.editorCanvasSize = { width: canvas.width, height: canvas.height };
        } else if (imageRef.current) {
            updates.editorCanvasSize = {
                width: imageRef.current.clientWidth,
                height: imageRef.current.clientHeight
            };
        }

        if (savedCompositeUrl) {
            updates.resultUrl = savedCompositeUrl;
            updates.status = NodeStatus.SUCCESS;
            if (savedBackgroundUrl) {
                updates.editorBackgroundUrl = savedBackgroundUrl;
            }
        }

        if (!isMountedRef.current || editorTargetKeyRef.current !== requestTargetKey) {
            return;
        }

        if (!force && !isOpenRef.current) {
            return;
        }

        onUpdate(nodeId, updates);

        if (updates.resultUrl) {
            console.log('[ImageEditor] persisted composite result', {
                nodeId,
                hasResultUrl: true,
                status: NodeStatus.SUCCESS
            });
        }

        await Promise.resolve();
    }, [nodeId, onUpdate, generateCompositeImage, localImageUrl, elements, hasCanvasContent]);

    // Helper to persist canvas brush data AND composite image to node
    const saveCanvasToNode = useCallback(async () => {
        await persistCompositeToNode();
    }, [persistCompositeToNode]);

    const cancelPendingAutosave = useCallback(() => {
        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
            autosaveTimeoutRef.current = null;
        }
        autosaveRequestSeqRef.current += 1;
    }, []);

    const handleCloseClick = useCallback(async () => {
        cancelPendingAutosave();
        await persistCompositeToNode(true);
        onClose();
    }, [cancelPendingAutosave, persistCompositeToNode, onClose]);

    const handleCropApply = async (croppedImageDataUrl: string) => {
        cancelPendingAutosave();
        const requestTargetKey = editorTargetKeyRef.current;

        // Update local preview immediately
        setLocalImageUrl(croppedImageDataUrl);
        lastSavedElementsRef.current = JSON.stringify([]);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        setElements([]);
        selection.setSelectedElementId(null);
        text.setEditingTextId(null);
        text.setIsTextMode(false);
        text.setShowTextSettings(false);

        try {
            // Upload the cropped image
            const savedCropUrl = await uploadAsset(croppedImageDataUrl, 'image', 'crop-result');

            if (!isMountedRef.current || !isOpenRef.current || editorTargetKeyRef.current !== requestTargetKey) {
                return;
            }

            // Update local state with server URL
            setLocalImageUrl(savedCropUrl);

            // Save clean crop as background and initial result
            onUpdate(nodeId, {
                resultUrl: savedCropUrl,
                status: NodeStatus.SUCCESS,
                editorBackgroundUrl: savedCropUrl,
                editorElements: [],
                editorCanvasData: undefined,
                editorCanvasSize: displaySizeRef.current.width > 0 && displaySizeRef.current.height > 0
                    ? displaySizeRef.current
                    : undefined
            });
        } catch (error) {
            console.error("Failed to upload crop:", error);
            if (!isMountedRef.current || !isOpenRef.current || editorTargetKeyRef.current !== requestTargetKey) {
                return;
            }
            // Fallback
            onUpdate(nodeId, {
                resultUrl: croppedImageDataUrl,
                status: NodeStatus.SUCCESS,
                editorBackgroundUrl: croppedImageDataUrl,
                editorElements: [],
                editorCanvasData: undefined,
                editorCanvasSize: displaySizeRef.current.width > 0 && displaySizeRef.current.height > 0
                    ? displaySizeRef.current
                    : undefined
            });
        }
    };

    const crop = useImageEditorCrop({
        imageRef,
        saveState,
        onCropApply: handleCropApply,
        getCropSourceDataUrl: generateCompositeImage
    });

    const clearPrimaryModes = useCallback(() => {
        drawing.setIsDrawingMode(false);
        drawing.setShowToolSettings(false);
        selection.setIsSelectMode(false);
        selection.setSelectedElementId(null);
        text.setIsTextMode(false);
        text.setShowTextSettings(false);
        crop.setIsCropMode(false);
    }, [crop, drawing, selection, text]);

    const handleSelectArrowMarkup = useCallback(() => {
        const nextActive = !arrows.isArrowMode;
        clearPrimaryModes();
        shapes.setIsShapeMode(false);
        arrows.setIsArrowMode(nextActive);
    }, [arrows, clearPrimaryModes, shapes]);

    const handleSelectShapeMarkup = useCallback((shapeType: 'rectangle' | 'ellipse') => {
        const nextActive = !(shapes.isShapeMode && shapes.shapeType === shapeType);
        clearPrimaryModes();
        arrows.setIsArrowMode(false);
        shapes.setShapeType(shapeType);
        shapes.setIsShapeMode(nextActive);
    }, [arrows, clearPrimaryModes, shapes]);

    const currentModel = IMAGE_MODELS.find(m => m.id === selectedModel) || IMAGE_MODELS[0];
    const hasInputImage = !!imageUrl;

    // --- Effects ---

    // Track if we've initialized for this node to prevent re-initialization loops
    const initializedNodeIdRef = useRef<string | null>(null);
    const hasInitializedRef = useRef(false);

    // Reset state when modal opens with a NEW node (not when our own updates change initialElements)
    useEffect(() => {
        // Only initialize if modal is open AND we haven't initialized for this node yet
        if (!isOpen) {
            // Reset initialization flag when modal closes
            hasInitializedRef.current = false;
            initializedNodeIdRef.current = null;
            return;
        }

        // Skip if we've already initialized for this node
        if (hasInitializedRef.current && initializedNodeIdRef.current === nodeId) {
            return;
        }

        // Initialize state from props
        setPrompt(initialPrompt || '');
        setSelectedModel(initialModel || 'custom-image-gpt-image-2');
        setSelectedAspectRatio(initialAspectRatio || 'Auto');
        setSelectedResolution(initialResolution || '1K');
        // Use initialBackgroundUrl (clean image) if available, otherwise imageUrl (might be composite or input)
        setLocalImageUrl(initialBackgroundUrl || imageUrl);
        setElements(initialElements || []);
        lastSavedElementsRef.current = JSON.stringify(initialElements || []);
        scaledElementsKeyRef.current = null;

        hasInitializedRef.current = true;
        initializedNodeIdRef.current = nodeId;
    }, [isOpen, nodeId, initialPrompt, initialModel, initialAspectRatio, initialResolution, imageUrl, initialElements, initialBackgroundUrl]);

    useEffect(() => {
        if (!isOpen || !imageRef.current) return;

        updateDisplaySizeFromImage();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateDisplaySizeFromImage);
            return () => window.removeEventListener('resize', updateDisplaySizeFromImage);
        }

        const observer = new ResizeObserver(updateDisplaySizeFromImage);
        observer.observe(imageRef.current);

        return () => observer.disconnect();
    }, [isOpen, localImageUrl, updateDisplaySizeFromImage]);

    useEffect(() => {
        if (!isOpen || !initialElements || initialElements.length === 0 || !initialCanvasSize) return;
        if (displaySize.width <= 0 || displaySize.height <= 0) return;

        const scaleKey = `${nodeId}:${initialBackgroundUrl || imageUrl || ''}:${initialCanvasSize.width}x${initialCanvasSize.height}`;
        if (scaledElementsKeyRef.current === scaleKey) return;

        const scaledElements = scaleElementsToDisplaySize(initialElements, initialCanvasSize, displaySize);
        scaledElementsKeyRef.current = scaleKey;
        setElements(scaledElements);
        lastSavedElementsRef.current = JSON.stringify(scaledElements);
    }, [displaySize, imageUrl, initialBackgroundUrl, initialCanvasSize, initialElements, isOpen, nodeId, scaleElementsToDisplaySize]);

    // Restore brush canvas data from node when modal opens
    useEffect(() => {
        if (!isOpen || !initialCanvasData || !canvasRef.current || !imageRef.current) return;

        const canvas = canvasRef.current;
        const img = imageRef.current;

        // Wait for image to be ready
        const restoreCanvas = () => {
            canvas.width = img.clientWidth;
            canvas.height = img.clientHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const image = new Image();
            image.onload = () => {
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            };
            image.src = initialCanvasData;
        };

        if (img.complete) {
            restoreCanvas();
        } else {
            img.addEventListener('load', restoreCanvas, { once: true });
        }
    }, [isOpen, initialCanvasData]);

    // Persist elements to node when committed edits change.
    useEffect(() => {
        if (!isOpen || !nodeId || !hasInitializedRef.current) return;
        if (selection.isMovingElement || text.editingTextId) return;

        const elementsJson = JSON.stringify(elements);
        if (elementsJson === lastSavedElementsRef.current) {
            return;
        }

        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
        }

        const requestTargetKey = editorTargetKeyRef.current;
        const requestSeq = ++autosaveRequestSeqRef.current;

        autosaveTimeoutRef.current = setTimeout(() => {
            autosaveTimeoutRef.current = null;
            const saveUpdate = async () => {
                const updates: any = { editorElements: elements };

                const compositeUrl = await generateCompositeImage();
                if (compositeUrl) {
                    try {
                        const uploadedCompositeUrl = await uploadAsset(compositeUrl, 'image', 'composite-result');
                        updates.resultUrl = uploadedCompositeUrl;
                        updates.status = NodeStatus.SUCCESS;
                    } catch (e) {
                        console.error("Failed to upload composite update:", e);
                        updates.resultUrl = compositeUrl;
                        updates.status = NodeStatus.SUCCESS;
                    }

                    if (imageRef.current) {
                        updates.editorCanvasSize = {
                            width: imageRef.current.clientWidth,
                            height: imageRef.current.clientHeight
                        };
                    }
                }

                if (
                    !isMountedRef.current ||
                    !isOpenRef.current ||
                    editorTargetKeyRef.current !== requestTargetKey ||
                    autosaveRequestSeqRef.current !== requestSeq
                ) {
                    return;
                }

                lastSavedElementsRef.current = elementsJson;
                onUpdate(nodeId, updates);
            };

            void saveUpdate();
        }, 700);

        return () => {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
                autosaveTimeoutRef.current = null;
            }
        };
    }, [elements, isOpen, nodeId, onUpdate, generateCompositeImage, selection.isMovingElement, text.editingTextId, editorTargetKey]);

    // Redraw elements canvas when elements change (for undo/redo support)
    useEffect(() => {
        const canvas = elementsCanvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) return;

        // Ensure canvas size matches image
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and redraw all elements
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        elements.filter(isRenderableElement).forEach(element => {
            try {
                if (element.type === 'arrow') {
                    drawArrowWithStyle(
                        ctx,
                        element.startX,
                        element.startY,
                        element.endX,
                        element.endY,
                        element.color,
                        element.lineWidth
                    );
                } else if (element.type === 'text' && element.id !== text.editingTextId) {
                    ctx.font = `${element.fontSize}px ${element.fontFamily}`;
                    ctx.fillStyle = element.color;
                    ctx.textBaseline = 'top';
                    ctx.fillText(element.text, element.x, element.y);
                } else if (element.type === 'shape') {
                    drawShapeElement(ctx, element);
                }
            } catch (error) {
                console.error('Failed to redraw image editor element:', error);
            }
        });
    }, [elements, text.editingTextId]);

    // --- Handlers ---

    const handleGenerateClick = async () => {
        if (isGeneratingRef.current || !isOpenRef.current) return;

        const finalPrompt = prompt.trim();

        if (!finalPrompt) {
            setPromptError(editorText.enterEditPromptError);
            return;
        }

        isGeneratingRef.current = true;
        setPromptError('');
        setIsGenerating(true);

        try {
            const compositeImageDataUrl = await generateCompositeImage();

            onUpdate(nodeId, {
                prompt: finalPrompt,
                imageModel: selectedModel,
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution
            });
            await onGenerate(nodeId, finalPrompt, batchCount, {
                imageModel: selectedModel,
                aspectRatio: selectedAspectRatio,
                resolution: selectedResolution,
                compositeImageDataUrl: compositeImageDataUrl || undefined
            });
        } finally {
            isGeneratingRef.current = false;
            if (isMountedRef.current && isOpenRef.current) {
                setIsGenerating(false);
            }
        }
    };

    const handlePromptChange = (nextPrompt: string) => {
        setPrompt(nextPrompt);
        if (promptError) {
            setPromptError('');
        }
    };

    const handleDownloadClick = async () => {
        const compositeImageDataUrl = await generateCompositeImage();
        const downloadUrl = compositeImageDataUrl || localImageUrl;
        if (!downloadUrl) return;

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `image-editor-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleModelChange = (modelId: string) => {
        setSelectedModel(modelId);
        const newModel = IMAGE_MODELS.find(m => m.id === modelId);

        if (newModel?.aspectRatios && !newModel.aspectRatios.includes(selectedAspectRatio)) {
            setSelectedAspectRatio('Auto');
        }

        onUpdate(nodeId, { imageModel: modelId });
        setShowModelDropdown(false);
    };

    const handleAspectChange = (ratio: string) => {
        setSelectedAspectRatio(ratio);
        onUpdate(nodeId, { aspectRatio: ratio });
        setShowAspectDropdown(false);
    };

    const handleResolutionChange = (res: string) => {
        setSelectedResolution(res);
        onUpdate(nodeId, { resolution: res });
        setShowResolutionDropdown(false);
    };

    // --- Early Return ---
    if (!isOpen) return null;

    // --- Render ---
    return (
        <EditorShell>
            {/* Top Bar */}
            <EditorTopBar>
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[var(--myml-radius-control)] border border-[var(--myml-accent-muted)] bg-[var(--myml-accent-soft)] text-[var(--myml-accent)]">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold leading-none text-[var(--myml-text-primary)]">
                            {t(language, 'imageEditor')}
                        </span>
                        <span className="text-[10px] font-medium leading-none text-[var(--myml-text-faint)]">
                            {currentModel.name} / {selectedAspectRatio} / {selectedResolution}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <EditorStatusBar>
                        {elements.length} marks
                    </EditorStatusBar>
                    {/* Download Button */}
                    <ToolButton
                        onClick={handleDownloadClick}
                        size="lg"
                        title={editorText.download}
                        aria-label={editorText.download}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </ToolButton>

                    {/* Exit Button */}
                    <ToolButton
                        onClick={handleCloseClick}
                        size="lg"
                        title={editorText.exit}
                        aria-label={editorText.exit}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </ToolButton>
                </div>
            </EditorTopBar>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Drawing Sub-Toolbar */}
                {drawing.isDrawingMode && (
                    <DrawingToolbar
                        canvasTheme={canvasTheme}
                        language={language}
                        drawingTool={drawing.drawingTool}
                        setDrawingTool={drawing.setDrawingTool}
                        brushWidth={drawing.brushWidth}
                        setBrushWidth={drawing.setBrushWidth}
                        eraserWidth={drawing.eraserWidth}
                        setEraserWidth={drawing.setEraserWidth}
                        brushColor={drawing.brushColor}
                        setBrushColor={drawing.setBrushColor}
                        showToolSettings={drawing.showToolSettings}
                        setShowToolSettings={drawing.setShowToolSettings}
                        presetColors={drawing.presetColors}
                    />
                )}

                <div className="w-0"></div>

                {/* Canvas Area - constrained to fit within available space */}
                <div
                    className={`flex-1 flex items-center justify-center p-4 overflow-hidden min-h-0 ${canvasAreaClass}`}
                    style={{
                        backgroundImage: 'linear-gradient(var(--myml-editor-grid) 1px, transparent 1px), linear-gradient(90deg, var(--myml-editor-grid) 1px, transparent 1px)',
                        backgroundSize: '28px 28px'
                    }}
                >
                    {localImageUrl ? (
                        <div
                            ref={imageContainerRef}
                            className="relative max-w-full max-h-full flex items-center justify-center rounded-[var(--myml-radius-panel)] border border-[var(--myml-border-subtle)] bg-[var(--myml-surface-base)] shadow-[var(--myml-shadow-panel)]"
                            style={{ maxHeight: 'calc(100vh - 350px)' }}
                        >
                            <MarkupToolbar
                                canvasTheme={canvasTheme}
                                language={language}
                                activeTool={arrows.isArrowMode ? 'arrow' : shapes.isShapeMode ? shapes.shapeType : null}
                                filled={shapes.filled}
                                onSelectArrow={handleSelectArrowMarkup}
                                onSelectRectangle={() => handleSelectShapeMarkup('rectangle')}
                                onSelectEllipse={() => handleSelectShapeMarkup('ellipse')}
                                onToggleFilled={() => shapes.setFilled(!shapes.filled)}
                            />

                            <div
                                ref={imageViewportRef}
                                className="relative inline-flex max-h-full max-w-full items-center justify-center rounded-[calc(var(--myml-radius-panel)-4px)]"
                            >
                            <img
                                ref={imageRef}
                                src={localImageUrl}
                                alt={editorText.editingImageAlt}
                                className="block max-w-full max-h-full rounded-[calc(var(--myml-radius-panel)-4px)] object-contain"
                                style={{ maxHeight: 'calc(100vh - 350px)' }}
                                onLoad={updateDisplaySizeFromImage}
                            />

                            {/* Main Canvas - For persistent brush drawings */}
                            <canvas
                                ref={canvasRef}
                                className={`absolute inset-0 ${drawing.isDrawingMode ? '' : 'pointer-events-none'}`}
                                style={drawing.isDrawingMode ? {
                                    cursor: drawing.drawingTool === 'eraser'
                                        ? `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.eraserWidth}" height="${drawing.eraserWidth}" viewBox="0 0 ${drawing.eraserWidth} ${drawing.eraserWidth}"><circle cx="${drawing.eraserWidth / 2}" cy="${drawing.eraserWidth / 2}" r="${drawing.eraserWidth / 2 - 1}" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="1"/></svg>') ${drawing.eraserWidth / 2} ${drawing.eraserWidth / 2}, auto`
                                        : 'crosshair'
                                } : {}}
                                onMouseDown={drawing.isDrawingMode ? drawing.startDrawing : undefined}
                                onMouseMove={drawing.isDrawingMode ? drawing.draw : undefined}
                                onMouseUp={drawing.isDrawingMode ? () => { drawing.stopDrawing(); saveCanvasToNode(); } : undefined}
                                onMouseLeave={drawing.isDrawingMode ? () => { drawing.stopDrawing(); saveCanvasToNode(); } : undefined}
                            />

                            {/* Arrow Canvas Overlay */}
                            {arrows.isArrowMode && (
                                <canvas
                                    ref={arrowCanvasRef}
                                    className="absolute inset-0 cursor-crosshair"
                                    onMouseDown={arrows.startArrow}
                                    onMouseMove={arrows.drawArrowPreview}
                                    onMouseUp={arrows.finishArrow}
                                    onMouseLeave={arrows.finishArrow}
                                />
                            )}

                            {/* Shape Canvas Overlay */}
                            {shapes.isShapeMode && (
                                <canvas
                                    ref={shapeCanvasRef}
                                    className="absolute inset-0 cursor-crosshair"
                                    onMouseDown={shapes.startShape}
                                    onMouseMove={shapes.drawShapePreview}
                                    onMouseUp={shapes.finishShape}
                                    onMouseLeave={shapes.finishShape}
                                />
                            )}

                            {/* Elements Canvas - Renders all stored elements (arrows and text) */}
                            <canvas
                                ref={elementsCanvasRef}
                                className="absolute inset-0 pointer-events-none"
                            />

                            {/* Text Mode Canvas - Click to place text */}
                            {text.isTextMode && (
                                <canvas
                                    ref={(canvas) => {
                                        (textCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
                                        if (canvas && imageRef.current) {
                                            canvas.width = imageRef.current.clientWidth;
                                            canvas.height = imageRef.current.clientHeight;
                                        }
                                    }}
                                    className="absolute inset-0 cursor-text"
                                    onClick={text.handleTextCanvasClick}
                                />
                            )}

                            {/* Text Editing Overlay */}
                            {text.editingTextId && elements.filter(el => el.type === 'text' && el.id === text.editingTextId).map(el => {
                                if (el.type !== 'text') return null;
                                return (
                                    <input
                                        key={el.id}
                                        ref={textInputRef}
                                        type="text"
                                        value={el.text}
                                        onChange={(e) => text.handleTextChange(el.id, e.target.value)}
                                        onBlur={text.handleTextBlur}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.nativeEvent.isComposing) return;
                                            if (e.key === 'Enter' || e.key === 'Escape') {
                                                text.handleTextBlur();
                                            }
                                        }}
                                        autoFocus
                                        className={`absolute bg-transparent border-2 outline-none ${
                                            isDark
                                                ? 'border-[#D8FF00] text-neutral-100'
                                                : 'border-lime-500 text-neutral-900'
                                        }`}
                                        style={{
                                            left: el.x,
                                            top: el.y,
                                            fontSize: el.fontSize,
                                            fontFamily: el.fontFamily,
                                            color: el.color,
                                            minWidth: '50px',
                                            padding: '2px 4px'
                                        }}
                                    />
                                );
                            })}

                            {/* Select Mode Canvas */}
                            {selection.isSelectMode && (
                                <canvas
                                    ref={(canvas) => {
                                        (selectCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
                                        if (canvas && imageRef.current) {
                                            canvas.width = imageRef.current.clientWidth;
                                            canvas.height = imageRef.current.clientHeight;
                                        }
                                    }}
                                    className="absolute inset-0"
                                    style={{ cursor: selection.isDraggingElement || selection.isResizing ? 'grabbing' : 'default' }}
                                    onMouseDown={selection.handleSelectMouseDown}
                                    onMouseMove={selection.handleSelectMouseMove}
                                    onMouseUp={selection.handleSelectMouseUp}
                                    onMouseLeave={selection.handleSelectMouseUp}
                                />
                            )}

                            {/* Selection UI - Shows handles for selected element */}
                            {selection.isSelectMode && selection.selectedElementId && (
                                <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                                    {elements.filter(el => el.id === selection.selectedElementId && isRenderableElement(el)).map(el => {
                                        if (el.type === 'arrow') {
                                            return (
                                                <g key={el.id}>
                                                    <line
                                                        x1={el.startX}
                                                        y1={el.startY}
                                                        x2={el.endX}
                                                        y2={el.endY}
                                                        stroke={selectionColor}
                                                        strokeWidth="5"
                                                        strokeDasharray="5,5"
                                                        opacity="0.6"
                                                    />
                                                    <circle
                                                        cx={el.startX}
                                                        cy={el.startY}
                                                        r="8"
                                                        fill={selectionColor}
                                                        stroke={selectionHandleStroke}
                                                        strokeWidth="2"
                                                        style={{ pointerEvents: 'auto', cursor: 'grab' }}
                                                    />
                                                    <circle
                                                        cx={el.endX}
                                                        cy={el.endY}
                                                        r="8"
                                                        fill={selectionColor}
                                                        stroke={selectionHandleStroke}
                                                        strokeWidth="2"
                                                        style={{ pointerEvents: 'auto', cursor: 'grab' }}
                                                    />
                                                </g>
                                            );
                                        }
                                        if (el.type === 'shape') {
                                            const minX = Math.min(el.x, el.x + el.width);
                                            const minY = Math.min(el.y, el.y + el.height);
                                            const width = Math.abs(el.width);
                                            const height = Math.abs(el.height);

                                            return el.shape === 'rectangle' ? (
                                                <rect
                                                    key={el.id}
                                                    x={minX}
                                                    y={minY}
                                                    width={width}
                                                    height={height}
                                                    fill="none"
                                                    stroke={selectionColor}
                                                    strokeWidth="2"
                                                    strokeDasharray="5,5"
                                                    opacity="0.8"
                                                />
                                            ) : (
                                                <ellipse
                                                    key={el.id}
                                                    cx={minX + width / 2}
                                                    cy={minY + height / 2}
                                                    rx={width / 2}
                                                    ry={height / 2}
                                                    fill="none"
                                                    stroke={selectionColor}
                                                    strokeWidth="2"
                                                    strokeDasharray="5,5"
                                                    opacity="0.8"
                                                />
                                            );
                                        }
                                        // Text selection box (future enhancement)
                                        return null;
                                    })}
                                </svg>
                            )}

                            {/* Crop Overlay */}
                            {crop.isCropMode && crop.cropRect && (
                                <div
                                    className="absolute inset-0"
                                    style={{ cursor: crop.isDragging ? 'grabbing' : 'default' }}
                                    onMouseDown={crop.handleCropMouseDown}
                                >
                                    {/* Dimmed overlay outside crop area */}
                                    <svg className="absolute inset-0" style={{ width: '100%', height: '100%' }}>
                                        <defs>
                                            <mask id="cropMask">
                                                <rect width="100%" height="100%" fill="white" />
                                                <rect
                                                    x={crop.cropRect.x}
                                                    y={crop.cropRect.y}
                                                    width={crop.cropRect.width}
                                                    height={crop.cropRect.height}
                                                    fill="black"
                                                />
                                            </mask>
                                        </defs>
                                        <rect
                                            width="100%"
                                            height="100%"
                                            fill="rgba(0, 0, 0, 0.6)"
                                            mask="url(#cropMask)"
                                        />

                                        {/* Crop selection border */}
                                        <rect
                                            x={crop.cropRect.x}
                                            y={crop.cropRect.y}
                                            width={crop.cropRect.width}
                                            height={crop.cropRect.height}
                                            fill="none"
                                            stroke={isDark ? '#ffffff' : '#111827'}
                                            strokeWidth="2"
                                            strokeDasharray="5,5"
                                        />

                                        {/* Corner handles */}
                                        <rect
                                            x={crop.cropRect.x - 5}
                                            y={crop.cropRect.y - 5}
                                            width="10"
                                            height="10"
                                            fill={isDark ? '#050505' : '#ffffff'}
                                            stroke={selectionColor}
                                            strokeWidth="2"
                                            style={{ cursor: 'nwse-resize' }}
                                        />
                                        <rect
                                            x={crop.cropRect.x + crop.cropRect.width - 5}
                                            y={crop.cropRect.y - 5}
                                            width="10"
                                            height="10"
                                            fill={isDark ? '#050505' : '#ffffff'}
                                            stroke={selectionColor}
                                            strokeWidth="2"
                                            style={{ cursor: 'nesw-resize' }}
                                        />
                                        <rect
                                            x={crop.cropRect.x - 5}
                                            y={crop.cropRect.y + crop.cropRect.height - 5}
                                            width="10"
                                            height="10"
                                            fill={isDark ? '#050505' : '#ffffff'}
                                            stroke={selectionColor}
                                            strokeWidth="2"
                                            style={{ cursor: 'nesw-resize' }}
                                        />
                                        <rect
                                            x={crop.cropRect.x + crop.cropRect.width - 5}
                                            y={crop.cropRect.y + crop.cropRect.height - 5}
                                            width="10"
                                            height="10"
                                            fill={isDark ? '#050505' : '#ffffff'}
                                            stroke={selectionColor}
                                            strokeWidth="2"
                                            style={{ cursor: 'nwse-resize' }}
                                        />
                                    </svg>

                                    {/* Crop Action Buttons */}
                                    <div
                                        className="absolute flex gap-2"
                                        style={{
                                            left: crop.cropRect.x + crop.cropRect.width / 2,
                                            top: crop.cropRect.y + crop.cropRect.height + 16,
                                            transform: 'translateX(-50%)'
                                        }}
                                    >
                                        <button
                                            onClick={(e) => { e.stopPropagation(); crop.cancelCrop(); }}
                                            className={`h-9 px-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${
                                                isDark
                                                    ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                                                    : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
                                            }`}
                                        >
                                            {t(language, 'cancel')}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); crop.applyCrop(); }}
                                            className={`h-9 px-3 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${accentBgClass}`}
                                        >
                                            {editorText.apply}
                                        </button>
                                    </div>
                                </div>
                            )}
                            </div>
                        </div>
                    ) : (
                        <div className={`w-[600px] h-[400px] rounded-lg flex items-center justify-center ${emptyCanvasClass}`}>
                            <span>{editorText.noImageLoaded}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Floating Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full max-w-6xl px-4 pointer-events-none">
                {/* Floating Tools Palette */}
                <BottomToolbar
                    canvasTheme={canvasTheme}
                    language={language}
                    isSelectMode={selection.isSelectMode}
                    setIsSelectMode={selection.setIsSelectMode}
                    isDrawingMode={drawing.isDrawingMode}
                    setIsDrawingMode={drawing.setIsDrawingMode}
                    setIsArrowMode={arrows.setIsArrowMode}
                    setIsShapeMode={shapes.setIsShapeMode}
                    isTextMode={text.isTextMode}
                    setIsTextMode={text.setIsTextMode}
                    isCropMode={crop.isCropMode}
                    setIsCropMode={crop.setIsCropMode}
                    onCropModeEnter={crop.initializeCropRect}
                    setShowToolSettings={drawing.setShowToolSettings}
                    setSelectedElementId={selection.setSelectedElementId}
                    setDrawingTool={drawing.setDrawingTool}
                    setShowTextSettings={text.setShowTextSettings}
                    historyStackLength={historyStack.length}
                    redoStackLength={redoStack.length}
                    handleUndo={handleUndo}
                    handleRedo={handleRedo}
                />

                {/* Prompt Bar */}
                <PromptBar
                    canvasTheme={canvasTheme}
                    language={language}
                    prompt={prompt}
                    setPrompt={handlePromptChange}
                    selectedModel={selectedModel}
                    onModelChange={handleModelChange}
                    showModelDropdown={showModelDropdown}
                    setShowModelDropdown={setShowModelDropdown}
                    selectedAspectRatio={selectedAspectRatio}
                    onAspectChange={handleAspectChange}
                    showAspectDropdown={showAspectDropdown}
                    setShowAspectDropdown={setShowAspectDropdown}
                    selectedResolution={selectedResolution}
                    onResolutionChange={handleResolutionChange}
                    showResolutionDropdown={showResolutionDropdown}
                    setShowResolutionDropdown={setShowResolutionDropdown}
                    batchCount={batchCount}
                    setBatchCount={setBatchCount}
                    onGenerate={handleGenerateClick}
                    hasInputImage={hasInputImage}
                    isGenerating={isGenerating}
                    promptError={promptError}
                />
            </div>
        </EditorShell>
    );
};
