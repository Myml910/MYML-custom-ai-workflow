const DEFAULT_TEXT_MODEL = 'gpt-5.4';
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_IMAGE_FALLBACK_MODEL = 'gpt-image-2';
const DEFAULT_IMAGE_RESOLUTION = '2K';
const DEFAULT_IMAGE_SIZE = 'auto';
const DEFAULT_POLL_INTERVAL_MS = 2500;
const DEFAULT_POLL_TIMEOUT_MS = 180000;
const DEFAULT_PIKACHU_BASE_URL = 'https://pikachu.claudecode.love/v1';
const DEFAULT_PIKACHU_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_PIKACHU_IMAGE_QUALITY = 'medium';
const DEFAULT_PIKACHU_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_DATALER_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_DATALER_IMAGE_SIZE = 'auto';
const DEFAULT_DATALER_IMAGE_RESOLUTION = '2K';
const DEFAULT_DATALER_REQUEST_TIMEOUT_MS = 300000;

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanBaseUrl(value) {
    const baseUrl = cleanString(value);
    return baseUrl ? baseUrl.replace(/\/+$/, '') : undefined;
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiProviderConfig(env = process.env, locals = {}) {
    return {
        apimart: {
            baseUrl: cleanBaseUrl(env.APIMART_BASE_URL),
            apiKey: cleanString(env.APIMART_API_KEY),
            textModel: cleanString(env.APIMART_TEXT_MODEL) || DEFAULT_TEXT_MODEL,
            imageModel: cleanString(env.APIMART_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL,
            imageFallbackModel: cleanString(env.APIMART_IMAGE_FALLBACK_MODEL) || DEFAULT_IMAGE_FALLBACK_MODEL,
            imageResolution: cleanString(env.APIMART_IMAGE_RESOLUTION) || DEFAULT_IMAGE_RESOLUTION,
            imageSize: cleanString(env.APIMART_IMAGE_SIZE) || DEFAULT_IMAGE_SIZE,
            imagePollIntervalMs: parsePositiveInteger(env.APIMART_IMAGE_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
            imagePollTimeoutMs: parsePositiveInteger(env.APIMART_IMAGE_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS)
        },
        pikachu: {
            baseUrl: cleanBaseUrl(env.PIKACHU_BASE_URL) || DEFAULT_PIKACHU_BASE_URL,
            apiKey: cleanString(env.PIKACHU_API_KEY),
            requestTimeoutMs: parsePositiveInteger(env.PIKACHU_REQUEST_TIMEOUT_MS, DEFAULT_PIKACHU_REQUEST_TIMEOUT_MS),
            imageModel: cleanString(env.PIKACHU_IMAGE_MODEL) || DEFAULT_PIKACHU_IMAGE_MODEL,
            imageQuality: cleanString(env.PIKACHU_IMAGE_QUALITY) || DEFAULT_PIKACHU_IMAGE_QUALITY
        },
        dataler: {
            baseUrl: cleanBaseUrl(env.DATALER_API_BASE_URL),
            apiKey: cleanString(env.DATALER_API_KEY),
            requestTimeoutMs: parsePositiveInteger(env.DATALER_REQUEST_TIMEOUT_MS, DEFAULT_DATALER_REQUEST_TIMEOUT_MS),
            imageModel: cleanString(env.DATALER_IMAGE_MODEL) || DEFAULT_DATALER_IMAGE_MODEL,
            imageSize: cleanString(env.DATALER_IMAGE_SIZE) || DEFAULT_DATALER_IMAGE_SIZE,
            imageResolution: cleanString(env.DATALER_IMAGE_RESOLUTION) || DEFAULT_DATALER_IMAGE_RESOLUTION
        },
        legacy: {
            chatBaseUrl: cleanBaseUrl(env.CHAT_API_BASE_URL) || 'https://api.openai.com/v1',
            chatApiKey: cleanString(env.CHAT_API_KEY) || cleanString(locals.OPENAI_API_KEY) || cleanString(env.OPENAI_API_KEY),
            chatModel: cleanString(env.CHAT_MODEL) || DEFAULT_TEXT_MODEL,
            chatReasoningEffort: cleanString(env.CHAT_REASONING_EFFORT) || 'none',
            customApiBaseUrl: cleanBaseUrl(locals.CUSTOM_API_BASE_URL) || cleanBaseUrl(env.CUSTOM_API_BASE_URL),
            customApiKey: cleanString(locals.CUSTOM_API_KEY) || cleanString(env.CUSTOM_API_KEY),
            customNanoBananaBaseUrl: cleanBaseUrl(env.CUSTOM_NANO_BANANA_BASE_URL),
            customNanoBananaApiKey: cleanString(env.CUSTOM_NANO_BANANA_API_KEY),
            customNanoBananaModel: cleanString(env.CUSTOM_NANO_BANANA_MODEL),
            customSeedanceBaseUrl: cleanBaseUrl(env.CUSTOM_SEEDANCE_BASE_URL),
            customSeedanceApiKey: cleanString(env.CUSTOM_SEEDANCE_API_KEY),
            customSeedanceModel: cleanString(env.CUSTOM_SEEDANCE_MODEL)
        }
    };
}

export function isApimartTextConfigured(config = getAiProviderConfig()) {
    return Boolean(config.apimart.baseUrl && config.apimart.apiKey && config.apimart.textModel);
}

export function isApimartImageConfigured(config = getAiProviderConfig()) {
    return Boolean(config.apimart.baseUrl && config.apimart.apiKey && config.apimart.imageModel);
}

export function isPikachuImageConfigured(config = getAiProviderConfig()) {
    return Boolean(config.pikachu.baseUrl && config.pikachu.apiKey && config.pikachu.imageModel);
}

export function isDatalerImageConfigured(config = getAiProviderConfig()) {
    return Boolean(config.dataler.baseUrl && config.dataler.apiKey && config.dataler.imageModel);
}

export function getLegacyChatConfig(runtimeApiKey, config = getAiProviderConfig()) {
    return {
        baseUrl: config.legacy.chatBaseUrl,
        apiKey: runtimeApiKey || config.legacy.chatApiKey || '',
        model: config.legacy.chatModel,
        reasoningEffort: config.legacy.chatReasoningEffort
    };
}
