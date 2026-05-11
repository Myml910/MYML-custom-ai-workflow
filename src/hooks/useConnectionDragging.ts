/**
 * useConnectionDragging.ts
 *
 * Custom hook for managing connection dragging between nodes.
 * Handles drag-to-connect functionality with visual feedback.
 */

import React, { useState, useRef } from 'react';
import { NodeData, NodeType, Viewport } from '../types';

interface ConnectionStart {
    nodeId: string;
    handle: 'left' | 'right';
}

type AddNextHandler = (
    nodeId: string,
    direction: 'left' | 'right',
    x?: number,
    y?: number
) => void;

export const useConnectionDragging = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [isDraggingConnection, setIsDraggingConnection] = useState(false);
    const [connectionStart, setConnectionStart] = useState<ConnectionStart | null>(null);
    const [tempConnectionEnd, setTempConnectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
    const [selectedConnection, setSelectedConnection] = useState<{ parentId: string; childId: string } | null>(null);

    const dragStartTime = useRef<number>(0);
    const dragStartPoint = useRef<{ x: number; y: number } | null>(null);
    const latestTempConnectionEnd = useRef<{ x: number; y: number } | null>(null);
    const tempConnectionFrame = useRef<number | null>(null);
    const hoveredNodeIdRef = useRef<string | null>(null);
    const hoveredSideRef = useRef<'left' | 'right' | null>(null);

    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Checks if mouse is hovering over a node for connection target.
     * Also determines which side, left or right, is being hovered.
     */
    const checkHoveredNode = (
        mouseX: number,
        mouseY: number,
        nodes: NodeData[],
        viewport: Viewport
    ) => {
        const canvasX = (mouseX - viewport.x) / viewport.zoom;
        const canvasY = (mouseY - viewport.y) / viewport.zoom;

        const found = nodes.find(n => {
            if (n.id === connectionStart?.nodeId) return false;

            return (
                canvasX >= n.x &&
                canvasX <= n.x + 340 &&
                canvasY >= n.y &&
                canvasY <= n.y + 400
            );
        });

        if (found) {
            if (hoveredNodeIdRef.current !== found.id) {
                hoveredNodeIdRef.current = found.id;
                setHoveredNodeId(found.id);
            }

            // Determine which side is being hovered.
            // Left connector is near x, right connector is near x + 340.
            const nodeCenter = found.x + 170;
            const nextSide = canvasX < nodeCenter ? 'left' : 'right';
            if (hoveredSideRef.current !== nextSide) {
                hoveredSideRef.current = nextSide;
                setHoveredSide(nextSide);
            }
        } else {
            if (hoveredNodeIdRef.current !== null) {
                hoveredNodeIdRef.current = null;
                setHoveredNodeId(null);
            }
            if (hoveredSideRef.current !== null) {
                hoveredSideRef.current = null;
                setHoveredSide(null);
            }
        }
    };

    /**
     * Check if a connection is valid based on node types.
     */
    const isValidConnection = (
        parentId: string,
        childId: string,
        nodes: NodeData[]
    ): boolean => {
        const parentNode = nodes.find(n => n.id === parentId);
        const childNode = nodes.find(n => n.id === childId);

        if (!parentNode || !childNode) return false;
        if (parentId === childId) return false;

        // AUDIO nodes not supported yet.
        if (parentNode.type === NodeType.AUDIO || childNode.type === NodeType.AUDIO) {
            return false;
        }

        // TEXT nodes cannot receive input. They can only provide prompt.
        if (childNode.type === NodeType.TEXT) {
            return false;
        }

        // TEXT nodes can only connect to IMAGE or VIDEO.
        if (parentNode.type === NodeType.TEXT) {
            return childNode.type === NodeType.IMAGE || childNode.type === NodeType.VIDEO;
        }

        // VIDEO nodes can only connect to VIDEO or VIDEO_EDITOR.
        if (parentNode.type === NodeType.VIDEO) {
            return childNode.type === NodeType.VIDEO ||
                childNode.type === NodeType.VIDEO_EDITOR;
        }

        // IMAGE nodes can connect to IMAGE, VIDEO, or IMAGE_EDITOR.
        if (parentNode.type === NodeType.IMAGE) {
            return childNode.type === NodeType.IMAGE ||
                childNode.type === NodeType.VIDEO ||
                childNode.type === NodeType.IMAGE_EDITOR;
        }

        // IMAGE_EDITOR can connect to IMAGE, VIDEO, or IMAGE_EDITOR.
        if (parentNode.type === NodeType.IMAGE_EDITOR) {
            return childNode.type === NodeType.IMAGE ||
                childNode.type === NodeType.VIDEO ||
                childNode.type === NodeType.IMAGE_EDITOR;
        }

        // VIDEO_EDITOR can only connect to VIDEO.
        if (parentNode.type === NodeType.VIDEO_EDITOR) {
            return childNode.type === NodeType.VIDEO;
        }

        return true;
    };

    const resetConnectionDrag = () => {
        if (tempConnectionFrame.current !== null) {
            window.cancelAnimationFrame(tempConnectionFrame.current);
            tempConnectionFrame.current = null;
        }

        setIsDraggingConnection(false);
        setConnectionStart(null);
        setTempConnectionEnd(null);
        setHoveredNodeId(null);
        setHoveredSide(null);
        dragStartPoint.current = null;
        latestTempConnectionEnd.current = null;
        hoveredNodeIdRef.current = null;
        hoveredSideRef.current = null;
    };

    const scheduleTempConnectionEnd = (point: { x: number; y: number }) => {
        latestTempConnectionEnd.current = point;

        if (tempConnectionFrame.current !== null) return;

        tempConnectionFrame.current = window.requestAnimationFrame(() => {
            tempConnectionFrame.current = null;

            if (latestTempConnectionEnd.current) {
                setTempConnectionEnd(latestTempConnectionEnd.current);
            }
        });
    };

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Starts connection dragging from a connector button.
     */
    const handleConnectorPointerDown = (
        e: React.PointerEvent,
        nodeId: string,
        side: 'left' | 'right'
    ) => {
        e.stopPropagation();
        e.preventDefault();

        dragStartTime.current = Date.now();
        dragStartPoint.current = { x: e.clientX, y: e.clientY };
        latestTempConnectionEnd.current = { x: e.clientX, y: e.clientY };

        setIsDraggingConnection(true);
        setConnectionStart({ nodeId, handle: side });
        setTempConnectionEnd({ x: e.clientX, y: e.clientY });
    };

    /**
     * Updates temporary connection end point during drag.
     */
    const updateConnectionDrag = (
        e: React.PointerEvent,
        nodes: NodeData[],
        viewport: Viewport
    ) => {
        if (!isDraggingConnection) return false;

        scheduleTempConnectionEnd({ x: e.clientX, y: e.clientY });
        checkHoveredNode(e.clientX, e.clientY, nodes, viewport);

        return true;
    };

    /**
     * Completes connection drag and creates connection if valid.
     * Returns true if connection was handled, false otherwise.
     */
    const completeConnectionDrag = (
        onAddNext: AddNextHandler,
        onUpdateNodes: (updater: (prev: NodeData[]) => NodeData[]) => void,
        nodes: NodeData[],
        onConnectionMade?: (parentId: string, childId: string) => void
    ): boolean => {
        if (!isDraggingConnection || !connectionStart) return false;

        const releasePoint =
            latestTempConnectionEnd.current ||
            tempConnectionEnd ||
            dragStartPoint.current ||
            { x: window.innerWidth / 2, y: window.innerHeight / 2 };

        // Release on blank area:
        // Open add-next menu at the mouse release position.
        // This supports both short click and drag-to-blank interactions.
        if (!hoveredNodeId) {
            onAddNext(
                connectionStart.nodeId,
                connectionStart.handle,
                releasePoint.x,
                releasePoint.y
            );

            resetConnectionDrag();
            return true;
        }

        // Drag to node:
        // Create connection based on target side.
        if (hoveredNodeId && hoveredSide) {
            if (hoveredSide === 'left') {
                // Connecting to LEFT side:
                // Source is parent, hovered node is child.
                if (!isValidConnection(connectionStart.nodeId, hoveredNodeId, nodes)) {
                    resetConnectionDrag();
                    return true;
                }

                onUpdateNodes(prev => prev.map(n => {
                    if (n.id === hoveredNodeId) {
                        const existingParents = n.parentIds || [];

                        // Prevent duplicate connections.
                        if (!existingParents.includes(connectionStart.nodeId)) {
                            return {
                                ...n,
                                parentIds: [...existingParents, connectionStart.nodeId]
                            };
                        }
                    }

                    return n;
                }));

                onConnectionMade?.(connectionStart.nodeId, hoveredNodeId);
            } else {
                // Connecting to RIGHT side:
                // Hovered node is parent, source node is child.
                if (!isValidConnection(hoveredNodeId, connectionStart.nodeId, nodes)) {
                    resetConnectionDrag();
                    return true;
                }

                onUpdateNodes(prev => prev.map(n => {
                    if (n.id === connectionStart.nodeId) {
                        const existingParents = n.parentIds || [];

                        // Prevent duplicate connections.
                        if (!existingParents.includes(hoveredNodeId)) {
                            return {
                                ...n,
                                parentIds: [...existingParents, hoveredNodeId]
                            };
                        }
                    }

                    return n;
                }));

                onConnectionMade?.(hoveredNodeId, connectionStart.nodeId);
            }
        }

        resetConnectionDrag();
        return true;
    };

    /**
     * Handles clicking on a connection line to select it.
     */
    const handleEdgeClick = (e: React.MouseEvent, parentId: string, childId: string) => {
        e.stopPropagation();
        setSelectedConnection({ parentId, childId });
    };

    /**
     * Deletes the currently selected connection.
     */
    const deleteSelectedConnection = (
        onUpdateNodes: (updater: (prev: NodeData[]) => NodeData[]) => void
    ) => {
        if (!selectedConnection) return false;

        onUpdateNodes(prev => prev.map(n => {
            if (n.id === selectedConnection.childId) {
                const existingParents = n.parentIds || [];

                return {
                    ...n,
                    parentIds: existingParents.filter(pid => pid !== selectedConnection.parentId)
                };
            }

            return n;
        }));

        setSelectedConnection(null);
        return true;
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        isDraggingConnection,
        connectionStart,
        tempConnectionEnd,
        hoveredNodeId,
        selectedConnection,
        setSelectedConnection,
        handleConnectorPointerDown,
        updateConnectionDrag,
        completeConnectionDrag,
        handleEdgeClick,
        deleteSelectedConnection
    };
};
