export const AI_PROVIDER_CAPABILITIES = Object.freeze({
    IMAGE_GENERATION: 'image-generation',
    TEXT_RESPONSE: 'text-response'
});

export function createProviderImageResult({
    provider,
    model,
    taskId,
    status,
    images = [],
    raw,
    error
}) {
    return {
        provider,
        model,
        taskId,
        status,
        images,
        raw,
        error
    };
}
