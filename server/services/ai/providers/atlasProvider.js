import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';
import { resolveImageToBase64 } from '../../../utils/imageHelpers.js';
import { safeFetchImageUrl } from '../../../utils/safeFetchImage.js';

const ATLAS_PROVIDER = 'atlas';
const DEFAULT_BASE_URL = 'https://api.atlascloud.ai';
const DEFAULT_TEXT_TO_IMAGE_MODEL = 'openai/gpt-image-2/text-to-image';
const DEFAULT_EDIT_MODEL = 'openai/gpt-image-2/edit';
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_OUTPUT_FORMAT = 'jpeg';
const DEFAULT_MODERATION = 'low';
const DEFAULT_NANO_BANANA_2_ASPECT_RATIO = '16:9';
const DEFAULT_NANO_BANANA_2_RESOLUTION = '2k';
const DEFAULT_NANO_BANANA_2_OUTPUT_FORMAT = 'default';
const DEFAULT_NANO_BANANA_2_MEDIA_RESOLUTION = 'default';
const DEFAULT_NANO_BANANA_2_THINKING_LEVEL = 'default';
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'error', 'rejected', 'cancelled', 'canceled']);
const NANO_BANANA_2_MAX_IMAGES = 14;

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAtlasRuntimeConfig(config = {}) {
    return config.atlas || config || {};
}

function cleanBaseUrl(baseUrl) {
    return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function buildAtlasEndpoint(baseUrl, route) {
    const clean = cleanBaseUrl(baseUrl);
    const normalizedRoute = String(route || '').replace(/^\/+/, '');
    if (/\/api\/v1$/i.test(clean)) return `${clean}/${normalizedRoute.replace(/^api\/v1\//i, '')}`;
    return `${clean}/${normalizedRoute}`;
}

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

function normalizeStatus(rawStatus) {
    const status = String(rawStatus || '').trim().toLowerCase();
    if (['completed', 'succeeded', 'success', 'done', 'finished'].includes(status)) return 'completed';
    if (TERMINAL_FAILURE_STATUSES.has(status)) return 'failed';
    if (['queued', 'running', 'processing', 'pending', 'submitted'].includes(status)) return 'processing';
    return status || 'processing';
}

function createTimeoutError(context, timeoutMs, cause) {
    return new AiProviderError({
        type: AI_ERROR_TYPES.TIMEOUT,
        provider: ATLAS_PROVIDER,
        model: context.model,
        message: `Atlas ${context.action} timed out after ${timeoutMs}ms.`,
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

function classifyAtlasErrorType(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('401') || text.includes('403') || text.includes('unauthorized') || text.includes('forbidden') || text.includes('invalid api key')) {
        return AI_ERROR_TYPES.AUTH_ERROR;
    }
    if (text.includes('402') || text.includes('quota') || text.includes('balance') || text.includes('payment')) {
        return AI_ERROR_TYPES.QUOTA_ERROR;
    }
    if (text.includes('429') || text.includes('rate limit')) {
        return AI_ERROR_TYPES.RATE_LIMIT;
    }
    if (text.includes('400') || text.includes('invalid') || text.includes('parameter') || text.includes('param')) {
        return AI_ERROR_TYPES.PARAM_ERROR;
    }
    if (text.includes('timeout') || text.includes('timed out')) {
        return AI_ERROR_TYPES.TIMEOUT;
    }
    if (text.includes('empty') || text.includes('no image') || text.includes('output')) {
        return AI_ERROR_TYPES.EMPTY_RESULT;
    }
    if (text.includes('fetch failed') || text.includes('network')) {
        return AI_ERROR_TYPES.NETWORK_ERROR;
    }
    return AI_ERROR_TYPES.PROVIDER_ERROR;
}

function isAtlasDebugRequestsEnabled() {
    return process.env.ATLAS_DEBUG_REQUESTS === 'true';
}

function sanitizeResponsePreview(value, maxLength = 500) {
    return String(value || '')
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/sk-[A-Za-z0-9._-]+/g, 'sk-[redacted]')
        .slice(0, maxLength);
}

async function parseJsonResponse(response, context = {}) {
    const rawText = await response.text();
    const bodyPreview = sanitizeResponsePreview(rawText);
    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        if (!response.ok) {
            throw new AiProviderError({
                type: classifyAtlasErrorType(`${response.status} ${response.statusText} ${bodyPreview}`),
                provider: ATLAS_PROVIDER,
                model: context.model,
                message: `Atlas ${context.action} failed: ${response.status} ${response.statusText} - ${bodyPreview || 'Non-JSON response'}`,
                raw: {
                    status: response.status,
                    statusText: response.statusText,
                    contentType: response.headers.get('content-type') || '',
                    bodyPreview
                }
            });
        }

        throw new AiProviderError({
            type: AI_ERROR_TYPES.PROVIDER_ERROR,
            provider: ATLAS_PROVIDER,
            model: context.model,
            message: `Atlas ${context.action} returned a non-JSON response.`,
            raw: {
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type') || '',
                bodyPreview
            }
        });
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.data?.error ||
            data?.error ||
            data?.message ||
            response.statusText ||
            `HTTP ${response.status}`;

        throw new AiProviderError({
            type: classifyAtlasErrorType(`${response.status} ${response.statusText} ${message}`),
            provider: ATLAS_PROVIDER,
            model: context.model,
            message: `Atlas ${context.action} failed: ${response.status} ${response.statusText} - ${message}`,
            raw: {
                status: response.status,
                statusText: response.statusText,
                bodyPreview,
                data
            }
        });
    }

    return data;
}

function dataUriFromBuffer(buffer, mimeType = 'image/png') {
    return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function fetchReferenceImage(reference, context = {}) {
    const downloaded = await safeFetchImageUrl(reference, {
        timeoutMs: context.timeoutMs
    });
    return downloaded.url || reference;
}

async function resolveAtlasReferenceImage(reference, user, context = {}) {
    if (typeof reference !== 'string' || !reference.trim()) return null;
    const cleanReference = reference.trim();
    if (cleanReference.startsWith('data:image/')) return cleanReference;

    const isLibraryReference = cleanReference.startsWith('/library/') || /^https?:\/\/[^/]+\/library\//i.test(cleanReference);
    if (isLibraryReference) {
        const dataUri = resolveImageToBase64(cleanReference, user);
        if (!dataUri) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PARAM_ERROR,
                provider: ATLAS_PROVIDER,
                model: context.model,
                message: 'Atlas reference image could not be resolved from the local library URL.',
                raw: {
                    referencePreview: cleanReference.slice(0, 160)
                }
            });
        }
        return dataUri;
    }

    if (/^https?:\/\//i.test(cleanReference)) {
        return await fetchReferenceImage(cleanReference, context);
    }

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: ATLAS_PROVIDER,
        model: context.model,
        message: 'Atlas reference image must be a /library URL, http(s) URL, or data:image base64 URI.'
    });
}

