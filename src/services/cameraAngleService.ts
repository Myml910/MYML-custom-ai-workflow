/**
 * cameraAngleService.ts
 *
 * Service for preparing a new camera angle image task.
 *
 * Current implementation:
 * - Uses the existing asynchronous image task pipeline.
 * - Sends the source image as reference input.
 * - Converts rotation / tilt / zoom / wideAngle into a prompt.
 * - Uses T8 GPT Image 2 Edit by default.
 */

import type { ImageQuality } from '../types';
import { T8_GPT_IMAGE_2_EDIT_MODEL_ID, normalizeImageQuality } from '../config/imageModels';

// ============================================================================
// TYPES
// ============================================================================

export interface CameraAngleSettings {
    rotation: number;   // Horizontal camera rotation, negative = left, positive = right
    tilt: number;       // Vertical camera tilt, negative = low angle, positive = high angle
    zoom: number;       // 0-100. Higher = closer camera
    wideAngle?: boolean;
}

export interface CameraAngleTaskInput {
    prompt: string;
    imageModel: typeof T8_GPT_IMAGE_2_EDIT_MODEL_ID;
    aspectRatio: string;
    resolution: string;
    quality: ImageQuality;
    referenceImages: string[];
    source: 'camera-angle';
    capability: 'camera-control';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CAMERA_ANGLE_IMAGE_MODEL = T8_GPT_IMAGE_2_EDIT_MODEL_ID;
export const CAMERA_ANGLE_DISPLAY_MODEL = 'T8 GPT Image 2 Angle Reframe';
const DEFAULT_ASPECT_RATIO = 'Auto';
const DEFAULT_RESOLUTION = 'Auto';
const DEFAULT_QUALITY: ImageQuality = 'auto';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert a URL / blob URL / data URL to a data URL base64 string.
 *
 * The image task endpoint accepts referenceImages, so we keep the data URL format
 * instead of stripping the prefix.
 */
async function urlToBase64(url: string): Promise<string> {
    if (url.startsWith('data:image')) {
        return url;
    }

    try {
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('[CameraAngle] Error converting URL to base64:', error);
        throw new Error('Failed to load source image for camera angle generation.');
    }
}

/**
 * Convert numeric camera settings into a natural language prompt.
 *
 * GPT Image 2 does not directly understand structured camera parameters like:
 * rotation=30, tilt=-10, zoom=40.
 *
 * So we translate those values into visual camera instructions.
 */
function buildCameraAnglePrompt(settings: CameraAngleSettings): string {
    const { rotation, tilt, zoom, wideAngle } = settings;

    const parts: string[] = [];

    parts.push(
        'Generate a new image from the provided reference image, changing only the camera viewing angle.'
    );

    parts.push(
        'Preserve the same subject identity, outfit, object design, colors, materials, lighting style, background style, and overall visual style as much as possible.'
    );

    parts.push(
        'Do not redesign the subject. Do not change the character, product, clothing, materials, or main scene elements.'
    );

    // Horizontal rotation
    if (rotation > 0) {
        parts.push(
            `Rotate the camera approximately ${Math.round(Math.abs(rotation))} degrees to the right, creating a right-side three-quarter view when possible.`
        );
    } else if (rotation < 0) {
        parts.push(
            `Rotate the camera approximately ${Math.round(Math.abs(rotation))} degrees to the left, creating a left-side three-quarter view when possible.`
        );
    } else {
        parts.push(
            'Keep the horizontal camera direction mostly centered.'
        );
    }

    // Vertical tilt
    if (tilt > 0) {
        parts.push(
            `Tilt the camera downward by approximately ${Math.round(Math.abs(tilt))} degrees, showing the subject from a slightly higher viewpoint.`
        );
    } else if (tilt < 0) {
        parts.push(
            `Tilt the camera upward by approximately ${Math.round(Math.abs(tilt))} degrees, showing the subject from a slightly lower viewpoint.`
        );
    } else {
        parts.push(
            'Keep the vertical camera angle mostly level.'
        );
    }

    // Zoom
    if (zoom >= 70) {
        parts.push(
            'Move the camera much closer to the subject, creating a close-up composition while preserving the subject structure.'
        );
    } else if (zoom >= 35) {
        parts.push(
            'Move the camera slightly closer to the subject, with a tighter framing.'
        );
    } else if (zoom > 0) {
        parts.push(
            'Apply a subtle camera push-in while keeping most of the original composition visible.'
        );
    } else if (zoom <= -70) {
        parts.push(
            'Move the camera much farther away from the subject, creating a wider framing with more surrounding space while preserving the same scene.'
        );
    } else if (zoom <= -35) {
        parts.push(
            'Move the camera farther away from the subject, with a looser framing that shows more of the surrounding scene.'
        );
    } else if (zoom < 0) {
        parts.push(
            'Move the camera slightly farther away from the subject, applying a subtle wider framing.'
        );
    } else {
        parts.push(
            'Keep the framing distance similar to the reference image.'
        );
    }

    // Wide angle
    if (wideAngle) {
        parts.push(
            'Use a mild wide-angle lens perspective with subtle edge perspective distortion, but avoid extreme fisheye distortion.'
        );
    }

    parts.push(
        'The result should look like the same scene captured from a different camera position, not a completely new design.'
    );

    return parts.join('\n');
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Build the asynchronous T8 GPT Image 2 Edit task input for a camera-angle reframe.
 *
 * @param imageUrl - URL or base64 data URL of the source image
 * @param rotation - Horizontal rotation in degrees
 * @param tilt - Vertical tilt in degrees
 * @param zoom - Zoom level from 0 to 100
 * @param wideAngle - Whether to use a mild wide-angle perspective
 */
export async function buildCameraAngleTaskInput(
    imageUrl: string,
    rotation: number,
    tilt: number,
    zoom: number,
    wideAngle: boolean = false,
    options: {
        aspectRatio?: string;
        resolution?: string;
        quality?: ImageQuality;
    } = {}
): Promise<CameraAngleTaskInput> {
    if (!imageUrl) {
        throw new Error('Missing source image for camera angle generation.');
    }

    const hasNoAngleChange =
        rotation === 0 &&
        tilt === 0 &&
        zoom === 0 &&
        !wideAngle;

    if (hasNoAngleChange) {
        throw new Error('No camera movement requested.');
    }

    const prompt = buildCameraAnglePrompt({
        rotation,
        tilt,
        zoom,
        wideAngle
    });

    console.log('[CameraAngle] Preparing T8 GPT Image 2 Edit task:', {
        rotation,
        tilt,
        zoom,
        wideAngle,
        imageModel: CAMERA_ANGLE_IMAGE_MODEL,
        quality: normalizeImageQuality(options.quality || DEFAULT_QUALITY),
        prompt
    });

    const imageBase64 = await urlToBase64(imageUrl);

    return {
        prompt,
        imageModel: CAMERA_ANGLE_IMAGE_MODEL,
        aspectRatio: options.aspectRatio || DEFAULT_ASPECT_RATIO,
        resolution: options.resolution || DEFAULT_RESOLUTION,
        quality: normalizeImageQuality(options.quality || DEFAULT_QUALITY),
        referenceImages: [imageBase64],
        source: 'camera-angle',
        capability: 'camera-control'
    };
}

/**
 * Kept for compatibility with old checks.
 * Since GPT Image 2 uses the existing generationService,
 * there is no separate Modal endpoint required.
 */
export function isEndpointConfigured(): boolean {
    return true;
}
