import { IMAGE_QUALITY_OPTIONS, type ImageQuality } from '../types';

export interface ImageModelOption {
    id: string;
    label: string;
    name: string;
    description?: string;
    provider: string;
    providerChain?: string[];
    capabilities?: string[];
    experimental?: boolean;
    enabled?: boolean;
    supportsTextToImage: boolean;
    supportsImageToImage: boolean;
    supportsMultiImage: boolean;
    recommended?: boolean;
    disabled?: boolean;
    disabledReason?: 'notConfigured' | 'notConnected' | string;
    status?: 'available' | 'disabled' | 'comingSoon';
    resolutions: string[];
    aspectRatios: string[];
    supportsQuality?: boolean;
    qualities?: ImageQuality[];
}

export const ATLAS_TEXT_TO_IMAGE_MODEL_ID = 'custom-image-atlas-gpt-image-2-text';
export const ATLAS_IMAGE_EDIT_MODEL_ID = 'custom-image-atlas-gpt-image-2-edit';
export const ATLAS_NANO_BANANA_2_TEXT_MODEL_ID = 'custom-image-atlas-nano-banana-2-text';
export const ATLAS_NANO_BANANA_2_EDIT_MODEL_ID = 'custom-image-atlas-nano-banana-2-edit';
export const NEWAPI_GEMINI_3_1_FLASH_MODEL_ID = 'custom-image-newapi-gemini-3-1-flash';
export const NEWAPI_GPT_IMAGE_2_MODEL_ID = 'custom-image-newapi-gpt-image-2';
export const T8_GPT_IMAGE_2_MODEL_ID = 'custom-image-t8-gpt-image-2';
export const T8_NANO_BANANA_3_1_FLASH_MODEL_ID = 'custom-image-t8-nano-banana-3-1-flash';
export const T8_GPT_IMAGE_2_EDIT_MODEL_ID = 'custom-image-t8-gpt-image-2-edit';
export const T8_NANO_BANANA_3_1_FLASH_EDIT_MODEL_ID = 'custom-image-t8-nano-banana-3-1-flash-edit';

export const T8_GPT_IMAGE_QUALITY_MODEL_IDS = new Set([
    T8_GPT_IMAGE_2_MODEL_ID,
    T8_GPT_IMAGE_2_EDIT_MODEL_ID
]);

export const HIDDEN_IMAGE_MODEL_IDS = new Set([
    'custom-image-gpt-image-2',
    'custom-image-nano-banana-3-1-flash',
    NEWAPI_GEMINI_3_1_FLASH_MODEL_ID,
    NEWAPI_GPT_IMAGE_2_MODEL_ID
]);

export const VISIBLE_IMAGE_MODEL_IDS = new Set([
    ATLAS_TEXT_TO_IMAGE_MODEL_ID,
    ATLAS_IMAGE_EDIT_MODEL_ID,
    ATLAS_NANO_BANANA_2_TEXT_MODEL_ID,
    ATLAS_NANO_BANANA_2_EDIT_MODEL_ID,
    T8_GPT_IMAGE_2_MODEL_ID,
    T8_NANO_BANANA_3_1_FLASH_MODEL_ID,
    T8_GPT_IMAGE_2_EDIT_MODEL_ID,
    T8_NANO_BANANA_3_1_FLASH_EDIT_MODEL_ID
]);

const STATIC_IMAGE_MODEL_CAPABILITIES = new Map<string, Pick<ImageModelOption, 'supportsTextToImage' | 'supportsImageToImage' | 'supportsMultiImage'>>([
    [ATLAS_TEXT_TO_IMAGE_MODEL_ID, { supportsTextToImage: true, supportsImageToImage: false, supportsMultiImage: false }],
    [ATLAS_IMAGE_EDIT_MODEL_ID, { supportsTextToImage: false, supportsImageToImage: true, supportsMultiImage: true }],
    [ATLAS_NANO_BANANA_2_TEXT_MODEL_ID, { supportsTextToImage: true, supportsImageToImage: false, supportsMultiImage: false }],
    [ATLAS_NANO_BANANA_2_EDIT_MODEL_ID, { supportsTextToImage: false, supportsImageToImage: true, supportsMultiImage: true }],
    [NEWAPI_GEMINI_3_1_FLASH_MODEL_ID, { supportsTextToImage: true, supportsImageToImage: false, supportsMultiImage: false }],
    [NEWAPI_GPT_IMAGE_2_MODEL_ID, { supportsTextToImage: true, supportsImageToImage: false, supportsMultiImage: false }],
    [T8_GPT_IMAGE_2_MODEL_ID, { supportsTextToImage: true, supportsImageToImage: false, supportsMultiImage: false }],
    [T8_NANO_BANANA_3_1_FLASH_MODEL_ID, { supportsTextToImage: true, supportsImageToImage: false, supportsMultiImage: false }],
    [T8_GPT_IMAGE_2_EDIT_MODEL_ID, { supportsTextToImage: false, supportsImageToImage: true, supportsMultiImage: true }],
    [T8_NANO_BANANA_3_1_FLASH_EDIT_MODEL_ID, { supportsTextToImage: false, supportsImageToImage: true, supportsMultiImage: true }]
]);

