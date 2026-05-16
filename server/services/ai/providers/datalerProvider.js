import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';
import { resolveImageToBase64 } from '../../../utils/imageHelpers.js';

const DATALER_PROVIDER = 'dataler';
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const NON_JSON_MESSAGE = 'Dataler returned non-JSON response. Please check DATALER_API_BASE_URL and endpoint path.';

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasNonAscii(value) {
    return /[^\x00-\x7F]/.test(String(value || ''));
}

function assertAsciiSecret(name, value, model) {
    if (!value) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: DATALER_PROVIDER,
            model,
            message: `Dataler image provider is not configured. Add ${name} to .env.`
        });
    }

    if (hasNonAscii(value)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: DATALER_PROVIDER,
            model,
            message: `${name} must be an ASCII API key. Replace any placeholder or Chinese text with the real Dataler API key.`
        });
    }
}

function buildDatalerEndpoint(baseUrl) {
    const cleanBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBaseUrl) return '';
    if (/\/chat\/completions$/i.test(cleanBaseUrl)) return cleanBaseUrl;
    if (/\/v1$/i.test(cleanBaseUrl)) return `${cleanBaseUrl}/chat/completions`;
    return `${cleanBaseUrl}/v1/chat/completions`;
}

function createTimeoutError(context, timeoutMs, cause) {
    return new AiProviderError({
        type: AI_ERROR_TYPES.TIMEOUT,
        provider: DATALER_PROVIDER,
        model: context.model,
        message: `Dataler ${context.action} timed out after ${timeoutMs}ms.`,
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

function classifyDatalerErrorType(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('401') || text.includes('403') || text.includes('unauthorized') || text.includes('forbidden') || text.includes('invalid api key')) {
        return AI_ERROR_TYPES.AUTH_ERROR;
    }
    if (text.includes('429') || text.includes('rate limit')) {
        return AI_ERROR_TYPES.RATE_LIMIT;
    }
    if (text.includes('quota') || text.includes('insufficient balance')) {
        return AI_ERROR_TYPES.QUOTA_ERROR;
    }
    if (text.includes('no channel') || text.includes('no available channel') || text.includes('无可用渠道')) {
        return AI_ERROR_TYPES.NO_CHANNEL;
    }
    if (text.includes('400') || text.includes('param') || text.includes('invalid request')) {
        return AI_ERROR_TYPES.PARAM_ERROR;
    }
    if (text.includes('timeout') || text.includes('timed out')) {
        return AI_ERROR_TYPES.TIMEOUT;
    }
    if (text.includes('empty') || text.includes('no image')) {
        return AI_ERROR_TYPES.EMPTY_RESULT;
    }
    if (text.includes('fetch failed') || text.includes('network')) {
        return AI_ERROR_TYPES.NETWORK_ERROR;
    }
    return AI_ERROR_TYPES.PROVIDER_ERROR;
}

async function parseJsonResponse(response, context) {
    const rawText = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const preview = rawText.slice(0, 300);
    const responseMeta = {
        requestUrl: context.requestUrl,
        status: response.status,
        contentType,
        model: context.model,
        preview
    };

    if (contentType && !contentType.toLowerCase().includes('json')) {
        console.error('[Dataler][non-json response]', responseMeta);
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PROVIDER_ERROR,
            provider: DATALER_PROVIDER,
            model: context.model,
            message: NON_JSON_MESSAGE,
            raw: responseMeta
        });
    }

    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        console.error('[Dataler][non-json response]', responseMeta);
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PROVIDER_ERROR,
            provider: DATALER_PROVIDER,
            model: context.model,
            message: NON_JSON_MESSAGE,
            raw: responseMeta
        });
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.error ||
            data?.message ||
            response.statusText ||
            `HTTP ${response.status}`;

        throw new AiProviderError({
            type: classifyDatalerErrorType(`${response.status} ${response.statusText} ${message}`),
            provider: DATALER_PROVIDER,
            model: context.model,
            message: `Dataler ${context.action} failed: ${response.status} ${response.statusText} - ${message}`,
            raw: {
                requestUrl: context.requestUrl,
                status: response.status,
                contentType,
                data
            }
        });
    }

    return data;
}

function parseDataUri(input) {
    const match = String(input || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
        base64: match[2],
        mimeType: match[1]
    };
}

function safeJsonPreview(value) {
    try {
        return JSON.stringify(value).slice(0, 300);
    } catch {
        return String(value || '').slice(0, 300);
    }
}

function extractImageUrlFromText(text) {
    const match = String(text || '').match(/https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?/i);
    return match?.[0] || null;
}

