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

const CONNECTION_WIDTHS = {
    ambient: 1.5,
    visible: 1.5,
    flow: 1.65,
    temporaryHalo: 6,
    temporaryMain: 2
} as const;

const CONNECTION_DASH = {
    flow: '8 18',
    temporary: '8 10'
} as const;

const CONNECTION_COLORS = {
    dark: {
        ambient: 'rgba(74, 82, 69, 0.68)',
        idle: 'rgba(191, 234, 53, 0.58)',
        selected: 'rgba(216, 255, 0, 0.64)',
        flow: 'rgba(216, 255, 0, 0.36)',
        temporary: 'rgba(216, 255, 0, 0.86)',
        running: '#CFF75A',
        error: '#F59E0B',
        deleteSurface: 'rgba(18, 20, 18, 0.94)',
        deleteBorder: 'rgba(216, 255, 0, 0.80)',
        deleteGlyph: 'rgba(255, 255, 255, 0.70)',
        deleteHalo: 'rgba(216, 255, 0, 0.18)',
        deleteSignal: 'rgba(216, 255, 0, 0.50)',
        deleteFocusBorder: 'rgba(216, 255, 0, 0.28)',
        deleteFocusGlyph: 'rgba(255, 255, 255, 0.82)',
        deleteDangerSurface: 'rgba(127, 29, 29, 0.22)',
        deleteDangerBorder: 'rgba(248, 113, 113, 0.55)',
        deleteDangerGlyph: '#F87171'
    },
    light: {
        ambient: 'rgba(146, 157, 134, 0.62)',
        idle: 'rgba(77, 124, 15, 0.48)',
        selected: 'rgba(77, 124, 15, 0.60)',
        flow: 'rgba(77, 124, 15, 0.32)',
        temporary: 'rgba(77, 124, 15, 0.84)',
        running: '#65A30D',
        error: '#D97706',
        deleteSurface: 'rgba(248, 250, 244, 0.96)',
        deleteBorder: 'rgba(90, 125, 0, 0.76)',
        deleteGlyph: 'rgba(15, 23, 42, 0.68)',
        deleteHalo: 'rgba(90, 125, 0, 0.16)',
        deleteSignal: 'rgba(90, 125, 0, 0.50)',
        deleteFocusBorder: 'rgba(77, 124, 15, 0.30)',
        deleteFocusGlyph: 'rgba(15, 23, 42, 0.82)',
        deleteDangerSurface: 'rgba(254, 226, 226, 0.92)',
        deleteDangerBorder: 'rgba(220, 38, 38, 0.48)',
        deleteDangerGlyph: '#DC2626'
    }
} as const;

// ============================================================================
// MOVING MAINTENANCE POINT CONFIG
// ============================================================================

const DELETE_SENSOR_WIDTH = 34;
const DELETE_AUTO_FLOW_START = -0.3;
const DELETE_AUTO_FLOW_END = 1.3;
const DELETE_INTERACTIVE_START = 0.3;
const DELETE_INTERACTIVE_END = 0.6;
const DELETE_INTERACTIVE_RADIUS = 30;
const DELETE_MAX_OVERSHOOT = 72;
const DELETE_FLOW_DURATION = 6800;
const DELETE_PATH_SAMPLES = 48;
const DELETE_MANUAL_SNAP_MS = 110;
const DELETE_MANUAL_FOLLOW_MS = 60;
const DELETE_RETURN_MS = 120;
const CRUISING_DOT_RADIUS = 7.25;
const CRUISING_DOT_OPACITY = 0.62;

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
};

const getConnectionTone = (
    parent: NodeData,
    child: NodeData
) => {
    const isConnectionRunning =
        parent.status === NodeStatus.LOADING ||
        child.status === NodeStatus.LOADING;
    const isConnectionError =
        parent.status === NodeStatus.ERROR ||
        child.status === NodeStatus.ERROR;
    const shouldShowFlow = true;

    return {
        isConnectionRunning,
        isConnectionError,
        shouldShowFlow
    };
};

