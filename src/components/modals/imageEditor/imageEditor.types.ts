/**
 * imageEditor.types.ts
 * 
 * Shared types and constants for the Image Editor modal.
 */

import { Language } from '../../../i18n/translations';
import { FALLBACK_IMAGE_MODELS } from '../../../config/imageModels';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Arrow element for annotations
 */
export interface ArrowElement {
    id: string;
    type: 'arrow';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: string;
    lineWidth: number;
}

/**
 * Text element for annotations
 */
export interface TextElement {
    id: string;
    type: 'text';
    x: number;
    y: number;
    text: string;
    fontSize: number;
    color: string;
    fontFamily: string;
}

/**
 * Shape element for rectangle and ellipse annotations
 */
export interface ShapeElement {
    id: string;
    type: 'shape';
    shape: 'rectangle' | 'ellipse';
    x: number;
    y: number;
    width: number;
    height: number;
    strokeColor: string;
    strokeWidth: number;
    fillColor?: string;
    fillOpacity?: number;
    filled: boolean;
}

/**
 * Union type for all drawable elements
 */
export type EditorElement = ArrowElement | TextElement | ShapeElement;

/**
 * Snapshot of editor state for undo/redo
 */
export interface HistoryState {
    canvasData: string | null; // Base64 image data of brush canvas
    elements: EditorElement[];
    imageUrl?: string; // Current image URL (for crop undo/redo)
}

export interface ImageEditorGenerateOptions {
    imageModel?: string;
    aspectRatio?: string;
    resolution?: string;
    compositeImageDataUrl?: string;
}

/**
 * Props for the main ImageEditorModal component
 */
export interface ImageEditorModalProps {
    isOpen: boolean;
    nodeId: string;
    imageUrl?: string;
    initialPrompt?: string;
    initialModel?: string;
    initialAspectRatio?: string;
    initialResolution?: string;
    initialElements?: EditorElement[];
    initialCanvasData?: string;
    initialCanvasSize?: { width: number; height: number };
    initialBackgroundUrl?: string; // Original/clean image for editing

    // Theme and language
    canvasTheme?: 'dark' | 'light';
    language?: Language;

    onClose: () => void;
    onGenerate: (
        id: string,
        prompt: string,
        count: number,
        options?: ImageEditorGenerateOptions
    ) => void;
    onUpdate: (id: string, updates: any) => void;
}

/**
 * Image model configuration
 */
export interface ImageModel {
    id: string;
    name: string;
    provider: string;
    supportsImageToImage: boolean;
    supportsMultiImage: boolean;
    recommended?: boolean;
    disabled?: boolean;
    disabledReason?: 'notConfigured' | 'notConnected' | string;
    status?: 'available' | 'disabled' | 'comingSoon';
    resolutions: string[];
    aspectRatios: string[];
}

/**
 * Common props for Image Editor sub-components
 */
export interface ImageEditorThemeProps {
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Available image generation models.
 */
export const IMAGE_MODELS: ImageModel[] = FALLBACK_IMAGE_MODELS;

/**
 * Preset brush colors
 */
export const PRESET_COLORS = ['#ff0000', '#3b82f6', '#22c55e', '#eab308', '#ec4899', '#8b5cf6'];