const SAME_FAMILY_IMAGE_MODEL_FALLBACKS = new Map<string, string>([
    [T8_GPT_IMAGE_2_MODEL_ID, T8_GPT_IMAGE_2_EDIT_MODEL_ID],
    [T8_NANO_BANANA_3_1_FLASH_MODEL_ID, T8_NANO_BANANA_3_1_FLASH_EDIT_MODEL_ID],
    [T8_GPT_IMAGE_2_EDIT_MODEL_ID, T8_GPT_IMAGE_2_MODEL_ID],
    [T8_NANO_BANANA_3_1_FLASH_EDIT_MODEL_ID, T8_NANO_BANANA_3_1_FLASH_MODEL_ID]
]);

export const FALLBACK_IMAGE_MODELS: ImageModelOption[] = [
    {
        id: T8_GPT_IMAGE_2_MODEL_ID,
        label: 'T8 GPT Image 2',
        name: 'T8 GPT Image 2',
        provider: 't8',
        providerChain: ['t8'],
        capabilities: ['text-to-image'],
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        recommended: true,
        experimental: true,
        resolutions: ['Auto'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '3:2', '2:3', '2:1'],
        supportsQuality: true,
        qualities: [...IMAGE_QUALITY_OPTIONS]
    },
    {
        id: T8_GPT_IMAGE_2_EDIT_MODEL_ID,
        label: 'T8 GPT Image 2 Edit',
        name: 'T8 GPT Image 2 Edit',
        provider: 't8',
        providerChain: ['t8'],
        capabilities: ['image-to-image', 'multi-image'],
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsMultiImage: true,
        recommended: true,
        experimental: true,
        resolutions: ['Auto'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '3:2', '2:3', '2:1'],
        supportsQuality: true,
        qualities: [...IMAGE_QUALITY_OPTIONS]
    }
];

export const LEGACY_IMAGE_MODEL_UNAVAILABLE_MESSAGE =
    'Selected image model is no longer available. Please choose another model.';

