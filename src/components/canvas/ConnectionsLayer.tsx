/**
 * ConnectionsLayer.tsx
 *
 * Renders the SVG connections between nodes on the canvas.
 * Includes permanent connections and temporary drag connections.
 */

import React, { useEffect, useRef, useState } from 'react';
import { NodeData, NodeStatus, NodeType, Viewport } from '../../types';
import { calculateConnectionPath } from '../../utils/connectionHelpers';

// ============================================================================
// LINE HOVER CONFIG
// ============================================================================

// Controls how far from the line the mouse can be before the line starts reacting.
// This affects line color hover only.
// Keep this tight so edge hover does not fight node connector hover.
const LINE_HOVER_HIT_WIDTH = 44;

// Keeps the visible connection line thin even when hovered.
const IDLE_LINE_WIDTH = 1.7;
const SELECTED_LINE_WIDTH = 2.1;

// Default flowing line effect.
const FLOW_LINE_WIDTH = 2;
const FLOW_DASH_ARRAY = '120 28';
const FLOW_ANIMATION_DURATION = '1s';

// ============================================================================
// MINUS BUTTON MAGNET CONFIG
// ============================================================================

const MAGNET_RADIUS = 92;
const FOLLOW_RATIO = 0.62;
const IDLE_SCALE = 1;
const HOVER_SCALE = 1.045;
const FOLLOW_EASE = 0.24;

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
};

// ============================================================================
// SVG MAGNET HOOK
// ============================================================================

