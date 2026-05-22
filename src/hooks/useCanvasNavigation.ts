/**
 * useCanvasNavigation.ts
 * 
 * Custom hook for managing canvas viewport, zoom, and pan functionality.
 * Handles mouse wheel zoom, slider zoom, and viewport transformations.
 */

import React, { useState, useRef } from 'react';
import { Viewport, NodeData, NodeType } from '../types';

interface WheelZoomInput {
    deltaY: number;
    clientX: number;
    clientY: number;
    preventDefault?: () => void;
}

export const useCanvasNavigation = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
    const [isWheelInteracting, setIsWheelInteracting] = useState(false);
    const canvasRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<Viewport>(viewport);
    const pendingViewportRef = useRef<Viewport | null>(null);
    const viewportFrameRef = useRef<number | null>(null);
    const wheelInteractingRef = useRef(false);
    const wheelIdleTimerRef = useRef<number | null>(null);

    React.useEffect(() => {
        viewportRef.current = viewport;
    }, [viewport]);

    React.useEffect(() => () => {
        if (viewportFrameRef.current !== null) {
            window.cancelAnimationFrame(viewportFrameRef.current);
        }

        if (wheelIdleTimerRef.current !== null) {
            window.clearTimeout(wheelIdleTimerRef.current);
        }

        viewportFrameRef.current = null;
        pendingViewportRef.current = null;
        wheelIdleTimerRef.current = null;
    }, []);

    const setViewport = React.useCallback((update: React.SetStateAction<Viewport>) => {
        const baseViewport = pendingViewportRef.current ?? viewportRef.current;
        const nextViewport = typeof update === 'function'
            ? (update as (prev: Viewport) => Viewport)(baseViewport)
            : update;

        pendingViewportRef.current = nextViewport;
        viewportRef.current = nextViewport;

        if (viewportFrameRef.current !== null) return;

        viewportFrameRef.current = window.requestAnimationFrame(() => {
            viewportFrameRef.current = null;
            const pendingViewport = pendingViewportRef.current;
            pendingViewportRef.current = null;

            if (pendingViewport) {
                setViewportState(pendingViewport);
            }
        });
    }, []);

    const markWheelInteracting = React.useCallback(() => {
        if (!wheelInteractingRef.current) {
            wheelInteractingRef.current = true;
            setIsWheelInteracting(true);
        }

        if (wheelIdleTimerRef.current !== null) {
            window.clearTimeout(wheelIdleTimerRef.current);
        }

        wheelIdleTimerRef.current = window.setTimeout(() => {
            wheelInteractingRef.current = false;
            wheelIdleTimerRef.current = null;
            setIsWheelInteracting(false);
        }, 120);
    }, []);

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    const zoomAtPoint = React.useCallback((
        deltaY: number,
        clientX: number,
        clientY: number,
        hoveredNode?: NodeData
    ) => {
        setViewport(prev => {
            const s = Math.exp(-deltaY * 0.001);
            let targetZoom = prev.zoom * s;

            // Apply size limit if hovering over a node.
            // Node dimensions: 600px wide (NodeControls), ~700px high (est. including prompt and controls).
            if (hoveredNode) {
                const nodeWidth = 600;
                const nodeHeight = 700;
                const maxZWidth = (window.innerWidth * 0.9) / nodeWidth;
                const maxZHeight = (window.innerHeight * 0.9) / nodeHeight;
                const maxNodeZoom = Math.min(maxZWidth, maxZHeight);

                targetZoom = Math.min(targetZoom, maxNodeZoom);
            }

            const newZoom = Math.min(Math.max(0.1, targetZoom), 2.0);

            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return prev;

            const mouseX = clientX - rect.left;
            const mouseY = clientY - rect.top;

            let anchorX = mouseX;
            let anchorY = mouseY;

            // Adjust anchor to node center if hovering over a node.
            if (hoveredNode) {
                const isVideo = hoveredNode.type === NodeType.VIDEO;
                const nodeWidth = isVideo ? 385 : 365;
                const nodeHeight = 400; // Estimated image area height

                const nodeCenterX = hoveredNode.x + nodeWidth / 2;
                const nodeCenterY = hoveredNode.y + nodeHeight / 2;

                anchorX = nodeCenterX * prev.zoom + prev.x;
                anchorY = nodeCenterY * prev.zoom + prev.y;
            }

            let newX = anchorX - (anchorX - prev.x) * (newZoom / prev.zoom);
            let newY = anchorY - (anchorY - prev.y) * (newZoom / prev.zoom);

            // Pull towards center if zooming into a node.
            if (hoveredNode && newZoom > prev.zoom) {
                const windowCenterX = window.innerWidth / 2;
                const windowCenterY = window.innerHeight / 2;
                const strength = 0.1;
                newX += (windowCenterX - anchorX) * strength;
                newY += (windowCenterY - anchorY) * strength;
            }

            return {
                x: newX,
                y: newY,
                zoom: newZoom
            };
        });
    }, [setViewport]);

    const handleZoomWheel = React.useCallback((e: WheelZoomInput, hoveredNode?: NodeData) => {
        e.preventDefault?.();
        markWheelInteracting();
        zoomAtPoint(e.deltaY, e.clientX, e.clientY, hoveredNode);
    }, [markWheelInteracting, zoomAtPoint]);

    /**
     * Handles mouse wheel events for zooming and panning
     * Ctrl/Cmd + Wheel: Zoom in/out
     * Wheel: Pan canvas
     */
    const handleWheel = React.useCallback((e: React.WheelEvent, hoveredNode?: NodeData) => {
        if (e.ctrlKey || e.metaKey) {
            handleZoomWheel(e, hoveredNode);
        } else {
            markWheelInteracting();
            // Pan with regular wheel
            setViewport(prev => ({
                ...prev,
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    }, [handleZoomWheel, markWheelInteracting, setViewport]);

    /**
     * Handles zoom slider changes
     * Zooms from center of viewport
     */
    const handleSliderZoom = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newZoom = parseFloat(e.target.value);
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        setViewport(prev => {
            const newX = cx - (cx - prev.x) * (newZoom / prev.zoom);
            const newY = cy - (cy - prev.y) * (newZoom / prev.zoom);

            return {
                x: newX,
                y: newY,
                zoom: newZoom
            };
        });
    }, [setViewport]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        viewport,
        setViewport,
        canvasRef,
        handleWheel,
        handleZoomWheel,
        handleSliderZoom,
        isWheelInteracting
    };
};
