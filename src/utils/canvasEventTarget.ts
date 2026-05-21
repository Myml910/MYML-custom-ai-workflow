const CANVAS_BACKGROUND_ID = 'canvas-background';

export type CanvasSurfaceIgnoreReason =
    | 'outside_canvas'
    | 'non_element_target'
    | 'interactive_target'
    | 'node_or_control_target';

interface CanvasSurfaceEventLike {
    currentTarget: EventTarget | null;
    target: EventTarget | null;
    nativeEvent?: {
        composedPath?: () => EventTarget[];
    };
}

const INTERACTIVE_SELECTOR = [
    'button',
    'input',
    'textarea',
    'select',
    'a',
    'summary',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[role="button"]',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[data-no-canvas-pan]',
    '[data-canvas-interactive]',
    '[data-node-id]'
].join(',');

const NODE_OR_CONTROL_CLASS_TOKENS = [
    'group/node',
    'group/nodecard',
    'cursor-move'
];

const INTERACTIVE_CLASS_TOKENS = [
    'cursor-pointer'
];

const getElementFromTarget = (target: EventTarget | null): Element | null => {
    if (target instanceof Element) return target;
    if (target instanceof Node) return target.parentElement;
    return null;
};

const getCanvasElement = (event: CanvasSurfaceEventLike): Element | null => {
    if (event.currentTarget instanceof Element) {
        return event.currentTarget;
    }

    return document.getElementById(CANVAS_BACKGROUND_ID);
};

const closestWithinCanvas = (
    element: Element,
    canvas: Element,
    selector: string
): Element | null => {
    const match = element.closest(selector);
    return match && canvas.contains(match) ? match : null;
};

const hasClassTokenBetween = (
    element: Element,
    canvas: Element,
    tokens: string[]
) => {
    let current: Element | null = element;

    while (current && current !== canvas) {
        if (tokens.some(token => current?.classList.contains(token))) {
            return true;
        }

        current = current.parentElement;
    }

    return false;
};

export const getCanvasSurfaceEventIgnoreReason = (
    event: CanvasSurfaceEventLike
): CanvasSurfaceIgnoreReason | null => {
    const canvas = getCanvasElement(event);
    const targetNode = event.target;

    if (!canvas || !(targetNode instanceof Node) || !canvas.contains(targetNode)) {
        return 'outside_canvas';
    }

    const targetElement = getElementFromTarget(targetNode);
    if (!targetElement) {
        return 'non_element_target';
    }

    if (closestWithinCanvas(targetElement, canvas, INTERACTIVE_SELECTOR)) {
        return 'interactive_target';
    }

    if (hasClassTokenBetween(targetElement, canvas, NODE_OR_CONTROL_CLASS_TOKENS)) {
        return 'node_or_control_target';
    }

    if (hasClassTokenBetween(targetElement, canvas, INTERACTIVE_CLASS_TOKENS)) {
        return 'interactive_target';
    }

    return null;
};

export const isCanvasSurfaceEvent = (event: CanvasSurfaceEventLike) =>
    getCanvasSurfaceEventIgnoreReason(event) === null;

const getTargetSummary = (target: EventTarget | null) => {
    const element = getElementFromTarget(target);
    if (!element) return { tag: 'unknown' };

    return {
        tag: element.tagName.toLowerCase(),
        id: element.id || undefined,
        className: typeof element.className === 'string' ? element.className : undefined
    };
};

const getPathSummary = (event: CanvasSurfaceEventLike) => {
    const path = event.nativeEvent?.composedPath?.() ?? [];

    return path.slice(0, 8).map(item => {
        if (!(item instanceof Element)) return String(item);

        const tag = item.tagName.toLowerCase();
        const id = item.id ? `#${item.id}` : '';
        const className = typeof item.className === 'string' && item.className
            ? `.${item.className.split(/\s+/).slice(0, 3).join('.')}`
            : '';

        return `${tag}${id}${className}`;
    });
};

let lastDebugAt = 0;

const isDevRuntime = () => Boolean(
    (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
);

export const debugCanvasSurfaceEventIgnored = (
    eventName: string,
    event: CanvasSurfaceEventLike,
    reason: CanvasSurfaceIgnoreReason
) => {
    if (!isDevRuntime()) return;

    const now = performance.now();
    if (now - lastDebugAt < 600) return;
    lastDebugAt = now;

    console.debug('[CanvasInteraction][ignored]', {
        eventName,
        reason,
        target: getTargetSummary(event.target),
        path: getPathSummary(event)
    });
};