function guessMimeTypeFromUrl(url, contentType) {
    const cleanContentType = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (cleanContentType.startsWith('image/')) return cleanContentType;

    const pathname = (() => {
        try {
            return new URL(url).pathname.toLowerCase();
        } catch {
            return String(url || '').toLowerCase();
        }
    })();

    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.gif')) return 'image/gif';
    return 'image/png';
}

function dataUriFromBuffer(buffer, mimeType = 'image/png') {
    return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function buildPromptWithOutputHints(prompt, { size, resolution } = {}) {
    const basePrompt = String(prompt || '').trim();
    const hints = [];
    if (resolution && String(resolution).toLowerCase() !== 'auto') {
        hints.push(`target resolution: ${resolution}`);
    }
    if (size && String(size).toLowerCase() !== 'auto') {
        hints.push(`target aspect ratio or size: ${size}`);
    }
    if (hints.length === 0) return basePrompt;
    return `${basePrompt}\n\nOutput requirements: ${hints.join(', ')}.`;
}

async function fetchReferenceImageAsDataUri(reference, context = {}) {
    const response = await fetchWithTimeout(reference, {
        method: 'GET',
        headers: {
            Accept: 'image/*'
        }
    }, {
        action: 'reference image fetch',
        model: context.model,
        timeoutMs: context.timeoutMs
    });

    if (!response.ok) {
        throw new AiProviderError({
            type: classifyDatalerErrorType(`${response.status} ${response.statusText}`),
            provider: DATALER_PROVIDER,
            model: context.model,
            message: `Dataler reference image fetch failed: ${response.status} ${response.statusText}`,
            raw: {
                referenceUrl: reference,
                status: response.status,
                contentType: response.headers.get('content-type') || ''
            }
        });
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = guessMimeTypeFromUrl(reference, response.headers.get('content-type'));
    return dataUriFromBuffer(Buffer.from(arrayBuffer), mimeType);
}

async function resolveReferenceImageToDataUri(reference, user, context = {}) {
    if (typeof reference !== 'string' || !reference) return null;
    if (reference.startsWith('data:image/')) return reference;

    const isLibraryReference = reference.startsWith('/library/') || /^https?:\/\/[^/]+\/library\//i.test(reference);
    if (isLibraryReference) {
        const dataUri = resolveImageToBase64(reference, user);
        if (!dataUri) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PARAM_ERROR,
                provider: DATALER_PROVIDER,
                model: context.model,
                message: 'Dataler reference image could not be resolved from the local library URL.',
                raw: {
                    referencePreview: reference.slice(0, 160)
                }
            });
        }
        return dataUri;
    }

    if (/^https?:\/\//i.test(reference)) {
        return await fetchReferenceImageAsDataUri(reference, context);
    }

    return null;
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
        if (item.startsWith('data:')) {
            const parsed = parseDataUri(item);
            return parsed ? { base64: parsed.base64, mimeType: parsed.mimeType } : { url: item };
        }
        if (item.startsWith('http')) return { url: item };

        const extractedUrl = extractImageUrlFromText(item);
        if (extractedUrl) return { url: extractedUrl };

        return /^[A-Za-z0-9+/=]+$/.test(item) && item.length > 80
            ? { base64: item, mimeType: 'image/png' }
            : null;
    }

    if (typeof item !== 'object') return null;

    const inlineData = item.inlineData || item.inline_data;
    const fileData = item.fileData || item.file_data;
    const outputImage = item.output_image || item.outputImage;
    const imageUrl = item.image_url || item.imageUrl;
    const url = item.url || item.uri || item.file_uri || item.fileUri;
    const base64 = item.b64_json || item.base64 || item.image_base64 || item.imageBase64 || inlineData?.data;

    if (outputImage) return normalizeImageItem(outputImage);
    if (imageUrl) return normalizeImageItem(typeof imageUrl === 'object' ? imageUrl.url || imageUrl.uri || imageUrl : imageUrl);
    if (fileData) return normalizeImageItem(fileData.fileUri || fileData.file_uri || fileData.url || fileData.uri);
    if (item.text) return normalizeImageItem(item.text);
    if (url) return normalizeImageItem(url);
    if (base64) {
        const parsed = typeof base64 === 'string' && base64.startsWith('data:') ? parseDataUri(base64) : null;
        return {
            base64: parsed ? parsed.base64 : String(base64).split(',').pop(),
            mimeType: parsed?.mimeType || inlineData?.mimeType || inlineData?.mime_type || item.mime_type || item.mimeType || 'image/png'
        };
    }

    for (const key of ['content', 'parts']) {
        if (item[key]) {
            const nested = normalizeImageItem(item[key]);
            if (nested) return nested;
        }
    }

    return null;
}