const useSvgStableMagnet = (viewportZoom: number, isActive: boolean) => {
    const anchorRef = useRef<SVGCircleElement | null>(null);
    const buttonRef = useRef<SVGGElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const currentRef = useRef({ x: 0, y: 0, scale: IDLE_SCALE });
    const centerRef = useRef({ x: 0, y: 0 });
    const pointerRef = useRef<{ x: number; y: number } | null>(null);

    const applyTransform = () => {
        const button = buttonRef.current;
        if (!button) return;

        const current = currentRef.current;

        button.setAttribute(
            'transform',
            `translate(${current.x} ${current.y}) scale(${current.scale})`
        );
    };

    const resetTransform = () => {
        currentRef.current = { x: 0, y: 0, scale: IDLE_SCALE };
        pointerRef.current = null;
        applyTransform();
    };

    const refreshCenter = () => {
        const anchor = anchorRef.current;
        if (!anchor) return;

        const rect = anchor.getBoundingClientRect();
        centerRef.current = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    };

    const setTransform = (targetX: number, targetY: number, targetScale: number) => {
        const current = currentRef.current;

        current.x += (targetX - current.x) * FOLLOW_EASE;
        current.y += (targetY - current.y) * FOLLOW_EASE;
        current.scale += (targetScale - current.scale) * FOLLOW_EASE;

        applyTransform();
    };

    const updateFromPointer = () => {
        frameRef.current = null;

        if (!pointerRef.current) return;

        const safeZoom = Math.max(viewportZoom || 1, 0.01);
        const dx = pointerRef.current.x - centerRef.current.x;
        const dy = pointerRef.current.y - centerRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > MAGNET_RADIUS) {
            setTransform(0, 0, IDLE_SCALE);
            return;
        }

        const safeDistance = Math.max(distance, 1);
        const strength = clamp(1 - safeDistance / MAGNET_RADIUS, 0, 1);

        const offsetX = (dx / safeZoom) * FOLLOW_RATIO * strength;
        const offsetY = (dy / safeZoom) * FOLLOW_RATIO * strength;

        const scale = IDLE_SCALE + strength * (HOVER_SCALE - IDLE_SCALE);

        setTransform(offsetX, offsetY, scale);
    };

    const handleMouseEnter = () => {
        refreshCenter();
    };

    const handleMouseMove = (e: React.MouseEvent<SVGGElement>) => {
        if (!isActive) return;

        pointerRef.current = { x: e.clientX, y: e.clientY };

        if (frameRef.current !== null) return;

        frameRef.current = window.requestAnimationFrame(updateFromPointer);
    };

    const handleMouseLeave = () => {
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }

        resetTransform();
    };

    useEffect(() => {
        if (!isActive) {
            resetTransform();
        }

        return () => {
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [isActive]);

    return {
        anchorRef,
        buttonRef,
        handleMouseEnter,
        handleMouseMove,
        handleMouseLeave
    };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const parseAspectRatio = (value?: string): number | null => {
    if (!value) return null;

    if (value.includes('/')) {
        const parts = value.split('/');
        if (parts.length === 2) {
            const width = parseFloat(parts[0]);
            const height = parseFloat(parts[1]);
            if (Number.isFinite(width) && Number.isFinite(height) && height !== 0) {
                return width / height;
            }
        }
    }

    if (value.includes(':')) {
        const parts = value.split(':');
        if (parts.length === 2) {
            const width = parseFloat(parts[0]);
            const height = parseFloat(parts[1]);
            if (Number.isFinite(width) && Number.isFinite(height) && height !== 0) {
                return width / height;
            }
        }
    }

    return null;
};

const getNodeWidth = (node: NodeData, parentNode?: NodeData): number => {
    if (node.type === NodeType.IMAGE_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        const inputAspectRatio = parseAspectRatio(parentNode?.resultAspectRatio);

        if (hasInput && inputAspectRatio) {
            if (inputAspectRatio < 1) {
                return 500 * inputAspectRatio;
            }

            return 500;
        }

        return 340;
    }

    if (node.type === NodeType.VIDEO_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;

        if (hasInput) {
            return 500;
        }

        return 340;
    }

    if (node.type === NodeType.VIDEO) return 385;
    if (node.type === NodeType.CAMERA_ANGLE) return 340;

    return 365;
};

const getNodeHeight = (node: NodeData, parentNode?: NodeData): number => {
    const baseWidth = getNodeWidth(node, parentNode);
    const hasContent = node.status === NodeStatus.SUCCESS && node.resultUrl;

    if (node.type === NodeType.IMAGE_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        const inputAspectRatio = parseAspectRatio(parentNode?.resultAspectRatio);

        if (hasInput && inputAspectRatio) {
            if (inputAspectRatio < 1) {
                return 500;
            }

            return 500 / inputAspectRatio;
        }

        return 380;
    }

    if (node.type === NodeType.VIDEO_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && node.resultUrl;

        if (hasInput) {
            return Math.min(baseWidth / (16 / 9), 500);
        }

        return 380;
    }

    if (node.type === NodeType.CAMERA_ANGLE) {
        const hasCameraContent = node.status === NodeStatus.SUCCESS && node.resultUrl;
        const cameraAspectRatio = parseAspectRatio(node.resultAspectRatio);

        if (hasCameraContent && cameraAspectRatio) {
            return 340 / cameraAspectRatio;
        }

        return 340;
    }

    let aspectRatio: number;

    const resultAspectRatio = parseAspectRatio(node.resultAspectRatio);
    const selectedAspectRatio = node.aspectRatio !== 'Auto'
        ? parseAspectRatio(node.aspectRatio)
        : null;

    if (hasContent && resultAspectRatio) {
        aspectRatio = resultAspectRatio;
    } else if (hasContent && selectedAspectRatio) {
        aspectRatio = selectedAspectRatio;
    } else {
        aspectRatio = 4 / 3;
    }

    return baseWidth / aspectRatio;
};

/**
 * Some node types visually size themselves from their own input node.
 * For example, Image Editor displays the parent image, so its real visual width/height
 * depends on the parent image aspect ratio. Connections must use that same sizing logic.
 */
const getNodeInputForSizing = (node: NodeData, nodes: NodeData[]): NodeData | undefined => {
    const firstParentId = node.parentIds?.[0];
    if (!firstParentId) return undefined;

    return nodes.find(n => n.id === firstParentId);
};

const getNodeVisualSize = (
    node: NodeData,
    nodes: NodeData[],
    fallbackParent?: NodeData
) => {
    const inputNode = getNodeInputForSizing(node, nodes) || fallbackParent;

    return {
        width: getNodeWidth(node, inputNode),
        height: getNodeHeight(node, inputNode)
    };
};

// ============================================================================
// TYPES
// ============================================================================

interface Connection {
    parentId: string;
    childId: string;
}

interface ConnectionsLayerProps {
    nodes: NodeData[];
    viewport: Viewport;
    isDraggingConnection: boolean;
    connectionStart: { nodeId: string; handle: 'left' | 'right' } | null;
    tempConnectionEnd: { x: number; y: number } | null;
    selectedConnection: Connection | null;
    onEdgeClick: (e: React.MouseEvent, parentId: string, childId: string) => void;
    onDisconnectConnection?: (parentId: string, childId: string) => void;
    canvasTheme?: 'dark' | 'light';
}

// ============================================================================
// CONNECTION ITEM
// ============================================================================

const ConnectionItem: React.FC<{
    parent: NodeData;
    child: NodeData;
    path: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    isSelected: boolean;
    viewportZoom: number;
    canvasTheme: 'dark' | 'light';
    onEdgeClick: (e: React.MouseEvent, parentId: string, childId: string) => void;
    onDisconnectConnection?: (parentId: string, childId: string) => void;
}> = ({
    parent,
    child,
    path,
    startX,
    startY,
    endX,
    endY,
    isSelected,
    viewportZoom,
    canvasTheme,
    onEdgeClick,
    onDisconnectConnection
}) => {
    const [isHot, setIsHot] = useState(false);
    const {
        anchorRef,
        buttonRef,
        handleMouseEnter: handleMagnetMouseEnter,
        handleMouseMove: handleMagnetMouseMove,
        handleMouseLeave: handleMagnetMouseLeave
    } = useSvgStableMagnet(viewportZoom, isHot);

    // Place disconnect button at the middle of the connection.
    const buttonT = 0.5;
    const buttonX = startX + (endX - startX) * buttonT;
    const buttonY = startY + (endY - startY) * buttonT;

    const highlightStroke = canvasTheme === 'dark' ? '#D8FF00' : '#84cc16';
    const idleStroke = canvasTheme === 'dark' ? '#444' : '#d1d5db';

    return (
        <g
            onMouseEnter={() => {
                setIsHot(true);
                handleMagnetMouseEnter();
            }}
            onMouseMove={handleMagnetMouseMove}
            onMouseLeave={() => {
                setIsHot(false);
                handleMagnetMouseLeave();
            }}
            onClick={(e) => onEdgeClick(e, parent.id, child.id)}
            className="cursor-pointer pointer-events-auto"
            style={{ pointerEvents: 'auto' }}
        >
            {/* Wide invisible hit area.
                This controls how far away the cursor can be while still triggering line color feedback. */}
            <path
                d={path}
                stroke="transparent"
                strokeWidth={LINE_HOVER_HIT_WIDTH}
                fill="none"
                style={{ pointerEvents: 'stroke' }}
            />

            {/* Main base connection line */}
            <path
                d={path}
                stroke={isSelected || isHot ? highlightStroke : idleStroke}
                strokeWidth={isSelected ? SELECTED_LINE_WIDTH : IDLE_LINE_WIDTH}
                fill="none"
                className="transition-colors duration-150 pointer-events-none"
            />

            {/* Default flowing effect.
                It flows from parent to child when the line is not being hovered.
                On hover, it fades out and the main line color takes over. */}
            {!isSelected && (
                <path
                    d={path}
                    stroke={highlightStroke}
                    strokeWidth={FLOW_LINE_WIDTH}
                    strokeDasharray={FLOW_DASH_ARRAY}
                    strokeLinecap="round"
                    fill="none"
                    opacity={isHot ? 0 : 0.24}
                    className="pointer-events-none transition-opacity duration-200"
                >
                    <animate
                        attributeName="stroke-dashoffset"
                        from="148"
                        to="0"
                        dur={FLOW_ANIMATION_DURATION}
                        repeatCount="indefinite"
                    />
                </path>
            )}

            {/* Disconnect button anchor and magnetic visual */}
            {onDisconnectConnection && (
                <g
                    transform={`translate(${buttonX}, ${buttonY})`}
                    className="transition-opacity duration-150"
                    style={{
                        opacity: isHot ? 1 : 0,
                        pointerEvents: isHot ? 'all' : 'none'
                    }}
                >
                    {/* Fixed invisible anchor.
                        It stays still and is used only for magnetic distance calculation. */}
                    <circle
                        ref={anchorRef}
                        r="1"
                        fill="transparent"
                        style={{ pointerEvents: 'none' }}
                    />

                    {/* Moving magnetic button */}
                    <g
                        ref={buttonRef}
                        className="cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDisconnectConnection(parent.id, child.id);
                        }}
                    >
                        {/* Outer clickable hit circle */}
                        <circle
                            r="18"
                            fill="transparent"
                            style={{ pointerEvents: 'all' }}
                        />

                        {/* Visual circle */}
                        <circle
                            r="12"
                            fill={canvasTheme === 'dark' ? '#050505' : '#ffffff'}
                            stroke={highlightStroke}
                            strokeWidth="2"
                            style={{ pointerEvents: 'none' }}
                        />

                        {/* Minus icon */}
                        <line
                            x1="-5"
                            y1="0"
                            x2="5"
                            y2="0"
                            stroke={highlightStroke}
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            style={{ pointerEvents: 'none' }}
                        />
                    </g>
                </g>
            )}
        </g>
    );
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ConnectionsLayer: React.FC<ConnectionsLayerProps> = ({
    nodes,
    viewport,
    isDraggingConnection,
    connectionStart,
    tempConnectionEnd,
    selectedConnection,
    onEdgeClick,
    onDisconnectConnection,
    canvasTheme = 'dark'
}) => {
    const connections: React.ReactNode[] = [];

    nodes.forEach(node => {
        if (!node.parentIds || node.parentIds.length === 0) return;

        node.parentIds.forEach(parentId => {
            const parent = nodes.find(n => n.id === parentId);
            if (!parent) return;

            const parentSize = getNodeVisualSize(parent, nodes);
            const childSize = getNodeVisualSize(node, nodes, parent);

            const startX = parent.x + parentSize.width;
            const startY = parent.y + parentSize.height / 2;
            const endX = node.x;
            const endY = node.y + childSize.height / 2;

            const path = calculateConnectionPath(startX, startY, endX, endY, 'right');
            const edgeKey = `${parent.id}->${node.id}`;
            const isSelected = selectedConnection?.parentId === parentId && selectedConnection?.childId === node.id;

            connections.push(
                <ConnectionItem
                    key={edgeKey}
                    parent={parent}
                    child={node}
                    path={path}
                    startX={startX}
                    startY={startY}
                    endX={endX}
                    endY={endY}
                    isSelected={isSelected}
                    viewportZoom={viewport.zoom}
                    canvasTheme={canvasTheme}
                    onEdgeClick={onEdgeClick}
                    onDisconnectConnection={onDisconnectConnection}
                />
            );
        });
    });

    let tempLine = null;

    if (isDraggingConnection && connectionStart && tempConnectionEnd) {
        const startNode = nodes.find(n => n.id === connectionStart.nodeId);

        if (startNode) {
            const startNodeSize = getNodeVisualSize(startNode, nodes);

            const startX = connectionStart.handle === 'right'
                ? startNode.x + startNodeSize.width
                : startNode.x;

            const startY = startNode.y + startNodeSize.height / 2;
            const endX = (tempConnectionEnd.x - viewport.x) / viewport.zoom;
            const endY = (tempConnectionEnd.y - viewport.y) / viewport.zoom;

            const path = calculateConnectionPath(
                startX,
                startY,
                endX,
                endY,
                connectionStart.handle
            );

            tempLine = (
                <path
                    d={path}
                    stroke={canvasTheme === 'dark' ? '#D8FF00' : '#84cc16'}
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    fill="none"
                    className="pointer-events-none opacity-50"
                >
                    <animate
                        attributeName="stroke-dashoffset"
                        from="16"
                        to="0"
                        dur="1s"
                        repeatCount="indefinite"
                    />
                </path>
            );
        }
    }

    return (
        <>
            {connections}
            {tempLine}
        </>
    );
};