async function resolveAtlasReferenceImages(references, user, context = {}) {
    const result = [];
    for (const reference of normalizeInputArray(references)) {
        const normalized = await resolveAtlasReferenceImage(reference, user, context);
        if (normalized) result.push(normalized);
    }
    return result;
}

export function resolveAtlasSize(aspectRatioOrSize) {
    const value = String(aspectRatioOrSize || '').trim();
    if (/^\d+x\d+$/i.test(value)) {
        if (['1024x1024', '1536x1024', '1024x1536'].includes(value.toLowerCase())) {
            return value.toLowerCase();
        }
    }

    if (['3:2', '4:3', '16:9', '21:9', '2:1'].includes(value)) return '1536x1024';
    if (['2:3', '3:4', '9:16', '1:2'].includes(value)) return '1024x1536';
    return '1024x1024';
}

export function resolveAtlasQuality(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['low', 'fast', '1k', '1K'.toLowerCase()].includes(normalized)) return 'low';
    if (['high', '4k', 'ultra'].includes(normalized)) return 'high';
    return 'medium';
}

function isNanoBanana2Model(model) {
    return String(model || '').toLowerCase().includes('nano-banana-2');
}

function resolveAtlasAspectRatio(aspectRatioOrSize) {
    const value = String(aspectRatioOrSize || '').trim();
    if (!value || /^auto$/i.test(value)) return undefined;
    if (/^\d+:\d+$/.test(value)) return value;
    if (/^\d+x\d+$/i.test(value)) {
        const [width, height] = value.toLowerCase().split('x').map(Number);
        if (width > 0 && height > 0) {
            const divisor = greatestCommonDivisor(width, height);
            return `${width / divisor}:${height / divisor}`;
        }
    }
    return undefined;
}

function greatestCommonDivisor(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        const next = x % y;
        x = y;
        y = next;
    }
    return x || 1;
}

