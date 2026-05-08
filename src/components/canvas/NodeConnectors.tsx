/**
 * NodeConnectors.tsx
 *
 * Renders the left and right connector buttons for a node.
 * Handles pointer events for drag-to-connect functionality.
 */

import React, { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';

interface NodeConnectorsProps {
    nodeId: string;
    onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
    canvasTheme?: 'dark' | 'light';
}

// ============================================================================
// PLUS BUTTON MAGNET CONFIG
// ============================================================================

// Controls how far from the plus button the cursor can be before the button starts following.
// This radius now scales with the rendered canvas/page scale.
const MAGNET_RADIUS = 90;

// Controls how close the button follows the cursor.
// 0.75 = noticeable follow, not fully sticking to cursor.
const FOLLOW_RATIO = 0.75;

const IDLE_SCALE = 1;
const HOVER_SCALE = 1.08;

// Lower = softer/slower. Higher = faster/snappier.
const FOLLOW_EASE = 0.18;

const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
};

// ============================================================================
// STABLE MAGNET HOOK
// ============================================================================

const useStableMagnet = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const frameRef = useRef<number | null>(null);

    const currentRef = useRef({
        x: 0,
        y: 0,
        scale: IDLE_SCALE
    });

    useEffect(() => {
        const wrapper = wrapperRef.current;
        const button = buttonRef.current;

        if (!wrapper || !button) return;

        const applyTransform = () => {
            const current = currentRef.current;

            button.style.setProperty('--magnet-x', `${current.x}px`);
            button.style.setProperty('--magnet-y', `${current.y}px`);
            button.style.setProperty('--magnet-scale', `${current.scale}`);
        };

        const setTransform = (
            targetX: number,
            targetY: number,
            targetScale: number
        ) => {
            const current = currentRef.current;

            current.x += (targetX - current.x) * FOLLOW_EASE;
            current.y += (targetY - current.y) * FOLLOW_EASE;
            current.scale += (targetScale - current.scale) * FOLLOW_EASE;

            if (Math.abs(current.x) < 0.001) current.x = 0;
            if (Math.abs(current.y) < 0.001) current.y = 0;

            applyTransform();
        };

        const resetTransform = () => {
            currentRef.current = {
                x: 0,
                y: 0,
                scale: IDLE_SCALE
            };

            applyTransform();
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (frameRef.current !== null) return;

            frameRef.current = window.requestAnimationFrame(() => {
                frameRef.current = null;

                // Use wrapper center, not the moving button center.
                // This prevents feedback jitter.
                const rect = wrapper.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const dx = e.clientX - centerX;
                const dy = e.clientY - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                /**
                 * Detect rendered scale:
                 * - rect.width is the actual screen-rendered size
                 * - wrapper.offsetWidth is the local CSS size before transform
                 *
                 * This makes the magnet trigger radius change with page/canvas zoom.
                 */
                const renderedScale = Math.max(
                    rect.width / Math.max(wrapper.offsetWidth, 1),
                    0.01
                );

                const effectiveMagnetRadius = MAGNET_RADIUS * renderedScale;

                if (distance > effectiveMagnetRadius) {
                    setTransform(0, 0, IDLE_SCALE);
                    return;
                }

                const safeDistance = Math.max(distance, 1);
                const strength = clamp(1 - safeDistance / effectiveMagnetRadius, 0, 1);

                /**
                 * Do not divide by renderedScale here.
                 * This makes the follow distance change naturally with page/canvas zoom.
                 */
                const offsetX = dx * FOLLOW_RATIO;
                const offsetY = dy * FOLLOW_RATIO;

                const scale = IDLE_SCALE + strength * (HOVER_SCALE - IDLE_SCALE);

                setTransform(offsetX, offsetY, scale);
            });
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: true });

        resetTransform();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);

            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
            }
        };
    }, []);

    return { wrapperRef, buttonRef };
};

// ============================================================================
// MAGNETIC CONNECTOR BUTTON
// ============================================================================

const MagneticConnectorButton: React.FC<{
    nodeId: string;
    side: 'left' | 'right';
    onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
    canvasTheme: 'dark' | 'light';
}> = ({
    nodeId,
    side,
    onConnectorDown,
    canvasTheme
}) => {
    const isDark = canvasTheme === 'dark';
    const { wrapperRef, buttonRef } = useStableMagnet();

    const sideClassName = side === 'left'
        ? '-left-12 top-1/2 -translate-y-1/2'
        : '-right-12 top-1/2 -translate-y-1/2';

    const themeClassName = isDark
        ? 'border-neutral-700 bg-[#0f0f0f] text-neutral-400 hover:text-[#D8FF00] hover:border-[#D8FF00] hover:shadow-[0_0_18px_rgba(216,255,0,0.55)]'
        : 'border-neutral-300 bg-white text-neutral-500 hover:text-lime-600 hover:border-lime-500 hover:shadow-[0_0_18px_rgba(132,204,22,0.22)] shadow-sm';

    return (
        <div
            ref={wrapperRef}
            className={`absolute w-12 h-12 flex items-center justify-center opacity-0 group-hover/node:opacity-100 z-10 transition-opacity duration-150 ${sideClassName}`}
        >
            <button
                ref={buttonRef}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onConnectorDown(e, nodeId, side);
                }}
                aria-label={side === 'left' ? 'Connect input' : 'Connect output'}
                className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-crosshair transition-[background-color,border-color,color,box-shadow] duration-150 ${themeClassName}`}
                style={{
                    transform: 'translate(var(--magnet-x, 0px), var(--magnet-y, 0px)) scale(var(--magnet-scale, 1))',
                    willChange: 'transform'
                }}
                title={side === 'left' ? 'Connect input' : 'Connect output'}
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
    canvasTheme = 'dark'
}) => {
    return (
        <>
            <MagneticConnectorButton
                nodeId={nodeId}
                side="left"
                onConnectorDown={onConnectorDown}
                canvasTheme={canvasTheme}
            />

            <MagneticConnectorButton
                nodeId={nodeId}
                side="right"
                onConnectorDown={onConnectorDown}
                canvasTheme={canvasTheme}
            />
        </>
    );
};