// ============================================================================
// MOVING MAINTENANCE POINT HOOK
// ============================================================================

const usePathMaintenancePoint = (path: string, viewportZoom: number) => {
    const sensorPathRef = useRef<SVGPathElement | null>(null);
    const buttonRootRef = useRef<SVGGElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const manualFrameRef = useRef<number | null>(null);
    const returnTimerRef = useRef<number | null>(null);
    const animationStartRef = useRef<number | null>(null);
    const pathLengthRef = useRef<number | null>(null);
    const currentProgressRef = useRef(0.5);
    const isManualPositionInitializedRef = useRef(false);
    const isManualRef = useRef(false);
    const isReducedMotionRef = useRef(false);

    const safeGetTotalLength = (pathElement: SVGPathElement) => {
        try {
            const totalLength = pathElement.getTotalLength();
            return Number.isFinite(totalLength) && totalLength > 0 ? totalLength : null;
        } catch {
            return null;
        }
    };

    const safeGetPointAtLength = (pathElement: SVGPathElement, length: number) => {
        if (!Number.isFinite(length)) return null;

        try {
            const point = pathElement.getPointAtLength(Math.max(0, length));
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

            return { x: point.x, y: point.y };
        } catch {
            return null;
        }
    };

    const refreshPathLength = () => {
        const pathElement = sensorPathRef.current;
        if (!pathElement) {
            pathLengthRef.current = null;
            return null;
        }

        const totalLength = safeGetTotalLength(pathElement);
        pathLengthRef.current = totalLength;
        return totalLength;
    };

    const getCachedPathLength = () => {
        return pathLengthRef.current ?? refreshPathLength();
    };

    const getAutoProgress = (timestamp: number) => {
        const animationStart = animationStartRef.current ?? timestamp;
        const elapsed = (timestamp - animationStart) % DELETE_FLOW_DURATION;
        return DELETE_AUTO_FLOW_START +
            ((DELETE_AUTO_FLOW_END - DELETE_AUTO_FLOW_START) * elapsed) / DELETE_FLOW_DURATION;
    };

    const getPointAtProgress = (pathElement: SVGPathElement, totalLength: number, progress: number) => {
        const safeLength = Number.isFinite(totalLength) && totalLength > 0 ? totalLength : null;
        if (!safeLength) return null;

        if (progress >= 0 && progress <= 1) {
            return safeGetPointAtLength(pathElement, safeLength * progress);
        }

        if (progress < 0) {
            const startPoint = safeGetPointAtLength(pathElement, 0);
            const directionPoint = safeGetPointAtLength(pathElement, Math.min(safeLength * 0.04, 24));
            if (!startPoint || !directionPoint) return null;

            const dx = directionPoint.x - startPoint.x;
            const dy = directionPoint.y - startPoint.y;
            const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const extraDistance = Math.min(Math.abs(progress) * safeLength, DELETE_MAX_OVERSHOOT);

            return {
                x: startPoint.x - (dx / distance) * extraDistance,
                y: startPoint.y - (dy / distance) * extraDistance
            };
        }

        const endPoint = safeGetPointAtLength(pathElement, safeLength);
        const directionPoint = safeGetPointAtLength(pathElement, Math.max(safeLength * 0.96, safeLength - 24));
        if (!endPoint || !directionPoint) return null;

        const dx = endPoint.x - directionPoint.x;
        const dy = endPoint.y - directionPoint.y;
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const extraDistance = Math.min((progress - 1) * safeLength, DELETE_MAX_OVERSHOOT);

        return {
            x: endPoint.x + (dx / distance) * extraDistance,
            y: endPoint.y + (dy / distance) * extraDistance
        };
    };

    const setButtonAtPoint = (point: { x: number; y: number }) => {
        const buttonElement = buttonRootRef.current;
        if (!buttonElement || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;

        buttonElement.style.transition = 'none';
        buttonElement.style.transform = `translate(${point.x}px, ${point.y}px)`;
        return true;
    };

    const setButtonAtProgress = (progress: number) => {
        const pathElement = sensorPathRef.current;
        if (!pathElement) return false;

        const totalLength = getCachedPathLength();
        if (!totalLength) return false;

        const clampedProgress = clamp(progress, DELETE_AUTO_FLOW_START, DELETE_AUTO_FLOW_END);
        const point = getPointAtProgress(pathElement, totalLength, clampedProgress);
        if (!point) return false;

        if (!setButtonAtPoint(point)) return false;

        currentProgressRef.current = clampedProgress;
        return true;
    };

    const cancelManualProgress = () => {
        if (manualFrameRef.current !== null) {
            window.cancelAnimationFrame(manualFrameRef.current);
            manualFrameRef.current = null;
        }
    };

    const animateProgressTo = (
        targetProgress: number,
        durationMs: number,
        onComplete?: () => void
    ) => {
        cancelManualProgress();

        const startProgress = currentProgressRef.current;
        const startTime = performance.now();
        const safeDuration = isReducedMotionRef.current ? 0 : Math.max(durationMs, 0);

        if (safeDuration === 0) {
            if (setButtonAtProgress(targetProgress)) {
                onComplete?.();
                return true;
            }

            return false;
        }

        const tick = (timestamp: number) => {
            const linearProgress = clamp((timestamp - startTime) / safeDuration, 0, 1);
            const easedProgress = 1 - Math.pow(1 - linearProgress, 3);
            const nextProgress = startProgress + (targetProgress - startProgress) * easedProgress;

            if (!setButtonAtProgress(nextProgress)) {
                manualFrameRef.current = null;
                return;
            }

            if (linearProgress < 1) {
                manualFrameRef.current = window.requestAnimationFrame(tick);
                return;
            }

            manualFrameRef.current = null;
            setButtonAtProgress(targetProgress);
            onComplete?.();
        };

        manualFrameRef.current = window.requestAnimationFrame(tick);
        return true;
    };

    const getSvgPointFromMouse = (e: React.MouseEvent<SVGPathElement>) => {
        const pathElement = sensorPathRef.current;
        const svg = pathElement?.ownerSVGElement;
        if (!svg) return null;

        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;

        const screenMatrix = svg.getScreenCTM();
        if (!screenMatrix) return null;

        return point.matrixTransform(screenMatrix.inverse());
    };

    const setButtonNearMouse = (e: React.MouseEvent<SVGPathElement>) => {
        const pathElement = sensorPathRef.current;
        const pointerPoint = getSvgPointFromMouse(e);
        if (!pathElement || !pointerPoint) return false;

        const totalLength = getCachedPathLength();
        if (!totalLength) return false;

        let closestProgress = 0.5;
        let closestDistance = Number.POSITIVE_INFINITY;

        for (let i = 0; i <= DELETE_PATH_SAMPLES; i += 1) {
            const progress = DELETE_INTERACTIVE_START +
                ((DELETE_INTERACTIVE_END - DELETE_INTERACTIVE_START) * i) / DELETE_PATH_SAMPLES;
            const point = safeGetPointAtLength(pathElement, totalLength * progress);
            if (!point) continue;

            const dx = point.x - pointerPoint.x;
            const dy = point.y - pointerPoint.y;
            const distance = dx * dx + dy * dy;

            if (distance < closestDistance) {
                closestDistance = distance;
                closestProgress = progress;
            }
        }

        const closestDistanceInCanvas = Math.sqrt(closestDistance);
        const safeZoom = Math.max(viewportZoom || 1, 0.01);
        const effectiveRadius = DELETE_INTERACTIVE_RADIUS / safeZoom;

        if (
            closestProgress < DELETE_INTERACTIVE_START ||
            closestProgress > DELETE_INTERACTIVE_END ||
            closestDistanceInCanvas > effectiveRadius
        ) {
            return false;
        }

        const targetProgress = clamp(closestProgress, DELETE_INTERACTIVE_START, DELETE_INTERACTIVE_END);
        const transitionMs = isManualPositionInitializedRef.current
            ? DELETE_MANUAL_FOLLOW_MS
            : DELETE_MANUAL_SNAP_MS;

        isManualPositionInitializedRef.current = true;
        return animateProgressTo(targetProgress, transitionMs);
    };

    const animate = (timestamp: number) => {
        if (isReducedMotionRef.current || isManualRef.current) {
            frameRef.current = null;
            return;
        }

        if (animationStartRef.current === null) {
            animationStartRef.current = timestamp;
        }

        const progress = getAutoProgress(timestamp);

        if (!setButtonAtProgress(progress)) {
            frameRef.current = null;
            return;
        }

        frameRef.current = window.requestAnimationFrame(animate);
    };

    const startAutoFlow = () => {
        if (isReducedMotionRef.current || frameRef.current !== null) return;

        frameRef.current = window.requestAnimationFrame(animate);
    };

    const stopAutoFlow = () => {
        if (returnTimerRef.current !== null) {
            window.clearTimeout(returnTimerRef.current);
            returnTimerRef.current = null;
        }

        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    };

    const returnToAutoFlow = () => {
        stopAutoFlow();
        const autoProgress = getAutoProgress(performance.now());

        if (isReducedMotionRef.current) {
            setButtonAtProgress(autoProgress);
            return;
        }

        animateProgressTo(autoProgress, DELETE_RETURN_MS, () => {
            startAutoFlow();
        });
    };

    const handleSensorEnter = (e: React.MouseEvent<SVGPathElement>) => {
        const hasInteractiveTarget = setButtonNearMouse(e);
        if (!hasInteractiveTarget) return;

        isManualRef.current = true;
        stopAutoFlow();
        return true;
    };

    const handleSensorMove = (e: React.MouseEvent<SVGPathElement>) => {
        const hasInteractiveTarget = setButtonNearMouse(e);

        if (!hasInteractiveTarget) {
            isManualRef.current = false;
            isManualPositionInitializedRef.current = false;
            returnToAutoFlow();
            return;
        }

        isManualRef.current = true;
        stopAutoFlow();
        return true;
    };

    const handleSensorLeave = () => {
        isManualRef.current = false;
        isManualPositionInitializedRef.current = false;
        returnToAutoFlow();
    };

    const handlePointEnter = () => {
        isManualRef.current = true;
        stopAutoFlow();
    };

    const handlePointLeave = () => {
        isManualRef.current = false;
        isManualPositionInitializedRef.current = false;
        returnToAutoFlow();
    };

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        animationStartRef.current = null;
        pathLengthRef.current = null;
        refreshPathLength();

        const syncReducedMotion = () => {
            isReducedMotionRef.current = mediaQuery.matches;
            stopAutoFlow();
            setButtonAtProgress(0.5);

            if (!mediaQuery.matches && !isManualRef.current) {
                startAutoFlow();
            }
        };

        syncReducedMotion();
        mediaQuery.addEventListener('change', syncReducedMotion);

        if (!isReducedMotionRef.current && !isManualRef.current) {
            startAutoFlow();
        }

        return () => {
            mediaQuery.removeEventListener('change', syncReducedMotion);
            stopAutoFlow();
            cancelManualProgress();
        };
    }, [path, viewportZoom]);

    return {
        sensorPathRef,
        buttonRootRef,
        handleSensorEnter,
        handleSensorMove,
        handleSensorLeave,
        handlePointEnter,
        handlePointLeave
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
    viewportZoom: number;
    canvasTheme: 'dark' | 'light';
    onDisconnectConnection?: (parentId: string, childId: string) => void;
}> = ({
    parent,
    child,
    path,
    viewportZoom,
    canvasTheme,
    onDisconnectConnection
}) => {
    const [isDeleteFocus, setIsDeleteFocus] = useState(false);
    const [isDeleteHot, setIsDeleteHot] = useState(false);
    const {
        sensorPathRef,
        buttonRootRef,
        handleSensorEnter,
        handleSensorMove,
        handleSensorLeave,
        handlePointEnter,
        handlePointLeave
    } = usePathMaintenancePoint(path, viewportZoom);

    const palette = CONNECTION_COLORS[canvasTheme];
    const connectionTone = getConnectionTone(parent, child);
    const visibleStroke = connectionTone.isConnectionError
        ? palette.error
        : connectionTone.isConnectionRunning
            ? palette.running
            : palette.idle;
    const visibleOpacity = connectionTone.isConnectionRunning || connectionTone.isConnectionError
        ? 0.68
        : 0.60;
    const deleteSurface = isDeleteHot
        ? palette.deleteDangerSurface
        : palette.deleteSurface;
    const deleteBorder = isDeleteHot
        ? palette.deleteDangerBorder
        : isDeleteFocus
            ? palette.deleteFocusBorder
            : palette.deleteBorder;
    const deleteGlyph = isDeleteHot
        ? palette.deleteDangerGlyph
        : isDeleteFocus
            ? palette.deleteFocusGlyph
            : palette.deleteGlyph;
    const deleteSignal = isDeleteFocus ? visibleStroke : palette.deleteSignal;
    const deleteSignalOpacity = isDeleteFocus ? 0 : 1;
    const deleteHaloOpacity = isDeleteFocus ? 0 : 1;
    const deleteHitRadius = isDeleteFocus ? 16 : 13;
    const deleteVisualRadius = isDeleteFocus ? 11 : CRUISING_DOT_RADIUS;
    const deleteVisualStrokeWidth = isDeleteFocus ? 1.2 : 1.8;
    const deleteGlyphOpacity = isDeleteFocus ? 1 : 0.04;
    const deleteStemOpacity = isDeleteFocus ? 0.34 : 0;

    return (
        <g className="pointer-events-none">
            {/* Ambient base line */}
            <path
                d={path}
                stroke={palette.ambient}
                strokeWidth={CONNECTION_WIDTHS.ambient}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="pointer-events-none"
            />

            {/* Main visible line */}
            <path
                d={path}
                stroke={visibleStroke}
                strokeWidth={CONNECTION_WIDTHS.visible}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={visibleOpacity}
                className="connector-transition pointer-events-none"
            />

            {/* Persistent low-noise signal flow. */}
            {connectionTone.shouldShowFlow && (
                <path
                    d={path}
                    stroke={connectionTone.isConnectionError ? palette.error : palette.flow}
                    strokeWidth={CONNECTION_WIDTHS.flow}
                    strokeDasharray={CONNECTION_DASH.flow}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={0.38}
                    className="connector-flow-path pointer-events-none"
                />
            )}

            {/* Invisible sensor only moves the maintenance point; it never changes line visuals. */}
            {onDisconnectConnection && (
                <path
                    ref={sensorPathRef}
                    d={path}
                    stroke="transparent"
                    strokeWidth={DELETE_SENSOR_WIDTH}
                    strokeLinecap="round"
                    fill="none"
                    onMouseEnter={(e) => {
                        if (handleSensorEnter(e)) {
                            setIsDeleteFocus(true);
                        }
                    }}
                    onMouseMove={(e) => {
                        const hasInteractiveTarget = handleSensorMove(e);
                        setIsDeleteFocus(Boolean(hasInteractiveTarget));
                        if (!hasInteractiveTarget) {
                            setIsDeleteHot(false);
                        }
                    }}
                    onMouseLeave={(e) => {
                        const nextTarget = e.relatedTarget;
                        if (nextTarget instanceof Node && buttonRootRef.current?.contains(nextTarget)) {
                            return;
                        }

                        setIsDeleteFocus(false);
                        setIsDeleteHot(false);
                        handleSensorLeave();
                    }}
                    style={{ pointerEvents: 'stroke', cursor: 'default' }}
                />
            )}

            {/* Moving disconnect maintenance point */}
            {onDisconnectConnection && (
                <g
                    ref={buttonRootRef}
                    transform="translate(0 0)"
                    style={{
                        pointerEvents: isDeleteFocus ? 'all' : 'none',
                        transform: 'translate(0px, 0px)',
                        transformOrigin: '0 0',
                        willChange: 'transform'
                    }}
                >
                    <g
                        className="connector-transition"
                        transform={`scale(${isDeleteFocus ? 1 : 0.96})`}
                        onMouseEnter={() => {
                            handlePointEnter();
                        }}
                        onMouseLeave={(e) => {
                            const nextTarget = e.relatedTarget;
                            if (nextTarget instanceof Node && nextTarget === sensorPathRef.current) {
                                return;
                            }

                            setIsDeleteHot(false);
                            setIsDeleteFocus(false);
                            handlePointLeave();
                        }}
                        style={{
                            opacity: isDeleteFocus ? 1 : CRUISING_DOT_OPACITY
                        }}
                    >
                        <line
                            x1="-15"
                            y1="0"
                            x2="-10"
                            y2="0"
                            stroke={visibleStroke}
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            opacity={deleteStemOpacity}
                            style={{ pointerEvents: 'none' }}
                        />
                        {/* Clickable maintenance button */}
                        <g
                            className="cursor-pointer"
                            onMouseEnter={() => setIsDeleteHot(true)}
                            onMouseLeave={() => setIsDeleteHot(false)}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isDeleteFocus) return;

                                onDisconnectConnection(parent.id, child.id);
                            }}
                        >
                            {/* Outer clickable hit circle */}
                            <circle
                                r={deleteHitRadius}
                                fill="transparent"
                                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                            />

                            {/* Cruising signal halo */}
                            <circle
                                r={CRUISING_DOT_RADIUS + 3.5}
                                fill={palette.deleteHalo}
                                opacity={deleteHaloOpacity}
                                style={{ pointerEvents: 'none' }}
                            />

                            {/* Visual circle */}
                            <circle
                                r={deleteVisualRadius}
                                fill={deleteSurface}
                                stroke={deleteBorder}
                                strokeWidth={deleteVisualStrokeWidth}
                                style={{ pointerEvents: 'none' }}
                            />

                            {/* Cruising signal center */}
                            <circle
                                r="2"
                                fill={deleteSignal}
                                opacity={deleteSignalOpacity}
                                style={{ pointerEvents: 'none' }}
                            />

                            {/* Minus icon */}
                            <line
                                x1="-4.5"
                                y1="0"
                                x2="4.5"
                                y2="0"
                                stroke={deleteGlyph}
                                strokeWidth="2"
                                strokeLinecap="round"
                                opacity={deleteGlyphOpacity}
                                style={{ pointerEvents: 'none' }}
                            />
                        </g>
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

            connections.push(
                <ConnectionItem
                    key={edgeKey}
                    parent={parent}
                    child={node}
                    path={path}
                    viewportZoom={viewport.zoom}
                    canvasTheme={canvasTheme}
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

            const palette = CONNECTION_COLORS[canvasTheme];

            tempLine = (
                <g className="pointer-events-none">
                    <path
                        d={path}
                        stroke={palette.selected}
                        strokeWidth={CONNECTION_WIDTHS.temporaryHalo}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        opacity="0.12"
                    />
                    <path
                        d={path}
                        stroke={palette.selected}
                        strokeWidth={CONNECTION_WIDTHS.temporaryMain}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        opacity="0.92"
                    />
                    <path
                        d={path}
                        stroke={palette.selected}
                        strokeWidth={CONNECTION_WIDTHS.flow}
                        strokeDasharray={CONNECTION_DASH.temporary}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        opacity="0.42"
                        className="connector-flow-path"
                    />
                    <circle
                        cx={endX}
                        cy={endY}
                        r="3.5"
                        fill={canvasTheme === 'dark' ? '#101210' : '#F8FAF4'}
                        stroke={palette.selected}
                        strokeWidth="1.6"
                        opacity="0.95"
                    />
                </g>
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