function resolveAtlasResolution(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['1k', '2k', '4k'].includes(normalized)) return normalized;
    if (['low', 'fast'].includes(normalized)) return '1k';
    if (['medium', 'default', ''].includes(normalized)) return '2k';
    if (['high', 'ultra'].includes(normalized)) return '4k';
    return undefined;
}

function resolveAtlasOutputFormat(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['png', 'jpeg'].includes(normalized) ? normalized : DEFAULT_OUTPUT_FORMAT;
}

function resolveAtlasNanoBanana2OutputFormat(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'jpg') return 'jpeg';
    return ['default', 'png', 'jpeg'].includes(normalized) ? normalized : DEFAULT_NANO_BANANA_2_OUTPUT_FORMAT;
}

function resolveAtlasNanoBanana2DefaultField(value, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || fallback;
}

function normalizeImageItem(item) {
    if (!item) return null;
    if (Array.isArray(item)) {
        for (const nested of item) {
            const normalized = normalizeImageItem(nested);
            if (normalized) return normalized;
        }
        return null;
    }
    if (typeof item === 'string') {
        if (item.startsWith('data:')) {
            const match = item.match(/^data:([^;]+);base64,([\s\S]+)$/);
            return match ? { base64: match[2].replace(/\s+/g, ''), mimeType: match[1] } : { url: item };
        }
        if (/^https?:\/\//i.test(item)) return { url: item };
        return /^[A-Za-z0-9+/=\r\n]+$/.test(item) && item.length > 80
            ? { base64: item.replace(/\s+/g, ''), mimeType: 'image/png' }
            : null;
    }
    if (typeof item !== 'object') return null;

    const url = item.url || item.image_url || item.imageUrl || item.result_url || item.resultUrl || item.uri;
    const base64 = item.b64_json || item.base64 || item.image_base64 || item.imageBase64;
    if (url) return normalizeImageItem(url);
    if (base64) return normalizeImageItem(base64);
    return null;
}

export function normalizeAtlasImageResult(raw) {
    const data = raw?.data || raw;
    const candidates = [
        data?.outputs,
        data?.output,
        data?.images,
        data?.image,
        data?.url,
        data?.image_url,
        raw?.outputs,
        raw?.images,
        raw?.url,
        raw?.image_url
    ];
    const images = [];

    for (const candidate of candidates) {
        for (const item of normalizeInputArray(candidate)) {
            const normalized = normalizeImageItem(item);
            if (normalized) images.push(normalized);
        }
    }

    const seen = new Set();
    const uniqueImages = images.filter(image => {
        const key = image.url || image.base64;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (uniqueImages.length === 0) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.EMPTY_RESULT,
            provider: ATLAS_PROVIDER,
            model: data?.model,
            message: 'Atlas image response did not include a usable image URL.',
            raw: {
                status: data?.status,
                keys: data && typeof data === 'object' ? Object.keys(data) : []
            }
        });
    }

    return { images: uniqueImages };
}

function getAtlasErrorMessage(raw) {
    return raw?.data?.error?.message ||
        raw?.data?.error ||
        raw?.error?.message ||
        raw?.error ||
        raw?.message ||
        'Atlas image task failed.';
}

