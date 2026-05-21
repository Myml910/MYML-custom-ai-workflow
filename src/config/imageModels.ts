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
}

export const ATLAS_TEXT_TO_IMAGE_MODEL_ID = 'custom-image-atlas-gpt-image-2-text';
export const ATLAS_IMAGE_EDIT_MODEL_ID = 'custom-image-atlas-gpt-image-2-edit';
export const ATLAS_NANO_BANANA_2_TEXT_MODEL_ID = 'custom-image-atlas-nano-banana-2-text';
export const ATLAS_NANO_BANANA_2_EDIT_MODEL_ID = 'custom-image-atlas-nano-banana-2-edit';
export const NEWAPI_GEMINI_3_1_FLASH_MODEL_ID = 'custom-image-newapi-gemini-3-1-flash';
export const NEWAPI_GPT_IMAGE_2_MODEL_ID = 'custom-image-newapi-gpt-image-2';
export const T8_GPT_IMAGE_2_MODEL_ID = 'custom-image-t8-gpt-image-2';
export const T8_NANO_BANANA_3_1_FLASH_MODEL_ID = 'custom-image-t8-nano-banana-3-1-flash';

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
    T8_NANO_BANANA_3_1_FLASH_MODEL_ID
]);

export const FALLBACK_IMAGE_MODELS: ImageModelOption[] = [
    {
        id: ATLAS_TEXT_TO_IMAGE_MODEL_ID,
        label: 'Atlas GPT Image 2 Text-to-Image',
        name: 'Atlas GPT Image 2 Text-to-Image',
        provider: 'atlas',
        providerChain: ['atlas'],
        capabilities: ['text-to-image'],
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        recommended: true,
        experimental: true,
        resolutions: ['low', 'medium', 'high'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
    },
    {
        id: ATLAS_IMAGE_EDIT_MODEL_ID,
        label: 'Atlas GPT Image 2 Edit',
        name: 'Atlas GPT Image 2 Edit',
        provider: 'atlas',
        providerChain: ['atlas'],
        capabilities: ['image-to-image', 'multi-image'],
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsMultiImage: true,
        experimental: true,
        resolutions: ['low', 'medium', 'high'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
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
        aspectRatios: ['Auto', '1:1', '16:9', '9:16']
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
    return hasReferenceImages ? ATLAS_IMAGE_EDIT_MODEL_ID : ATLAS_TEXT_TO_IMAGE_MODEL_ID;
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

    return {
        id: String(raw?.id || ''),
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
            : ['Auto', '1:1', '16:9', '9:16']
    };
}
