import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';

const T8_PROVIDER = 't8';
const GPT_IMAGE_2_MODEL = 'gpt-image-2';
const NANO_BANANA_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_GPT_IMAGE_SIZE = 'auto';
const DEFAULT_GPT_IMAGE_QUALITY = 'medium';
const DEFAULT_NANO_IMAGE_SIZE = '1K';
const DEFAULT_RESPONSE_FORMAT = 'url';

const GPT_IMAGE_SIZE_ALLOWLIST = new Set([
    '1024x1024',
    '1536x1024',
    '1024x1536',
    '2048x2048',
    '2048x1152',
    '3840x2160',
    '2160x3840',
    'auto'
]);

const NANO_ASPECT_RATIO_ALLOWLIST = new Set([
    '4:3',
    '3:4',
    '16:9',
    '9:16',
    '2:3',
    '3:2',
    '1:1',
    '4:5',
    '5:4',
    '21:9',
    '1:4',
    '4:1',
    '8:1',
    '1:8'
]);

const NANO_IMAGE_SIZE_ALLOWLIST = new Set(['1K', '2K', '4K', '512']);

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getT8RuntimeConfig(config = {}) {
    return config.t8 || config || {};
}

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

export function buildT8ImageGenerationsUrl(baseUrl) {
    const cleanBaseUrl = cleanString(baseUrl).replace(/\/+$/, '');
    if (!cleanBaseUrl) return '';
    if (/\/images\/generations$/i.test(cleanBaseUrl)) return cleanBaseUrl;
    if (/\/v1$/i.test(cleanBaseUrl)) return `${cleanBaseUrl}/images/generations`;
    return `${cleanBaseUrl}/v1/images/generations`;
}

function createTimeoutError(context, timeoutMs, cause) {
    return new AiProviderError({
        type: AI_ERROR_TYPES.TIMEOUT,
        provider: T8_PROVIDER,
        model: context.model,
        message: `T8 ${context.action} timed out after ${timeoutMs}ms.`,
        cause
    });
}