export async function submitImageTask(input = {}, options = {}) {
    const config = getAtlasRuntimeConfig(options.config || getAiProviderConfig());
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const apiKey = config.apiKey;
    const referenceImages = normalizeInputArray(input.imageUrls || input.image_urls || input.referenceImages).filter(Boolean);
    const requestedModel = String(input.model || '').trim();
    const isEdit = referenceImages.length > 0 || /\/edit$/i.test(requestedModel);
    const model = isEdit
        ? (/\/edit$/i.test(requestedModel) ? requestedModel : config.editModel || DEFAULT_EDIT_MODEL)
        : requestedModel || config.textToImageModel || DEFAULT_TEXT_TO_IMAGE_MODEL;
    const isNanoBanana2 = isNanoBanana2Model(model);

    if (!baseUrl || !apiKey) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: ATLAS_PROVIDER,
            model,
            message: 'Atlas image provider is not configured. Add ATLAS_BASE_URL and ATLAS_API_KEY to .env, or configure a team provider credential.'
        });
    }

    const timeoutMs = parsePositiveInteger(config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const images = isEdit
        ? await resolveAtlasReferenceImages(referenceImages, options.user, { model, timeoutMs })
        : [];

    if (isNanoBanana2 && isEdit) {
        if (images.length === 0) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PARAM_ERROR,
                provider: ATLAS_PROVIDER,
                model,
                message: 'Atlas Nano Banana 2 edit requires at least one reference image.'
            });
        }
        if (images.length > NANO_BANANA_2_MAX_IMAGES) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PARAM_ERROR,
                provider: ATLAS_PROVIDER,
                model,
                message: `Atlas Nano Banana 2 edit supports at most ${NANO_BANANA_2_MAX_IMAGES} reference images.`
            });
        }
    }

    const requestBody = {
        model,
        enable_base64_output: false,
        enable_sync_mode: false,
        output_format: resolveAtlasOutputFormat(input.outputFormat || config.outputFormat),
        prompt: input.prompt || '',
        moderation: input.moderation || config.moderation || DEFAULT_MODERATION
    };

    if (isNanoBanana2) {
        delete requestBody.moderation;
        requestBody.enable_web_search = false;
        requestBody.enable_image_search = false;
        requestBody.output_format = resolveAtlasNanoBanana2OutputFormat(
            input.outputFormat || config.nanoBanana2OutputFormat
        );
        requestBody.aspect_ratio = resolveAtlasAspectRatio(
            input.aspectRatio || input.size || config.aspectRatio
        ) || DEFAULT_NANO_BANANA_2_ASPECT_RATIO;
        requestBody.resolution = resolveAtlasResolution(
            input.resolution || config.resolution
        ) || DEFAULT_NANO_BANANA_2_RESOLUTION;
        requestBody.media_resolution = resolveAtlasNanoBanana2DefaultField(
            input.mediaResolution || config.nanoBanana2MediaResolution,
            DEFAULT_NANO_BANANA_2_MEDIA_RESOLUTION
        );
        requestBody.thinking_level = resolveAtlasNanoBanana2DefaultField(
            input.thinkingLevel || config.nanoBanana2ThinkingLevel,
            DEFAULT_NANO_BANANA_2_THINKING_LEVEL
        );
    } else {
        requestBody.quality = resolveAtlasQuality(input.quality || input.resolution || config.quality);
        requestBody.size = resolveAtlasSize(input.size || input.aspectRatio);
    }

    if (images.length > 0) requestBody.images = images;

    const endpoint = buildAtlasEndpoint(baseUrl, '/api/v1/model/generateImage');
    if (isAtlasDebugRequestsEnabled()) {
        console.log('[AtlasProvider] submit request', {
            submitUrl: endpoint,
            model,
            payloadKeys: Object.keys(requestBody),
            hasImages: images.length > 0,
            imageCount: images.length,
            outputFormat: requestBody.output_format || null,
            aspectRatio: requestBody.aspect_ratio || null,
            resolution: requestBody.resolution || null,
            mediaResolution: requestBody.media_resolution || null,
            thinkingLevel: requestBody.thinking_level || null
        });
    }

    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    }, {
        action: 'image generation submit',
        model,
        timeoutMs
    });
    const raw = await parseJsonResponse(response, {
        action: 'image generation submit',
        model
    });
    const data = raw?.data || raw;
    const taskId = data?.id || raw?.id;
    const status = normalizeStatus(data?.status || raw?.status);

    if (!taskId && status !== 'completed') {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PROVIDER_ERROR,
            provider: ATLAS_PROVIDER,
            model,
            message: 'Atlas image submit did not return prediction id.',
            raw: {
                keys: data && typeof data === 'object' ? Object.keys(data) : []
            }
        });
    }

    if (status === 'completed') {
        const normalized = normalizeAtlasImageResult(raw);
        return {
            provider: ATLAS_PROVIDER,
            model,
            taskId: taskId || null,
            status: 'completed',
            rawStatus: data?.status || raw?.status,
            progress: 100,
            images: normalized.images,
            raw,
            usage: data?.usage || raw?.usage || data?.metrics || null,
            request: {
                endpoint: '/api/v1/model/generateImage',
                size: requestBody.size || null,
                aspectRatio: requestBody.aspect_ratio || null,
                resolution: requestBody.resolution || null,
                mediaResolution: requestBody.media_resolution || null,
                thinkingLevel: requestBody.thinking_level || null,
                quality: requestBody.quality,
                outputFormat: requestBody.output_format,
                referenceCount: images.length
            }
        };
    }

    if (status === 'failed') {
        throw new AiProviderError({
            type: classifyAtlasErrorType(getAtlasErrorMessage(raw)),
            provider: ATLAS_PROVIDER,
            model,
            message: getAtlasErrorMessage(raw),
            raw
        });
    }

    return {
        provider: ATLAS_PROVIDER,
        model,
        taskId,
        status,
        rawStatus: data?.status || raw?.status,
        progress: data?.progress ?? null,
        images: [],
        raw,
        usage: data?.usage || raw?.usage || data?.metrics || null,
        request: {
            endpoint: '/api/v1/model/generateImage',
            size: requestBody.size || null,
            aspectRatio: requestBody.aspect_ratio || null,
            resolution: requestBody.resolution || null,
            mediaResolution: requestBody.media_resolution || null,
            thinkingLevel: requestBody.thinking_level || null,
            quality: requestBody.quality,
            outputFormat: requestBody.output_format,
            referenceCount: images.length
        }
    };
}

