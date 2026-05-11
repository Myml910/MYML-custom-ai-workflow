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
const FOLLOW_RATIO = 0.42;
const IDLE_SCALE = 1;
const HOVER_SCALE = 1.045;

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
    const isDark = canvasTheme === 'dark';
    const {
        wrapperRef,
        buttonRef,
        handlePointerEnter,
        handlePointerMove,
        handlePointerLeave
    } = useLocalMagnet();

    const sideClassName = side === 'left'
        ? '-left-[72px] top-1/2 -translate-y-1/2'
        : '-right-[72px] top-1/2 -translate-y-1/2';

    const themeClassName = isDark
        ? 'border-neutral-700 bg-[#101210] text-neutral-400 hover:text-[#D8FF00] hover:border-[#D8FF00]/70 hover:bg-[#151815]'
        : 'border-neutral-300 bg-white text-neutral-500 hover:text-lime-600 hover:border-lime-500 hover:bg-lime-50';
    const connectorLabel = side === 'left' ? t(language, 'connectInput') : t(language, 'connectOutput');

    return (
        <div
            ref={wrapperRef}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            className={`absolute w-24 h-24 flex items-center justify-center opacity-0 pointer-events-none group-hover/node:opacity-100 group-hover/node:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto z-10 transition-opacity duration-150 ${sideClassName}`}
        >
            <button
                ref={buttonRef}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onConnectorDown(e, nodeId, side);
                }}
                aria-label={connectorLabel}
                className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-crosshair transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${themeClassName}`}
                style={{
                    transform: 'translate(var(--magnet-x, 0px), var(--magnet-y, 0px)) scale(var(--magnet-scale, 1))',
                    transitionProperty: 'background-color, border-color, color, opacity, transform',
                    transitionDuration: '150ms',
                    willChange: 'transform'
                }}
                title={connectorLabel}
            >
                <Plus size={18} />
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
