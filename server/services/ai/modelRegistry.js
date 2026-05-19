function isEnabledFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isExperimentalProviderEnabled(provider) {
    if (isEnabledFlag(process.env.ENABLE_EXPERIMENTAL_PROVIDERS)) return true;
    if (provider === 'dataler') return isEnabledFlag(process.env.ENABLE_DATALER_PROVIDER);
    if (provider === 'pikachu') return isEnabledFlag(process.env.ENABLE_PIKACHU_PROVIDER);
    return true;
}

export const IMAGE_MODEL_REGISTRY = Object.freeze({
    'custom-image-gpt-image-2': {
        projectModelId: 'custom-image-gpt-image-2',
        displayName: 'T8star GPT Image 2',
        capability: 'image-generation',
        providers: [
            {
                provider: 'apimart',
                upstreamModel: 'gpt-image-2',
                priority: 1,
                isAsync: true
            }
        ],
        defaultResolution: '2k'
    },
    'custom-image-nano-banana-3-1-flash': {
        projectModelId: 'custom-image-nano-banana-3-1-flash',
        displayName: 'Nano Banana 3.1 Flash',
        capability: 'image-generation',
        providers: [
            {
                provider: 'dataler',
                upstreamModel: 'gemini-3.1-flash-image-preview',
                priority: 1,
                isAsync: false,
                experimental: true,
                enabled: isExperimentalProviderEnabled('dataler')
            },
            {
                provider: 'apimart',
                upstreamModel: 'gemini-3.1-flash-image-preview',
                priority: 2,
                isAsync: true
            }
        ],
        defaultResolution: '2K'
    },
    'custom-image-pikachu-gpt-image-2': {
        projectModelId: 'custom-image-pikachu-gpt-image-2',
        displayName: 'Pikachu GPT-Image-2',
        capability: 'image-generation',
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsMultiImage: true,
        enabled: true,
        providers: [
            {
                provider: 'pikachu',
                upstreamModel: 'gpt-image-2',
                priority: 1,
                isAsync: false,
                experimental: true,
                enabled: isExperimentalProviderEnabled('pikachu')
            }
        ],
        defaultResolution: 'medium'
    }
});

export function getSupportedImageModelIds() {
    return Object.keys(IMAGE_MODEL_REGISTRY);
}

export function getImageModelConfig(projectModelId) {
    return IMAGE_MODEL_REGISTRY[projectModelId] || null;
}

export function getImageProviders(projectModelId) {
    const modelConfig = getImageModelConfig(projectModelId);
    if (!modelConfig) return [];
    return [...modelConfig.providers]
        .filter(provider => provider.enabled !== false)
        .sort((a, b) => a.priority - b.priority);
}
