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
    supportsImageToImage: boolean;
    supportsMultiImage: boolean;
    recommended?: boolean;
    disabled?: boolean;
    disabledReason?: 'notConfigured' | 'notConnected' | string;
    status?: 'available' | 'disabled' | 'comingSoon';
    resolutions: string[];
    aspectRatios: string[];
}

export const FALLBACK_IMAGE_MODELS: ImageModelOption[] = [
    {
        id: 'custom-image-gpt-image-2',
        label: 'T8star GPT Image 2',
        name: 'T8star GPT Image 2',
        provider: 'custom',
        providerChain: ['apimart'],
        capabilities: ['text-to-image', 'image-to-image', 'multi-image'],
        supportsImageToImage: true,
        supportsMultiImage: true,
        recommended: true,
        resolutions: ['Auto', '2k', '4k'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']
    },
    {
        id: 'custom-image-nano-banana-3-1-flash',
        label: 'Nano Banana 3.1 Flash',
        name: 'Nano Banana 3.1 Flash',
        provider: 'custom',
        providerChain: ['apimart'],
        capabilities: ['text-to-image', 'image-to-image', 'multi-image'],
        supportsImageToImage: true,
        supportsMultiImage: true,
        resolutions: ['Auto', '1K', '2K', '4K'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '1:4', '4:1', '8:1', '1:8']
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
