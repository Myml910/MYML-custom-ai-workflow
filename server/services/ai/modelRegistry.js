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
                provider: 'apimart',
                upstreamModel: 'gemini-3.1-flash-image-preview',
                priority: 1,
                isAsync: true
            }
        ],
        defaultResolution: '2K'
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
    return [...modelConfig.providers].sort((a, b) => a.priority - b.priority);
}
