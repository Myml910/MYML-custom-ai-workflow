function isEnabledFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isExperimentalProviderEnabled(provider) {
    if (isEnabledFlag(process.env.ENABLE_EXPERIMENTAL_PROVIDERS)) return true;
    if (provider === 'dataler') return isEnabledFlag(process.env.ENABLE_DATALER_PROVIDER);
    if (provider === 'pikachu') return isEnabledFlag(process.env.ENABLE_PIKACHU_PROVIDER);
    if (provider === 'atlas') return isEnabledFlag(process.env.ENABLE_ATLAS_PROVIDER);
    return true;
}

function isAtlasNanoBanana2Enabled() {
    return isEnabledFlag(process.env.ENABLE_ATLAS_NANO_BANANA_2);
}

function envString(name, fallback) {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export const IMAGE_MODEL_REGISTRY = Object.freeze({
    'custom-image-gpt-image-2': {
        projectModelId: 'custom-image-gpt-image-2',
        displayName: 'T8star GPT Image 2',
        description: 'Stable GPT Image 2 image generation through the default production provider chain.',
        capability: 'image-generation',
        capabilities: ['text-to-image', 'image-to-image', 'multi-image'],
        recommended: true,
        resolutions: ['Auto', '2k', '4k'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
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
        description: 'Nano Banana 3.1 Flash image generation. Experimental providers are hidden unless enabled.',
        capability: 'image-generation',
        capabilities: ['text-to-image', 'image-to-image', 'multi-image'],
        resolutions: ['Auto', '1K', '2K', '4K'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '1:4', '4:1', '8:1', '1:8'],
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
        description: 'Experimental Pikachu GPT-Image-2 endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image', 'image-to-image', 'multi-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: true,
        supportsMultiImage: true,
        enabled: true,
        experimental: true,
        resolutions: ['medium', 'low', 'high'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
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
    },
    'custom-image-newapi-gemini-3-1-flash': {
        projectModelId: 'custom-image-newapi-gemini-3-1-flash',
        displayName: 'NewAPI Gemini 3.1 Flash Image',
        description: 'Company intranet NewAPI / OpenAI-compatible chat completions image endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        enabled: true,
        experimental: true,
        resolutions: ['Auto', '1K', '2K', '4K'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
        providers: [
            {
                provider: 'newapi',
                upstreamModel: 'google/gemini-3.1-flash-image-preview',
                priority: 1,
                isAsync: false,
                experimental: true
            }
        ],
        defaultResolution: '2K'
    },
    'custom-image-newapi-gpt-image-2': {
        projectModelId: 'custom-image-newapi-gpt-image-2',
        displayName: 'NewAPI GPT Image 2',
        description: 'Company intranet NewAPI / OpenAI-compatible chat completions image endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        enabled: true,
        experimental: true,
        resolutions: ['Auto', 'low', 'medium', 'high', '2k', '4k'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        providers: [
            {
                provider: 'newapi',
                upstreamModel: 'gpt-image-2',
                priority: 1,
                isAsync: false,
                experimental: true
            }
        ],
        defaultResolution: 'medium'
    },
    'custom-image-t8-gpt-image-2': {
        projectModelId: 'custom-image-t8-gpt-image-2',
        displayName: 'T8 GPT Image 2',
        description: 'Experimental T8 GPT Image 2 text-to-image generations endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        enabled: true,
        experimental: true,
        recommended: false,
        resolutions: ['Auto'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '3:2', '2:3', '2:1'],
        providers: [
            {
                provider: 't8',
                upstreamModel: envString('T8_GPT_IMAGE_MODEL', 'gpt-image-2'),
                priority: 1,
                isAsync: false,
                experimental: true
            }
        ],
        defaultResolution: 'Auto'
    },
    'custom-image-t8-nano-banana-3-1-flash': {
        projectModelId: 'custom-image-t8-nano-banana-3-1-flash',
        displayName: 'T8 Nano Banana 3.1 Flash',
        description: 'Experimental T8 Nano Banana 3.1 Flash text-to-image generations endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        enabled: true,
        experimental: true,
        recommended: false,
        resolutions: ['1K', '2K', '4K', '512'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '1:4', '4:1', '8:1', '1:8'],
        providers: [
            {
                provider: 't8',
                upstreamModel: envString('T8_NANO_BANANA_MODEL', 'gemini-3.1-flash-image-preview'),
                priority: 1,
                isAsync: false,
                experimental: true
            }
        ],
        defaultResolution: '1K'
    },
    'custom-image-atlas-gpt-image-2-text': {
        projectModelId: 'custom-image-atlas-gpt-image-2-text',
        displayName: 'Atlas GPT Image 2 Text-to-Image',
        description: 'Experimental Atlas Cloud GPT Image 2 text-to-image endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        enabled: true,
        experimental: true,
        resolutions: ['low', 'medium', 'high'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        providers: [
            {
                provider: 'atlas',
                upstreamModel: 'openai/gpt-image-2/text-to-image',
                priority: 1,
                isAsync: true,
                experimental: true,
                enabled: isExperimentalProviderEnabled('atlas')
            }
        ],
        defaultResolution: 'medium'
    },
    'custom-image-atlas-gpt-image-2-edit': {
        projectModelId: 'custom-image-atlas-gpt-image-2-edit',
        displayName: 'Atlas GPT Image 2 Edit',
        description: 'Experimental Atlas Cloud GPT Image 2 image edit endpoint.',
        capability: 'image-generation',
        capabilities: ['image-to-image', 'multi-image'],
        taskType: 'image_generation',
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsMultiImage: true,
        enabled: true,
        experimental: true,
        resolutions: ['low', 'medium', 'high'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        providers: [
            {
                provider: 'atlas',
                upstreamModel: 'openai/gpt-image-2/edit',
                priority: 1,
                isAsync: true,
                experimental: true,
                enabled: isExperimentalProviderEnabled('atlas')
            }
        ],
        defaultResolution: 'medium'
    },
    'custom-image-atlas-nano-banana-2-text': {
        projectModelId: 'custom-image-atlas-nano-banana-2-text',
        displayName: 'Atlas Nano Banana 2 Text-to-Image',
        description: 'Experimental Atlas Cloud Nano Banana 2 text-to-image endpoint.',
        capability: 'image-generation',
        capabilities: ['text-to-image'],
        taskType: 'image_generation',
        supportsTextToImage: true,
        supportsImageToImage: false,
        supportsMultiImage: false,
        enabled: true,
        experimental: true,
        resolutions: ['1k', '2k', '4k'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
        providers: [
            {
                provider: 'atlas',
                upstreamModel: envString('ATLAS_NANO_BANANA_2_TEXT_MODEL', 'google/nano-banana-2/text-to-image'),
                priority: 1,
                isAsync: true,
                experimental: true,
                enabled: isExperimentalProviderEnabled('atlas') && isAtlasNanoBanana2Enabled()
            }
        ],
        defaultResolution: '2k'
    },
    'custom-image-atlas-nano-banana-2-edit': {
        projectModelId: 'custom-image-atlas-nano-banana-2-edit',
        displayName: 'Atlas Nano Banana 2 Edit',
        description: 'Experimental Atlas Cloud Nano Banana 2 image edit endpoint.',
        capability: 'image-generation',
        capabilities: ['image-to-image', 'multi-image'],
        taskType: 'image_generation',
        supportsTextToImage: false,
        supportsImageToImage: true,
        supportsMultiImage: true,
        enabled: true,
        experimental: true,
        resolutions: ['1k', '2k', '4k'],
        aspectRatios: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
        providers: [
            {
                provider: 'atlas',
                upstreamModel: envString('ATLAS_NANO_BANANA_2_EDIT_MODEL', 'google/nano-banana-2/edit'),
                priority: 1,
                isAsync: true,
                experimental: true,
                enabled: isExperimentalProviderEnabled('atlas') && isAtlasNanoBanana2Enabled()
            }
        ],
        defaultResolution: '2k'
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

export function getAvailableImageModels() {
    return Object.values(IMAGE_MODEL_REGISTRY)
        .map(modelConfig => {
            const providers = getImageProviders(modelConfig.projectModelId);
            if (providers.length === 0) return null;

            return {
                id: modelConfig.projectModelId,
                label: modelConfig.displayName,
                description: modelConfig.description || '',
                capabilities: modelConfig.capabilities || [modelConfig.capability],
                providerChain: providers.map(provider => provider.provider),
                enabled: true,
                experimental: Boolean(modelConfig.experimental || providers.some(provider => provider.experimental)),
                supportsTextToImage: modelConfig.supportsTextToImage ?? modelConfig.capabilities?.includes('text-to-image') ?? true,
                supportsImageToImage: modelConfig.supportsImageToImage ?? modelConfig.capabilities?.includes('image-to-image') ?? true,
                supportsMultiImage: modelConfig.supportsMultiImage ?? modelConfig.capabilities?.includes('multi-image') ?? true,
                recommended: Boolean(modelConfig.recommended),
                resolutions: modelConfig.resolutions || ['Auto'],
                aspectRatios: modelConfig.aspectRatios || ['Auto', '1:1', '16:9', '9:16']
            };
        })
        .filter(Boolean);
}
