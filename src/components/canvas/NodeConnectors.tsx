/**
 * NodeConnectors.tsx
 *
 * Renders the left and right connector buttons for a node.
 * Handles pointer events for drag-to-connect functionality.
 */

import React, { useRef } from 'react';
import { Plus } from 'lucide-react';
import { Language, t } from '../../i18n/translations';

interface NodeConnectorsProps {
    nodeId: string;
    onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
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
    rootSize: 36,
    outerSize: 31,
    innerSize: 23,
    glyphSize: 13
} as const;

const CONNECTOR_PORT_COLORS = {
    dark: {
        tick: 'bg-[#D8FF00]/35',
        outer: 'border-[#D8FF00]/50 bg-[#D8FF00]/5',
        inner: 'border-white/14 bg-[#12140F] group-hover/node:border-[#D8FF00]/46 group-hover/node:bg-[#171A13] group-hover/connector:border-[#D8FF00]/58 group-hover/connector:bg-[#1C2016] active:border-[#D8FF00]/70',
        glyph: 'text-white/55 group-hover/node:text-[#D8FF00] group-hover/connector:text-[#D8FF00] active:text-[#D8FF00]'
    },
    light: {
        tick: 'bg-lime-700/28',
        outer: 'border-lime-700/38 bg-lime-100/30',
        inner: 'border-neutral-300 bg-white group-hover/node:border-lime-700/46 group-hover/node:bg-lime-50 group-hover/connector:border-lime-700/58 group-hover/connector:bg-lime-50 active:border-lime-700/70',
        glyph: 'text-neutral-500 group-hover/node:text-lime-700 group-hover/connector:text-lime-700 active:text-lime-700'
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
    canvasTheme: 'dark' | 'light';
    language: Language;
}> = ({
    nodeId,
    side,
    onConnectorDown,
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
        ? '-left-[38px] top-1/2 -translate-y-1/2'
        : '-right-[38px] top-1/2 -translate-y-1/2';
    const tickClassName = side === 'left'
        ? 'right-0'
        : 'left-0';

    const portColors = CONNECTOR_PORT_COLORS[canvasTheme];
    const connectorLabel = side === 'left' ? t(language, 'connectInput') : t(language, 'connectOutput');

    return (
        <div
            ref={wrapperRef}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`connector-transition absolute flex items-center justify-center opacity-0 pointer-events-none group-hover/node:opacity-100 group-hover/node:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto z-10 ${sideClassName}`}
            style={{
                width: CONNECTOR_PORT.rootSize,
                height: CONNECTOR_PORT.rootSize
            }}
        >
            <button
                ref={buttonRef}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onConnectorDown(e, nodeId, side);
                }}
                aria-label={connectorLabel}
                className="connector-transition group/connector relative flex h-9 w-9 cursor-crosshair items-center justify-center rounded-full border-0 bg-transparent p-0 opacity-[0.5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 active:opacity-100 group-hover/node:opacity-100 group-hover/connector:opacity-100"
                style={{
                    transform: 'translate(var(--magnet-x, 0px), var(--magnet-y, 0px)) scale(var(--magnet-scale, 1))',
                    transitionProperty: 'opacity, transform',
                    transitionDuration: '150ms',
                    willChange: 'transform'
                }}
                title={connectorLabel}
            >
                <span
                    aria-hidden="true"
                    className={`connector-transition absolute top-1/2 h-px w-2 -translate-y-1/2 rounded-full opacity-0 group-hover/node:opacity-[0.18] group-hover/connector:opacity-40 ${tickClassName} ${portColors.tick}`}
                />
                <span
                    aria-hidden="true"
                    className={`connector-transition absolute rounded-full border opacity-0 group-hover/node:opacity-[0.24] group-hover/connector:opacity-30 active:opacity-[0.36] ${portColors.outer}`}
                    style={{
                        width: CONNECTOR_PORT.outerSize,
                        height: CONNECTOR_PORT.outerSize
                    }}
                />
                <span
                    aria-hidden="true"
                    className={`connector-transition absolute rounded-full border ${portColors.inner}`}
                    style={{
                        width: CONNECTOR_PORT.innerSize,
                        height: CONNECTOR_PORT.innerSize
                    }}
                />
                <Plus
                    size={CONNECTOR_PORT.glyphSize}
                    strokeWidth={2.35}
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
    canvasTheme = 'dark',
    language = 'zh'
}) => {
    return (
        <>
            <MagneticConnectorButton
                nodeId={nodeId}
                side="left"
                onConnectorDown={onConnectorDown}
                canvasTheme={canvasTheme}
                language={language}
            />

            <MagneticConnectorButton
                nodeId={nodeId}
                side="right"
                onConnectorDown={onConnectorDown}
                canvasTheme={canvasTheme}
                language={language}
            />
        </>
    );
};