export function createLegacyImageModelOption(modelId: string): ImageModelOption {
    const safeModelId = modelId || 'legacy-image-model';

    return {
        id: safeModelId,
        label: `Legacy: ${safeModelId}`,
        name: `Legacy: ${safeModelId}`,
        description: LEGACY_IMAGE_MODEL_UNAVAILABLE_MESSAGE,
        provider: 'custom',
        providerChain: [],
        capabilities: [],
        experimental: false,
        enabled: false,
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsMultiImage: true,
        disabled: true,
        disabledReason: LEGACY_IMAGE_MODEL_UNAVAILABLE_MESSAGE,
        status: 'disabled',
        resolutions: ['Auto'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16'],
        supportsQuality: false
    };
}

export function withLegacyImageModelOption<T extends ImageModelOption>(
    models: T[],
    selectedModelId?: string | null
): Array<T | ImageModelOption> {
    if (selectedModelId && HIDDEN_IMAGE_MODEL_IDS.has(selectedModelId)) {
        return models;
    }

    if (!selectedModelId || models.some(model => model.id === selectedModelId)) {
        return models;
    }

    return [createLegacyImageModelOption(selectedModelId), ...models];
}

export function isUnavailableLegacyImageModel(
    models: Pick<ImageModelOption, 'id'>[],
    selectedModelId?: string | null
): boolean {
    return Boolean(selectedModelId && !models.some(model => model.id === selectedModelId));
}

export function filterVisibleImageModels<T extends ImageModelOption>(models: T[]): T[] {
    return models.filter(model => VISIBLE_IMAGE_MODEL_IDS.has(model.id));
}

export function getDefaultImageModelId(hasReferenceImages = false): string {
    return hasReferenceImages ? T8_GPT_IMAGE_2_EDIT_MODEL_ID : T8_GPT_IMAGE_2_MODEL_ID;
}

export function normalizeImageQuality(value: unknown): ImageQuality {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return IMAGE_QUALITY_OPTIONS.includes(normalized as ImageQuality)
        ? normalized as ImageQuality
        : 'auto';
}

export function getImageQualityLabel(value: ImageQuality): string {
    if (value === 'auto') return 'Auto';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeQualityOptions(rawQualities: unknown): ImageQuality[] {
    if (!Array.isArray(rawQualities)) return [];

    return Array.from(new Set(
        rawQualities
            .map(normalizeImageQuality)
            .filter((quality): quality is ImageQuality => IMAGE_QUALITY_OPTIONS.includes(quality))
    ));
}

export function imageModelSupportsQuality(
    model: Pick<ImageModelOption, 'id' | 'supportsQuality' | 'qualities'> | string | undefined | null
): boolean {
    if (!model) return false;
    if (typeof model === 'string') return T8_GPT_IMAGE_QUALITY_MODEL_IDS.has(model);
    return Boolean(
        model.supportsQuality ||
        (Array.isArray(model.qualities) && model.qualities.length > 0) ||
        T8_GPT_IMAGE_QUALITY_MODEL_IDS.has(model.id)
    );
}

export function getImageQualityOptions(
    model: Pick<ImageModelOption, 'id' | 'supportsQuality' | 'qualities'> | string | undefined | null
): ImageQuality[] {
    if (!imageModelSupportsQuality(model)) return [];
    if (typeof model !== 'string' && Array.isArray(model.qualities) && model.qualities.length > 0) {
        return model.qualities;
    }

    return [...IMAGE_QUALITY_OPTIONS];
}

export function imageModelSupportsReferenceCount(modelId: string | undefined | null, referenceCount = 0): boolean {
    if (!modelId) return false;
    const capabilities = STATIC_IMAGE_MODEL_CAPABILITIES.get(modelId);
    if (!capabilities) return true;
    if (referenceCount === 0) return capabilities.supportsTextToImage;
    if (referenceCount === 1) return capabilities.supportsImageToImage;
    return capabilities.supportsMultiImage;
}

export function getCompatibleImageModelId(modelId: string | undefined | null, referenceCount = 0): string {
    if (!modelId || HIDDEN_IMAGE_MODEL_IDS.has(modelId)) {
        return getDefaultImageModelId(referenceCount > 0);
    }

    if (imageModelSupportsReferenceCount(modelId, referenceCount)) {
        return modelId;
    }

    const sameFamilyModelId = SAME_FAMILY_IMAGE_MODEL_FALLBACKS.get(modelId);
    if (sameFamilyModelId && imageModelSupportsReferenceCount(sameFamilyModelId, referenceCount)) {
        return sameFamilyModelId;
    }

    return getDefaultImageModelId(referenceCount > 0);
}

export function getDefaultImageModel(
    models: ImageModelOption[],
    hasReferenceImages = false
): ImageModelOption | undefined {
    const preferredId = getDefaultImageModelId(hasReferenceImages);
    return models.find(model => model.id === preferredId && !model.disabled && model.status !== 'disabled')
        || models.find(model => !model.disabled && model.status !== 'disabled')
        || models[0];
}

export function normalizeImageModelOption(raw: any): ImageModelOption {
    const capabilities = Array.isArray(raw?.capabilities) ? raw.capabilities : [];
    const providerChain = Array.isArray(raw?.providerChain) ? raw.providerChain : [];
    const label = String(raw?.label || raw?.name || raw?.id || 'Image model');
    const id = String(raw?.id || '');
    const qualities = normalizeQualityOptions(raw?.qualities);
    const supportsQuality = Boolean(raw?.supportsQuality || qualities.length > 0 || T8_GPT_IMAGE_QUALITY_MODEL_IDS.has(id));

    return {
        id,
        label,
        name: label,
        description: raw?.description,
        provider: raw?.provider || 'custom',
        providerChain,
        capabilities,
        experimental: Boolean(raw?.experimental),
        enabled: raw?.enabled !== false,
        supportsTextToImage: raw?.supportsTextToImage ?? (capabilities.length === 0 || capabilities.includes('text-to-image')),
        supportsImageToImage: raw?.supportsImageToImage ?? (capabilities.length === 0 || capabilities.includes('image-to-image')),
        supportsMultiImage: raw?.supportsMultiImage ?? (capabilities.length === 0 || capabilities.includes('multi-image')),
        recommended: Boolean(raw?.recommended),
        disabled: Boolean(raw?.disabled),
        disabledReason: raw?.disabledReason,
        status: raw?.status || 'available',
        resolutions: Array.isArray(raw?.resolutions) && raw.resolutions.length > 0 ? raw.resolutions : ['Auto'],
        aspectRatios: Array.isArray(raw?.aspectRatios) && raw.aspectRatios.length > 0
            ? raw.aspectRatios
            : ['Auto', '1:1', '16:9', '9:16'],
        supportsQuality,
        qualities: supportsQuality ? (qualities.length > 0 ? qualities : [...IMAGE_QUALITY_OPTIONS]) : undefined
    };
}
