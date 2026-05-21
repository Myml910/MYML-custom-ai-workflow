/**
 * useNodeDragging.ts
 * 
 * Custom hook for managing node dragging functionality.
 * Handles pointer events for dragging nodes around the canvas.
 */

import React, { useEffect, useRef, useState } from 'react';
import { NodeData, Viewport } from '../types';

interface DragNode {
    id: string;
}

type UpdateNodes = (updater: (prev: NodeData[]) => NodeData[]) => void;

interface PendingNodeDrag {
    dx: number;
    dy: number;
    nodeIds: string[];
    onUpdateNodes: UpdateNodes;
}

export const useNodeDragging = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const dragNodeRef = useRef<DragNode | null>(null);
    const isPanning = useRef<boolean>(false);
    const pendingNodeDragRef = useRef<PendingNodeDrag | null>(null);
    const nodeDragFrameRef = useRef<number | null>(null);
    const [isDragging, setIsDragging] = useState<boolean>(false);

    const applyPendingNodeDrag = () => {
        const pendingDrag = pendingNodeDragRef.current;
        pendingNodeDragRef.current = null;
        nodeDragFrameRef.current = null;

        if (!pendingDrag || (pendingDrag.dx === 0 && pendingDrag.dy === 0)) return;

        const nodeIdsToMove = new Set(pendingDrag.nodeIds);
        pendingDrag.onUpdateNodes(prev => prev.map(n => {
            if (nodeIdsToMove.has(n.id)) {
                return { ...n, x: n.x + pendingDrag.dx, y: n.y + pendingDrag.dy };
            }

            return n;
        }));
    };

    const scheduleNodeDragUpdate = (
        dx: number,
        dy: number,
        nodeIds: string[],
        onUpdateNodes: UpdateNodes
    ) => {
        const pendingDrag = pendingNodeDragRef.current;

        pendingNodeDragRef.current = pendingDrag
            ? {
                dx: pendingDrag.dx + dx,
                dy: pendingDrag.dy + dy,
                nodeIds,
                onUpdateNodes
            }
            : { dx, dy, nodeIds, onUpdateNodes };

        if (nodeDragFrameRef.current !== null) return;

        nodeDragFrameRef.current = window.requestAnimationFrame(applyPendingNodeDrag);
    };

    const flushPendingNodeDrag = () => {
        if (nodeDragFrameRef.current !== null) {
            window.cancelAnimationFrame(nodeDragFrameRef.current);
        }

        applyPendingNodeDrag();
    };

    useEffect(() => () => {
        if (nodeDragFrameRef.current !== null) {
            window.cancelAnimationFrame(nodeDragFrameRef.current);
        }

        pendingNodeDragRef.current = null;
        nodeDragFrameRef.current = null;
    }, []);

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Starts node dragging
     * @param e - Pointer event
     * @param id - Node ID to drag
     * @param onSelect - Callback to select the node
     */
    const handleNodePointerDown = (
        e: React.PointerEvent,
        id: string,
        onSelect?: (id: string) => void
    ) => {
        e.stopPropagation();
        dragNodeRef.current = { id };
        setIsDragging(true);

        // Select the node
        if (onSelect) {
            onSelect(id);
        }

        if (e.target instanceof HTMLElement) {
            e.target.setPointerCapture(e.pointerId);
        }
    };

    /**
     * Updates node position during drag
     * Returns true if node was dragged, false otherwise
     */
    const updateNodeDrag = (
        e: React.PointerEvent,
        viewport: Viewport,
        onUpdateNodes: UpdateNodes,
        selectedNodeIds: string[] = []
    ): boolean => {
        if (!dragNodeRef.current) return false;

        const nodeId = dragNodeRef.current.id;
        const zoomAdjustedDx = e.movementX / viewport.zoom;
        const zoomAdjustedDy = e.movementY / viewport.zoom;

        // If dragging a selected node, move all selected nodes
        const nodesToMove = selectedNodeIds.includes(nodeId) && selectedNodeIds.length > 1
            ? selectedNodeIds
            : [nodeId];

        scheduleNodeDragUpdate(zoomAdjustedDx, zoomAdjustedDy, nodesToMove, onUpdateNodes);

        return true;
    };

    /**
     * Ends node dragging
     */
    const endNodeDrag = () => {
        flushPendingNodeDrag();
        dragNodeRef.current = null;
        setIsDragging(false);
    };

    /**
     * Starts canvas panning
     */
    const startPanning = (e: React.PointerEvent) => {
        isPanning.current = true;
        if (e.target instanceof HTMLElement) {
            e.target.setPointerCapture(e.pointerId);
        }
    };

    /**
     * Updates canvas pan position
     * Returns true if panning, false otherwise
     */
    const updatePanning = (
        e: React.PointerEvent,
        onUpdateViewport: (updater: (prev: Viewport) => Viewport) => void
    ): boolean => {
        if (!isPanning.current) return false;

        onUpdateViewport(prev => ({
            ...prev,
            x: prev.x + e.movementX,
            y: prev.y + e.movementY
        }));

        return true;
    };

    /**
     * Ends canvas panning
     */
    const endPanning = () => {
        isPanning.current = false;
    };

    /**
     * Releases pointer capture
     */
    const releasePointerCapture = (e: React.PointerEvent) => {
        if (e.target instanceof HTMLElement && e.target.hasPointerCapture(e.pointerId)) {
            try {
                e.target.releasePointerCapture(e.pointerId);
            } catch (err) {
                // Ignore errors
            }
        }
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        handleNodePointerDown,
        updateNodeDrag,
        endNodeDrag,
        startPanning,
        updatePanning,
        endPanning,
        isDragging,
        isPanning: isPanning.current,
        releasePointerCapture
    };
};
