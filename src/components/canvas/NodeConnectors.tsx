/**
 * NodeConnectors.tsx
 *
 * Renders the left and right connector buttons for a node.
 * Handles pointer events for drag-to-connect functionality.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Language, t } from '../../i18n/translations';

interface NodeConnectorsProps {
    nodeId: string;
    onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
    forceVisible?: boolean;
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

// ============================================================================
// PLUS BUTTON MAGNET CONFIG
// ============================================================================

const MAGNET_RADIUS = 88;
const FOLLOW_RATIO = 0.48;
const IDLE_SCALE = 1;
const HOVER_SCALE = 1.05;

const CONNECTOR_PORT = {
    rootWidth: 64,
    rootHeight: 56,
    buttonSize: 42,
    outerSize: 40,
    innerSize: 32,
    glyphSize: 16
} as const;

const CONNECTOR_PORT_COLORS = {
    dark: {
        tick: 'bg-[#D8FF00]/35',
        outer: 'border-[#D8FF00]/34 bg-[#D8FF00]/7 shadow-[0_8px_18px_rgba(0,0,0,0.26)]',
        inner: 'border-white/16 bg-[#12140F] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] group-hover/node:border-[#D8FF00]/50 group-hover/node:bg-[#171A13] group-hover/connector:border-[#D8FF00]/68 group-hover/connector:bg-[#1D2216] active:border-[#D8FF00]/80 active:bg-[#202713]',
        glyph: 'text-white/68 group-hover/node:text-[#D8FF00] group-hover/connector:text-[#D8FF00] active:text-[#D8FF00]'
    },
    light: {
        tick: 'bg-lime-700/28',
        outer: 'border-lime-700/28 bg-lime-100/40 shadow-[0_8px_18px_rgba(15,23,42,0.12)]',
        inner: 'border-neutral-300 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] group-hover/node:border-lime-700/50 group-hover/node:bg-lime-50 group-hover/connector:border-lime-700/68 group-hover/connector:bg-lime-50 active:border-lime-700/80 active:bg-lime-100',
        glyph: 'text-neutral-600 group-hover/node:text-lime-700 group-hover/connector:text-lime-700 active:text-lime-800'
    }
} as const;

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
};

// ============================================================================
// LOCAL MAGNET HOOK
// ============================================================================

const useLocalMagnet = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const pointerRef = useRef<{ x: number; y: number } | null>(null);
    const boundsRef = useRef({
        centerX: 0,
        centerY: 0,
        radius: MAGNET_RADIUS
    });

    const applyTransform = (x: number, y: number, scale: number) => {
        const button = buttonRef.current;
        if (!button) return;

        button.style.setProperty('--magnet-x', `${x}px`);
        button.style.setProperty('--magnet-y', `${y}px`);
        button.style.setProperty('--magnet-scale', `${scale}`);
    };

    const resetTransform = () => {
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }

        pointerRef.current = null;
        applyTransform(0, 0, IDLE_SCALE);
    };

    const refreshBounds = () => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const renderedScale = Math.max(rect.width / Math.max(wrapper.offsetWidth, 1), 0.01);

        boundsRef.current = {
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            radius: MAGNET_RADIUS * renderedScale
        };
    };

    const updateFromPointer = () => {
        frameRef.current = null;

        if (!pointerRef.current) return;

        const { centerX, centerY, radius } = boundsRef.current;
        const dx = pointerRef.current.x - centerX;
        const dy = pointerRef.current.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > radius) {
            applyTransform(0, 0, IDLE_SCALE);
            return;
        }

        const strength = clamp(1 - Math.max(distance, 1) / radius, 0, 1);
        const offsetX = dx * FOLLOW_RATIO * strength;
        const offsetY = dy * FOLLOW_RATIO * strength;
        const scale = IDLE_SCALE + strength * (HOVER_SCALE - IDLE_SCALE);

        applyTransform(offsetX, offsetY, scale);
    };

    const handlePointerEnter = () => {
        refreshBounds();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };

        if (frameRef.current !== null) return;

        frameRef.current = window.requestAnimationFrame(updateFromPointer);
    };

    const handlePointerLeave = () => {
        resetTransform();
    };

    return {
        wrapperRef,
        buttonRef,
        handlePointerEnter,
        handlePointerMove,
        handlePointerLeave
    };
};

// ============================================================================
// MAGNETIC CONNECTOR BUTTON
// ============================================================================

const MagneticConnectorButton: React.FC<{
    nodeId: string;
    side: 'left' | 'right';
    onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
    onDragVisibilityStart: () => void;
    forceVisible: boolean;
    canvasTheme: 'dark' | 'light';
    language: Language;
}> = ({
    nodeId,
    side,
    onConnectorDown,
    onDragVisibilityStart,
    forceVisible,
    canvasTheme,
    language
}) => {
    const {
        wrapperRef,
        buttonRef,
        handlePointerEnter,
        handlePointerMove,
        handlePointerLeave
    } = useLocalMagnet();

    const sideClassName = side === 'left'
        ? '-left-[52px] top-1/2 -translate-y-1/2'
        : '-right-[52px] top-1/2 -translate-y-1/2';
    const tickClassName = side === 'left'
        ? 'right-[12px]'
        : 'left-[12px]';
    const visibilityClassName = forceVisible
        ? 'opacity-100 pointer-events-auto'
        : 'opacity-0 pointer-events-none group-hover/node:opacity-100 group-hover/node:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto';
    const buttonOpacityClassName = forceVisible
        ? 'opacity-100'
        : 'opacity-[0.5] group-hover/node:opacity-100';
    const tickOpacityClassName = forceVisible
        ? 'opacity-[0.22]'
        : 'opacity-0 group-hover/node:opacity-[0.18]';
    const outerOpacityClassName = forceVisible
        ? 'opacity-[0.28]'
        : 'opacity-0 group-hover/node:opacity-[0.24]';

    const portColors = CONNECTOR_PORT_COLORS[canvasTheme];
    const connectorLabel = side === 'left' ? t(language, 'connectInput') : t(language, 'connectOutput');

    return (
        <div
            ref={wrapperRef}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`connector-transition absolute flex items-center justify-center ${visibilityClassName} z-[120] ${sideClassName}`}
            style={{
                width: CONNECTOR_PORT.rootWidth,
                height: CONNECTOR_PORT.rootHeight
            }}
        >
            <button
                ref={buttonRef}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onDragVisibilityStart();
                    onConnectorDown(e, nodeId, side);
                }}
                aria-label={connectorLabel}
                className={`connector-transition group/connector relative flex cursor-crosshair items-center justify-center rounded-xl border-0 bg-transparent p-0 ${buttonOpacityClassName} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 active:opacity-100 group-hover/connector:opacity-100`}
                style={{
                    width: CONNECTOR_PORT.buttonSize,
                    height: CONNECTOR_PORT.buttonSize,
                    transform: 'translate(var(--magnet-x, 0px), var(--magnet-y, 0px)) scale(var(--magnet-scale, 1))',
                    transitionProperty: 'opacity, transform',
                    transitionDuration: '150ms',
                    willChange: 'transform'
                }}
                title={connectorLabel}
            >
                <span
                    aria-hidden="true"
                    className={`connector-transition absolute top-1/2 h-px w-3 -translate-y-1/2 rounded-full group-hover/connector:opacity-50 ${tickOpacityClassName} ${tickClassName} ${portColors.tick}`}
                />
                <span
                    aria-hidden="true"
                    className={`connector-transition absolute rounded-[14px] border group-hover/connector:opacity-40 active:opacity-[0.48] ${outerOpacityClassName} ${portColors.outer}`}
                    style={{
                        width: CONNECTOR_PORT.outerSize,
                        height: CONNECTOR_PORT.outerSize
                    }}
                />
                <span
                    aria-hidden="true"
                    className={`connector-transition absolute rounded-xl border ${portColors.inner}`}
                    style={{
                        width: CONNECTOR_PORT.innerSize,
                        height: CONNECTOR_PORT.innerSize
                    }}
                />
                <Plus
                    size={CONNECTOR_PORT.glyphSize}
                    strokeWidth={2.45}
                    className={`connector-transition relative z-10 ${portColors.glyph}`}
                />
            </button>
        </div>
    );
};

// ============================================================================
// COMPONENT
// ============================================================================

export const NodeConnectors: React.FC<NodeConnectorsProps> = ({
    nodeId,
    onConnectorDown,
    forceVisible = false,
    canvasTheme = 'dark',
    language = 'zh'
}) => {
    const [isDraggingFromConnector, setIsDraggingFromConnector] = useState(false);
    const dragVisibilityCleanupRef = useRef<(() => void) | null>(null);
    const shouldForceVisible = forceVisible || isDraggingFromConnector;

    const stopDragVisibility = () => {
        setIsDraggingFromConnector(false);
        dragVisibilityCleanupRef.current?.();
        dragVisibilityCleanupRef.current = null;
    };

    const startDragVisibility = () => {
        setIsDraggingFromConnector(true);

        if (dragVisibilityCleanupRef.current) return;

        const stop = () => stopDragVisibility();
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        window.addEventListener('blur', stop);

        dragVisibilityCleanupRef.current = () => {
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            window.removeEventListener('blur', stop);
        };
    };

    useEffect(() => {
        return () => {
            dragVisibilityCleanupRef.current?.();
            dragVisibilityCleanupRef.current = null;
        };
    }, []);

    return (
        <>
            <MagneticConnectorButton
                nodeId={nodeId}
                side="left"
                onConnectorDown={onConnectorDown}
                onDragVisibilityStart={startDragVisibility}
                forceVisible={shouldForceVisible}
                canvasTheme={canvasTheme}
                language={language}
            />

            <MagneticConnectorButton
                nodeId={nodeId}
                side="right"
                onConnectorDown={onConnectorDown}
                onDragVisibilityStart={startDragVisibility}
                forceVisible={shouldForceVisible}
                canvasTheme={canvasTheme}
                language={language}
            />
        </>
    );
};