function collectImages(raw) {
    const choiceContent = normalizeInputArray(raw?.choices)
        .map(choice => choice?.message?.content || choice?.delta?.content)
        .filter(Boolean);
    const geminiParts = normalizeInputArray(raw?.candidates)
        .flatMap(candidate => [
            candidate?.content?.parts,
            candidate?.parts
        ])
        .filter(Boolean);
    const candidates = [
        choiceContent,
        geminiParts,
        raw?.data,
        raw?.images,
        raw?.image,
        raw?.url,
        raw?.image_url,
        raw?.output,
        raw
    ];

    const images = [];
    for (const candidate of candidates) {
        const items = Array.isArray(candidate) ? candidate : [candidate];
        for (const item of items) {
            const normalized = normalizeImageItem(item);
            if (normalized) images.push(normalized);

            if (item && typeof item === 'object') {
                for (const key of [
                    'url',
                    'image_url',
                    'imageUrl',
                    'output_image',
                    'outputImage',
                    'b64_json',
                    'base64',
                    'inlineData',
                    'inline_data',
                    'fileData',
                    'file_data',
                    'text',
                    'content',
                    'parts'
                ]) {
                    if (item[key]) {
                        const nested = normalizeImageItem(item[key]);
                        if (nested) images.push(nested);
                    }
                }
            }
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

async function normalizeReferenceImages(references, user, context = {}) {
    const normalized = [];
    for (const reference of normalizeInputArray(references)) {
        const dataUri = await resolveReferenceImageToDataUri(reference, user, context);
        if (dataUri) normalized.push(dataUri);
    }
    return normalized;
}

export function normalizeDatalerImageResponse(raw) {
    const images = collectImages(raw);
    if (images.length === 0) {
        console.error('[Dataler][empty image result]', {
            model: raw?.model || DEFAULT_IMAGE_MODEL,
            preview: safeJsonPreview(raw)
        });
        throw new AiProviderError({
            type: AI_ERROR_TYPES.EMPTY_RESULT,
            provider: DATALER_PROVIDER,
            model: raw?.model || DEFAULT_IMAGE_MODEL,
            message: 'Dataler image response did not include a usable image URL.',
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
        provider: DATALER_PROVIDER,
        model: context.model,
        raw: error?.raw || context.raw
    });

    return new AiProviderError({
        type: classifyDatalerErrorType(classified.message || error?.message) || classified.type,
        provider: DATALER_PROVIDER,
        model: context.model || classified.model,
        message: classified.message,
        cause: error,
        raw: classified.raw
    });
}

export async function submitImageTask(input = {}, options = {}) {
    const config = options.config || getAiProviderConfig();
    const { baseUrl, apiKey } = config.dataler;
    const model = input.model || config.dataler.imageModel || DEFAULT_IMAGE_MODEL;

    if (!baseUrl) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: DATALER_PROVIDER,
            model,
            message: 'Dataler image provider is not configured. Add DATALER_API_BASE_URL to .env.'
        });
    }
    assertAsciiSecret('DATALER_API_KEY', apiKey, model);

    const timeoutMs = config.dataler.requestTimeoutMs;
    const size = input.size || config.dataler.imageSize;
    const resolution = input.resolution || config.dataler.imageResolution;
    const imageUrls = await normalizeReferenceImages(input.imageUrls || input.image_urls || input.referenceImages, options.user, {
        model,
        timeoutMs
    });
    const prompt = buildPromptWithOutputHints(input.prompt || '', { size, resolution });
    const content = imageUrls.length > 0
        ? [
            { type: 'text', text: prompt },
            ...imageUrls.map(url => ({
                type: 'image_url',
                image_url: { url }
            }))
        ]
        : prompt;
    const requestBody = {
        model,
        messages: [
            {
                role: 'user',
                content
            }
        ],
        stream: false
    };

    const requestUrl = buildDatalerEndpoint(baseUrl);
    console.log('[Dataler][image request]', {
        requestUrl,
        model,
        referenceCount: imageUrls.length,
        size,
        resolution,
        endpoint: '/chat/completions'
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
    const normalized = normalizeDatalerImageResponse(raw);

    return {
        provider: DATALER_PROVIDER,
        model,
        taskId: raw?.id || raw?.created ? `dataler:${raw.id || raw.created}` : null,
        status: 'completed',
        rawStatus: 'completed',
        progress: 100,
        images: normalized.images,
        raw,
        usage: raw?.usage,
        request: {
            endpoint: '/chat/completions',
            size,
            resolution,
            referenceCount: imageUrls.length
        }
    };
}

export async function pollImageTask(providerTaskId, options = {}) {
    const config = options.config || getAiProviderConfig();
    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: DATALER_PROVIDER,
        model: options.model || config.dataler.imageModel || DEFAULT_IMAGE_MODEL,
        message: `Dataler provider does not support polling provider task ${providerTaskId || ''}.`
    });
}

export async function generateImage(input = {}, options = {}) {
    return await submitImageTask(input, options);
}