async function fetchWithTimeout(url, fetchOptions, context = {}) {
    const timeoutMs = parsePositiveInteger(context.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    try {
        return await fetch(url, {
            ...fetchOptions,
            signal: controller.signal
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw createTimeoutError(context, timeoutMs, error);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function safeJsonPreview(value, limit = 500) {
    try {
        return JSON.stringify(value).slice(0, limit);
    } catch {
        return String(value || '').slice(0, limit);
    }
}

function getPromptLength(prompt) {
    return String(prompt || '').length;
}

function isAutoValue(value) {
    const normalized = cleanString(value).toLowerCase();
    return !normalized || normalized === 'auto' || normalized === '自动';
}

function normalizeGptImageSize({ requestedSize, model }) {
    const cleanRequestedSize = cleanString(requestedSize);
    const lowerRequestedSize = cleanRequestedSize.toLowerCase();

    if (isAutoValue(cleanRequestedSize)) {
        return DEFAULT_GPT_IMAGE_SIZE;
    }

    if (cleanRequestedSize && GPT_IMAGE_SIZE_ALLOWLIST.has(lowerRequestedSize)) {
        return lowerRequestedSize;
    }

    if (cleanRequestedSize) {
        console.warn('[T8][size normalized]', {
            model,
            requestedSize: cleanRequestedSize,
            normalizedSize: DEFAULT_GPT_IMAGE_SIZE
        });
    }

    return DEFAULT_GPT_IMAGE_SIZE;
}

export function normalizeGptImage2Quality(requestedQuality, model = GPT_IMAGE_2_MODEL) {
    const cleanRequestedQuality = cleanString(requestedQuality);
    if (cleanRequestedQuality) {
        console.log('[T8][quality normalized]', {
            model,
            requestedQuality: cleanRequestedQuality,
            normalizedQuality: DEFAULT_GPT_IMAGE_QUALITY
        });
    }
    return DEFAULT_GPT_IMAGE_QUALITY;
}

function normalizeNanoAspectRatio(aspectRatio, model) {
    const cleanAspectRatio = cleanString(aspectRatio);

    if (isAutoValue(cleanAspectRatio)) {
        return {
            value: undefined,
            summary: {
                aspect_ratioMode: 'auto_omitted'
            }
        };
    }

    if (NANO_ASPECT_RATIO_ALLOWLIST.has(cleanAspectRatio)) {
        return {
            value: cleanAspectRatio,
            summary: {
                aspect_ratio: cleanAspectRatio
            }
        };
    }

    console.warn('[T8][aspect_ratio omitted]', {
        model,
        requestedAspectRatio: cleanAspectRatio,
        aspect_ratioMode: 'invalid_omitted'
    });

    return {
        value: undefined,
        summary: {
            aspect_ratioMode: 'invalid_omitted'
        }
    };
}

function normalizeNanoImageSize(imageSize, model) {
    const cleanImageSize = cleanString(imageSize).toUpperCase();
    const normalizedImageSize = cleanImageSize === '512' ? '512' : cleanImageSize;
    if (NANO_IMAGE_SIZE_ALLOWLIST.has(normalizedImageSize)) {
        return normalizedImageSize;
    }

    if (cleanImageSize && cleanImageSize !== 'AUTO') {
        console.warn('[T8][image_size normalized]', {
            model,
            requestedImageSize: cleanImageSize,
            normalizedImageSize: DEFAULT_NANO_IMAGE_SIZE
        });
    }

    return DEFAULT_NANO_IMAGE_SIZE;
}

function hasReferenceImages(input = {}) {
    return [
        ...normalizeInputArray(input.imageUrls),
        ...normalizeInputArray(input.image_urls),
        ...normalizeInputArray(input.referenceImages),
        ...normalizeInputArray(input.images)
    ]
        .filter(Boolean)
        .length > 0;
}

function buildRequestBody(input = {}, model) {
    const prompt = input.prompt || '';

    if (model === GPT_IMAGE_2_MODEL) {
        const size = normalizeGptImageSize({
            requestedSize: input.size,
            model
        });
        const quality = normalizeGptImage2Quality(input.quality || input.requestedQuality, model);
        return {
            body: {
                model,
                prompt,
                size,
                quality,
                response_format: DEFAULT_RESPONSE_FORMAT
            },
            summary: {
                size,
                quality,
                response_format: DEFAULT_RESPONSE_FORMAT
            }
        };
    }

    if (model === NANO_BANANA_MODEL) {
        const aspectRatio = normalizeNanoAspectRatio(input.aspectRatio || input.aspect_ratio || input.size, model);
        const imageSize = normalizeNanoImageSize(input.imageSize || input.image_size || input.resolution, model);
        const body = {
            model,
            prompt,
            response_format: DEFAULT_RESPONSE_FORMAT,
            image_size: imageSize
        };
        if (aspectRatio.value) {
            body.aspect_ratio = aspectRatio.value;
        }
        return {
            body,
            summary: {
                ...aspectRatio.summary,
                image_size: imageSize,
                response_format: DEFAULT_RESPONSE_FORMAT
            }
        };
    }

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: T8_PROVIDER,
        model,
        message: `T8 image model is not supported: ${model}`
    });
}

function classifyT8ErrorType(status, message) {
    const text = String(message || '').toLowerCase();

    if (status === 401 || status === 403 || text.includes('unauthorized') || text.includes('forbidden') || text.includes('invalid api key')) {
        return AI_ERROR_TYPES.AUTH_ERROR;
    }
    if (status === 429 || text.includes('rate limit') || text.includes('too many requests')) {
        return AI_ERROR_TYPES.RATE_LIMIT;
    }
    if (status === 402 || text.includes('quota') || text.includes('balance') || text.includes('insufficient')) {
        return AI_ERROR_TYPES.QUOTA_ERROR;
    }
    if (status === 503 && (text.includes('no available channel') || text.includes('no channel'))) {
        return AI_ERROR_TYPES.NO_CHANNEL;
    }
    if (text.includes('timeout') || text.includes('timed out')) {
        return AI_ERROR_TYPES.TIMEOUT;
    }
    if (text.includes('empty') || text.includes('no image')) {
        return AI_ERROR_TYPES.EMPTY_RESULT;
    }
    if (status === 400 || text.includes('param') || text.includes('invalid request')) {
        return AI_ERROR_TYPES.PARAM_ERROR;
    }
    if (status === 503 || text.includes('service unavailable')) {
        return AI_ERROR_TYPES.PROVIDER_UNAVAILABLE;
    }
    if (text.includes('fetch failed') || text.includes('network')) {
        return AI_ERROR_TYPES.NETWORK_ERROR;
    }

    return AI_ERROR_TYPES.PROVIDER_ERROR;
}

async function parseJsonResponse(response, context) {
    const rawText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let data = null;

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        if (response.ok) {
            return rawText;
        }
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.error ||
            data?.message ||
            rawText ||
            response.statusText ||
            `HTTP ${response.status}`;

        console.warn('[T8][image error response]', {
            status: response.status,
            statusText: response.statusText,
            url: context.requestUrl,
            model: context.model,
            body: rawText.slice(0, 1000)
        });

        throw new AiProviderError({
            type: classifyT8ErrorType(response.status, `${response.status} ${response.statusText} ${message}`),
            provider: T8_PROVIDER,
            model: context.model,
            message: `T8 ${context.action} failed: ${response.status} ${response.statusText} - ${message}`,
            raw: {
                requestUrl: context.requestUrl,
                status: response.status,
                statusText: response.statusText,
                contentType,
                data: data || rawText.slice(0, 1000)
            }
        });
    }

    return data || {};
}

function parseDataUri(input) {
    const match = String(input || '').match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) return null;
    return {
        base64: match[2].replace(/\s+/g, ''),
        mimeType: match[1]
    };
}

function extractImageRefsFromText(text) {
    const source = String(text || '');
    const refs = [];
    const addRef = value => {
        const ref = String(value || '').trim();
        if (ref && !refs.includes(ref)) refs.push(ref);
    };

    const markdownPattern = /!\[[^\]]*]\(\s*([^)]+?)\s*\)/g;
    for (const match of source.matchAll(markdownPattern)) {
        addRef(match[1].replace(/^["']|["']$/g, ''));
    }

    const dataUriPattern = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/gi;
    for (const match of source.matchAll(dataUriPattern)) {
        addRef(match[0]);
    }

    const bareUrlPattern = /https?:\/\/[^\s"'<>)]*/gi;
    for (const match of source.matchAll(bareUrlPattern)) {
        addRef(match[0].replace(/[.,;:]+$/g, ''));
    }

    return refs;
}

function normalizeImageItem(item) {
    if (!item) return null;

    if (Array.isArray(item)) {
        for (const value of item) {
            const normalized = normalizeImageItem(value);
            if (normalized) return normalized;
        }
        return null;
    }

    if (typeof item === 'string') {
        const parsedDataUri = parseDataUri(item);
        if (parsedDataUri) return parsedDataUri;
        if (/^https?:\/\//i.test(item)) return { url: item };

        const extractedRefs = extractImageRefsFromText(item);
        if (extractedRefs.length > 0) return normalizeImageItem(extractedRefs[0]);

        return /^[A-Za-z0-9+/=\r\n]+$/.test(item) && item.length > 80
            ? { base64: item.replace(/\s+/g, ''), mimeType: 'image/png' }
            : null;
    }

    if (typeof item !== 'object') return null;

    const imageUrl = item.image_url || item.imageUrl;
    const url = item.url || item.uri || item.result_url || item.resultUrl;
    const base64 = item.b64_json || item.base64 || item.image_base64 || item.imageBase64;

    if (imageUrl) {
        return normalizeImageItem(typeof imageUrl === 'object' ? imageUrl.url || imageUrl.uri || imageUrl : imageUrl);
    }
    if (url) return normalizeImageItem(url);
    if (base64) {
        const parsed = typeof base64 === 'string' && base64.startsWith('data:') ? parseDataUri(base64) : null;
        return {
            base64: parsed ? parsed.base64 : String(base64).split(',').pop().replace(/\s+/g, ''),
            mimeType: parsed?.mimeType || item.mime_type || item.mimeType || 'image/png'
        };
    }

    for (const key of ['data', 'images', 'image', 'output', 'result', 'content']) {
        if (item[key] && item[key] !== item) {
            const normalized = normalizeImageItem(item[key]);
            if (normalized) return normalized;
        }
    }

    return null;
}

function collectImages(raw) {
    const candidates = [
        raw?.data,
        raw?.data?.[0],
        raw?.images,
        raw?.image,
        raw?.url,
        raw?.image_url,
        raw?.b64_json,
        raw?.base64,
        raw?.output,
        raw?.result,
        raw
    ];

    const images = [];
    for (const candidate of candidates) {
        const items = Array.isArray(candidate) ? candidate : [candidate];
        for (const item of items) {
            if (!item) continue;
            if (typeof item === 'string') {
                for (const ref of extractImageRefsFromText(item)) {
                    const extracted = normalizeImageItem(ref);
                    if (extracted) images.push(extracted);
                }
            }

            const normalized = normalizeImageItem(item);
            if (normalized) images.push(normalized);
        }
    }

    const seen = new Set();
    return images.filter(image => {
        const key = image.url || image.base64;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function normalizeT8ImageResponse(raw, context = {}) {
    const images = collectImages(raw);
    if (images.length === 0) {
        console.error('[T8][empty image result]', {
            model: context.model || raw?.model || GPT_IMAGE_2_MODEL,
            preview: safeJsonPreview(raw)
        });
        throw new AiProviderError({
            type: AI_ERROR_TYPES.EMPTY_RESULT,
            provider: T8_PROVIDER,
            model: context.model || raw?.model || GPT_IMAGE_2_MODEL,
            message: 'T8_EMPTY_RESULT: T8 image response did not include a usable image URL or base64 image.',
            raw: {
                preview: safeJsonPreview(raw)
            }
        });
    }

    return { images };
}

export function normalizeProviderError(error, context = {}) {
    if (error instanceof AiProviderError) return error;

    const classified = classifyProviderError(error, {
        provider: T8_PROVIDER,
        model: context.model,
        raw: error?.raw || context.raw
    });

    return new AiProviderError({
        type: classifyT8ErrorType(null, classified.message || error?.message) || classified.type,
        provider: T8_PROVIDER,
        model: context.model || classified.model,
        message: classified.message,
        cause: error,
        raw: classified.raw
    });
}

export async function submitImageTask(input = {}, options = {}) {
    const config = options.config || getAiProviderConfig();
    const t8Config = getT8RuntimeConfig(config);
    const baseUrl = t8Config.baseUrl;
    const apiKey = t8Config.apiKey;
    const model = input.model || t8Config.imageModel || t8Config.gptImageModel || GPT_IMAGE_2_MODEL;

    if (!baseUrl) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 image provider is not configured. Add T8_BASE_URL to .env.'
        });
    }
    if (!apiKey) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 image provider is not configured. Add T8_API_KEY to .env.'
        });
    }
    if (hasReferenceImages(input)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 provider currently supports text-to-image only. Image edits and reference images are not enabled in this integration.'
        });
    }

    const { body: requestBody, summary } = buildRequestBody(input, model);
    const requestUrl = buildT8ImageGenerationsUrl(baseUrl);
    const timeoutMs = parsePositiveInteger(t8Config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);

    console.log('[T8][image submit]', {
        url: requestUrl,
        model,
        promptLength: getPromptLength(input.prompt),
        ...summary
    });

    const response = await fetchWithTimeout(requestUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    }, {
        action: 'image generation',
        model,
        timeoutMs
    });

    const raw = await parseJsonResponse(response, {
        action: 'image generation',
        model,
        requestUrl
    });
    const normalized = normalizeT8ImageResponse(raw, { model });

    console.log('[T8][image response]', {
        url: requestUrl,
        model,
        imageCount: normalized.images.length,
        hasUsage: Boolean(raw?.usage)
    });

    return {
        provider: T8_PROVIDER,
        model,
        taskId: raw?.id || raw?.created ? `t8:${raw.id || raw.created}` : null,
        status: 'completed',
        rawStatus: 'completed',
        progress: 100,
        images: normalized.images,
        raw,
        usage: raw?.usage,
        request: {
            endpoint: '/images/generations',
            requestUrl,
            ...summary
        }
    };
}

export async function pollImageTask(providerTaskId, options = {}) {
    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: T8_PROVIDER,
        model: options.model || GPT_IMAGE_2_MODEL,
        message: `T8 provider does not support polling provider task ${providerTaskId || ''}.`
    });
}

export async function generateImage(input = {}, options = {}) {
    return await submitImageTask(input, options);
}
