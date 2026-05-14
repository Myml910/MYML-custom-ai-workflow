/**
 * useImageEditorSelection.ts
 * 
 * Manages element selection, dragging, and resizing for the image editor.
 * Handles select mode interactions with arrows and other elements.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EditorElement } from '../components/modals/imageEditor/imageEditor.types';

// ============================================================================
// TYPES
// ============================================================================

interface UseImageEditorSelectionProps {
    selectCanvasRef: React.RefObject<HTMLCanvasElement>;
    elements: EditorElement[];
    setElements: React.Dispatch<React.SetStateAction<EditorElement[]>>;
    saveState: () => void;
}

interface UseImageEditorSelectionReturn {
    // State
    isSelectMode: boolean;
    setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
    selectedElementId: string | null;
    setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
    isDraggingElement: boolean;
    isResizing: boolean;
    isMovingElement: boolean;
    resizeHandle: 'start' | 'end' | null;
    // Handlers
    handleSelectMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    handleSelectMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    handleSelectMouseUp: () => void;
    // Helpers
    getElementAtPosition: (x: number, y: number) => EditorElement | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate distance from a point to a line segment
 */
export const pointToLineDistance = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.hypot(px - xx, py - yy);
};

// ============================================================================
// HOOK
// ============================================================================

export const useImageEditorSelection = ({
    selectCanvasRef,
    elements,
    setElements,
    saveState
}: UseImageEditorSelectionProps): UseImageEditorSelectionReturn => {
    // --- State ---
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeHandle, setResizeHandle] = useState<'start' | 'end' | null>(null);

    // --- Refs ---
    const dragStartRef = useRef<{
        x: number;
        y: number;
        elementStartX: number;
        elementStartY: number;
        elementEndX: number;
        elementEndY: number;
        elementType: EditorElement['type'];
        mode: 'move' | 'resize';
    } | null>(null);
    const hasSavedDragStateRef = useRef(false);
    const pendingDragRef = useRef<{ dx: number; dy: number } | null>(null);
    const dragFrameRef = useRef<number | null>(null);
    const activeDragElementIdRef = useRef<string | null>(null);

    // --- Helper Functions ---

    /**
     * Find element at given position (hit detection)
     */
    const getElementAtPosition = useCallback((x: number, y: number): EditorElement | null => {
        // Check elements in reverse order (top elements first)
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (el.type === 'arrow') {
                // Check distance from line
                const dist = pointToLineDistance(x, y, el.startX, el.startY, el.endX, el.endY);
                if (dist < 10) return el;
                // Check start and end points
                if (Math.hypot(x - el.startX, y - el.startY) < 15) return el;
                if (Math.hypot(x - el.endX, y - el.endY) < 15) return el;
            } else if (el.type === 'text') {
                // Hit detection for text elements using bounding box
                // Approximate text bounds (width based on character count, height based on font size)
                const approxWidth = el.text.length * (el.fontSize * 0.6);
                const approxHeight = el.fontSize * 1.2;
                if (x >= el.x && x <= el.x + approxWidth && y >= el.y && y <= el.y + approxHeight) {
                    return el;
                }
            } else if (el.type === 'shape') {
                const minX = Math.min(el.x, el.x + el.width);
                const maxX = Math.max(el.x, el.x + el.width);
                const minY = Math.min(el.y, el.y + el.height);
                const maxY = Math.max(el.y, el.y + el.height);

                if (el.shape === 'rectangle') {
                    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                        return el;
                    }
                } else {
                    const rx = Math.abs(el.width) / 2;
                    const ry = Math.abs(el.height) / 2;
                    if (rx > 0 && ry > 0) {
                        const cx = minX + rx;
                        const cy = minY + ry;
                        const normalized = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
                        if (normalized <= 1) {
                            return el;
                        }
                    }
                }
            }
        }
        return null;
    }, [elements]);

    /**
     * Get resize handle at position (arrows only)
     */
    const getResizeHandleAtPosition = useCallback((
        x: number,
        y: number,
        element: EditorElement
    ): 'start' | 'end' | null => {
        if (element.type !== 'arrow') return null;
        if (Math.hypot(x - element.startX, y - element.startY) < 12) return 'start';
        if (Math.hypot(x - element.endX, y - element.endY) < 12) return 'end';
        return null;
    }, []);

    const isFiniteNumber = (value: number) => Number.isFinite(value);

    const applyDragUpdate = useCallback((dx: number, dy: number) => {
        const dragStart = dragStartRef.current;
        const activeElementId = activeDragElementIdRef.current || selectedElementId;
        if (!dragStart || !activeElementId || !isFiniteNumber(dx) || !isFiniteNumber(dy)) return;

        setElements(prev => prev.map(el => {
            if (el.id !== activeElementId) return el;

            if (dragStart.mode === 'resize' && resizeHandle && el.type === 'arrow') {
                if (resizeHandle === 'start') {
                    const startX = dragStart.elementStartX + dx;
                    const startY = dragStart.elementStartY + dy;
                    if (!isFiniteNumber(startX) || !isFiniteNumber(startY)) return el;
                    return { ...el, startX, startY };
                }

                const endX = dragStart.elementEndX + dx;
                const endY = dragStart.elementEndY + dy;
                if (!isFiniteNumber(endX) || !isFiniteNumber(endY)) return el;
                return { ...el, endX, endY };
            }

            if (dragStart.mode !== 'move') return el;

            if (el.type === 'arrow') {
                const startX = dragStart.elementStartX + dx;
                const startY = dragStart.elementStartY + dy;
                const endX = dragStart.elementEndX + dx;
                const endY = dragStart.elementEndY + dy;
                if (![startX, startY, endX, endY].every(isFiniteNumber)) return el;
                return { ...el, startX, startY, endX, endY };
            }

            if (el.type === 'text' || el.type === 'shape') {
                const x = dragStart.elementStartX + dx;
                const y = dragStart.elementStartY + dy;
                if (!isFiniteNumber(x) || !isFiniteNumber(y)) return el;
                return { ...el, x, y };
            }

            return el;
        }));
    }, [resizeHandle, selectedElementId, setElements]);

    const flushPendingDrag = useCallback(() => {
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
        }

        const pendingDrag = pendingDragRef.current;
        pendingDragRef.current = null;
        if (pendingDrag) {
            applyDragUpdate(pendingDrag.dx, pendingDrag.dy);
        }
    }, [applyDragUpdate]);

    // --- Mouse Handlers ---

    const handleSelectMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isSelectMode) return;
        const canvas = selectCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on resize handle of selected element (arrows only)
        if (selectedElementId) {
            const selectedEl = elements.find(el => el.id === selectedElementId);
            if (selectedEl && selectedEl.type === 'arrow') {
                const handle = getResizeHandleAtPosition(x, y, selectedEl);
                if (handle) {
                    setIsResizing(true);
                    setResizeHandle(handle);
                    hasSavedDragStateRef.current = false;
                    activeDragElementIdRef.current = selectedEl.id;
                    dragStartRef.current = {
                        x, y,
                        elementStartX: selectedEl.startX,
                        elementStartY: selectedEl.startY,
                        elementEndX: selectedEl.endX,
                        elementEndY: selectedEl.endY,
                        elementType: selectedEl.type,
                        mode: 'resize'
                    };
                    return;
                }
            }
        }

        // Check if clicking on an element
        const element = getElementAtPosition(x, y);
        if (element) {
            setSelectedElementId(element.id);
            setIsDraggingElement(true);
            hasSavedDragStateRef.current = false;
            activeDragElementIdRef.current = element.id;
            if (element.type === 'arrow') {
                dragStartRef.current = {
                    x, y,
                    elementStartX: element.startX,
                    elementStartY: element.startY,
                    elementEndX: element.endX,
                    elementEndY: element.endY,
                    elementType: element.type,
                    mode: 'move'
                };
            } else if (element.type === 'text') {
                dragStartRef.current = {
                    x, y,
                    elementStartX: element.x,
                    elementStartY: element.y,
                    elementEndX: element.x, // Not used for text
                    elementEndY: element.y, // Not used for text
                    elementType: element.type,
                    mode: 'move'
                };
            } else if (element.type === 'shape') {
                dragStartRef.current = {
                    x, y,
                    elementStartX: element.x,
                    elementStartY: element.y,
                    elementEndX: element.x + element.width,
                    elementEndY: element.y + element.height,
                    elementType: element.type,
                    mode: 'move'
                };
            }
        } else {
            setSelectedElementId(null);
        }
    }, [isSelectMode, selectCanvasRef, selectedElementId, elements, getResizeHandleAtPosition, getElementAtPosition, saveState]);

    const handleSelectMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isSelectMode) return;
        const canvas = selectCanvasRef.current;
        if (!canvas || !dragStartRef.current || !activeDragElementIdRef.current) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dx = x - dragStartRef.current.x;
        const dy = y - dragStartRef.current.y;
        if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) return;

        const hasMeaningfulMovement = Math.abs(dx) >= 1 || Math.abs(dy) >= 1;

        if (hasMeaningfulMovement && !hasSavedDragStateRef.current) {
            saveState();
            hasSavedDragStateRef.current = true;
        }

        if (!hasMeaningfulMovement) return;

        pendingDragRef.current = { dx, dy };
        if (dragFrameRef.current === null) {
            dragFrameRef.current = requestAnimationFrame(() => {
                dragFrameRef.current = null;
                const pendingDrag = pendingDragRef.current;
                pendingDragRef.current = null;
                if (pendingDrag) {
                    applyDragUpdate(pendingDrag.dx, pendingDrag.dy);
                }
            });
        }
    }, [isSelectMode, selectCanvasRef, selectedElementId, saveState, applyDragUpdate]);

    const handleSelectMouseUp = useCallback(() => {
        flushPendingDrag();
        setIsDraggingElement(false);
        setIsResizing(false);
        setResizeHandle(null);
        dragStartRef.current = null;
        activeDragElementIdRef.current = null;
        hasSavedDragStateRef.current = false;
    }, [flushPendingDrag]);

    useEffect(() => {
        const handleEndDrag = () => handleSelectMouseUp();

        window.addEventListener('mouseup', handleEndDrag);
        window.addEventListener('pointerup', handleEndDrag);
        window.addEventListener('blur', handleEndDrag);

        return () => {
            window.removeEventListener('mouseup', handleEndDrag);
            window.removeEventListener('pointerup', handleEndDrag);
            window.removeEventListener('blur', handleEndDrag);
            if (dragFrameRef.current !== null) {
                cancelAnimationFrame(dragFrameRef.current);
                dragFrameRef.current = null;
            }
        };
    }, [handleSelectMouseUp]);

    return {
        isSelectMode,
        setIsSelectMode,
        selectedElementId,
        setSelectedElementId,
        isDraggingElement,
        isResizing,
        isMovingElement: isDraggingElement || isResizing,
        resizeHandle,
        handleSelectMouseDown,
        handleSelectMouseMove,
        handleSelectMouseUp,
        getElementAtPosition
    };
};