export async function pollImageTask(providerTaskId, options = {}) {
    const config = getAtlasRuntimeConfig(options.config || getAiProviderConfig());
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const apiKey = config.apiKey;
    const model = options.model || config.textToImageModel || DEFAULT_TEXT_TO_IMAGE_MODEL;

    if (!baseUrl || !apiKey) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: ATLAS_PROVIDER,
            model,
            message: 'Atlas image provider is not configured. Add ATLAS_BASE_URL and ATLAS_API_KEY to .env, or configure a team provider credential.'
        });
    }

    const timeoutMs = parsePositiveInteger(config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const endpoint = buildAtlasEndpoint(baseUrl, `/api/v1/model/prediction/${encodeURIComponent(providerTaskId)}`);
    const response = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    }, {
        action: 'image prediction poll',
        model,
        timeoutMs
    });
    const raw = await parseJsonResponse(response, {
        action: 'image prediction poll',
        model
    });
    const data = raw?.data || raw;
    const status = normalizeStatus(data?.status || raw?.status);

    if (status === 'completed') {
        const normalized = normalizeAtlasImageResult(raw);
        return {
            provider: ATLAS_PROVIDER,
            model,
            taskId: data?.id || providerTaskId,
            status,
            rawStatus: data?.status || raw?.status,
            progress: 100,
            images: normalized.images,
            raw,
            usage: data?.usage || data?.metrics || raw?.usage || null,
            actualTime: data?.metrics?.predict_time ?? null
        };
    }

    if (status === 'failed') {
        return {
            provider: ATLAS_PROVIDER,
            model,
            taskId: data?.id || providerTaskId,
            status,
            rawStatus: data?.status || raw?.status,
            progress: data?.progress ?? null,
            images: [],
            raw,
            error: getAtlasErrorMessage(raw)
        };
    }

    return {
        provider: ATLAS_PROVIDER,
        model,
        taskId: data?.id || providerTaskId,
        status,
        rawStatus: data?.status || raw?.status,
        progress: data?.progress ?? null,
        images: [],
        raw,
        usage: data?.usage || data?.metrics || raw?.usage || null
    };
}

export async function generateImage(input = {}, options = {}) {
    const submitResult = await submitImageTask(input, options);
    if (submitResult.status === 'completed') return submitResult;
    if (!submitResult.taskId) return submitResult;

    const startedAt = Date.now();
    const config = getAtlasRuntimeConfig(options.config || getAiProviderConfig());
    const timeoutMs = parsePositiveInteger(config.imagePollTimeoutMs || config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const pollIntervalMs = parsePositiveInteger(config.imagePollIntervalMs, 5000);

    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        const pollResult = await pollImageTask(submitResult.taskId, {
            ...options,
            model: submitResult.model
        });

        if (pollResult.status === 'completed' || pollResult.status === 'failed') {
            return pollResult;
        }
    }

    return {
        ...submitResult,
        status: 'failed',
        error: `Atlas image task timed out: prediction_id=${submitResult.taskId}, elapsedMs=${Date.now() - startedAt}`
    };
}

export function normalizeProviderError(error, context = {}) {
    if (error instanceof AiProviderError) return error;

    const classified = classifyProviderError(error, {
        provider: ATLAS_PROVIDER,
        model: context.model,
        raw: error?.raw || context.raw
    });

    return new AiProviderError({
        type: classifyAtlasErrorType(classified.message || error?.message) || classified.type,
        provider: ATLAS_PROVIDER,
        model: context.model || classified.model,
        message: classified.message,
        cause: error,
        raw: classified.raw
    });
}
