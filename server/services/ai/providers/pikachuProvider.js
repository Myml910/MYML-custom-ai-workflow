import fs from 'fs';
import path from 'path';
import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';
import { resolveLibraryUrlToPath } from '../../../utils/userLibrary.js';

const PIKACHU_PROVIDER = 'pikachu';
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const PIKACHU_IMAGE_MODEL = 'gpt-image-2';
const SUPPORTED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createTimeoutError(context, timeoutMs, cause) {
    return new AiProviderError({
        type: AI_ERROR_TYPES.TIMEOUT,
        provider: PIKACHU_PROVIDER,
        model: context.model,
        message: `Pikachu ${context.action} timed out after ${timeoutMs}ms.`,
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

async function parseJsonResponse(response, context) {
    const rawText = await response.text();
    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PROVIDER_ERROR,
            provider: PIKACHU_PROVIDER,
            model: context.model,
            message: `Pikachu ${context.action} returned non-JSON response: ${rawText.slice(0, 500)}`,
            raw: rawText.slice(0, 500)
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
            type: classifyPikachuErrorType(`${response.status} ${response.statusText} ${message}`),
            provider: PIKACHU_PROVIDER,
            model: context.model,
            message: `Pikachu ${context.action} failed: ${response.status} ${response.statusText} - ${message}`,
            raw: data
        });
    }

    return data;
}

function classifyPikachuErrorType(message) {
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

function guessMimeType(filePathOrUrl) {
    const ext = path.extname(String(filePathOrUrl || '').split('?')[0]).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/png';
}

function getFilenameFromUrl(url, fallback) {
    try {
        const pathname = new URL(url).pathname;
        return path.basename(pathname) || fallback;
    } catch {
        return fallback;
    }
}

function parseDataUri(input) {
    const match = String(input || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
        buffer: Buffer.from(match[2], 'base64'),
        mimeType: match[1],
        filename: `reference.${match[1].split('/').pop() || 'png'}`
    };
}

async function resolveReferenceImage(reference, { user, timeoutMs, model }) {
    const dataUri = parseDataUri(reference);
    if (dataUri) return dataUri;

    const localPath = resolveLibraryUrlToPath(reference, user);
    if (localPath) {
        return {
            buffer: fs.readFileSync(localPath),
            mimeType: guessMimeType(localPath),
            filename: path.basename(localPath)
        };
    }

    if (typeof reference === 'string' && /^https?:\/\//i.test(reference)) {
        const response = await fetchWithTimeout(reference, {}, {
            action: 'reference image fetch',
            model,
            timeoutMs
        });

        if (!response.ok) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.NETWORK_ERROR,
                provider: PIKACHU_PROVIDER,
                model,
                message: `Failed to fetch Pikachu reference image: ${response.status} ${response.statusText}`
            });
        }

        const contentType = response.headers.get('content-type')?.split(';')[0] || guessMimeType(reference);
        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            mimeType: contentType,
            filename: getFilenameFromUrl(reference, 'reference.png')
        };
    }

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: PIKACHU_PROVIDER,
        model,
        message: 'Pikachu reference image must be a /library URL, http(s) URL, or data:image base64 URI.'
    });
}

function normalizeImageItem(item) {
    if (!item) return null;
    if (typeof item === 'string') {
        if (item.startsWith('data:')) {
            const parsed = parseDataUri(item);
            return parsed ? { base64: parsed.buffer.toString('base64'), mimeType: parsed.mimeType } : { url: item };
        }
        return item.startsWith('http') ? { url: item } : { base64: item, mimeType: 'image/png' };
    }
    if (typeof item !== 'object') return null;

    const url = item.url || item.image_url || item.imageUrl;
    const base64 = item.b64_json || item.base64 || item.image_base64 || item.imageBase64;
    if (url) return normalizeImageItem(url);
    if (base64) {
        const parsed = typeof base64 === 'string' && base64.startsWith('data:') ? parseDataUri(base64) : null;
        return {
            base64: parsed ? parsed.buffer.toString('base64') : String(base64).split(',').pop(),
            mimeType: parsed?.mimeType || item.mime_type || item.mimeType || 'image/png'
        };
    }
    return null;
}

function collectImages(raw) {
    const candidates = [
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
                for (const key of ['url', 'image_url', 'imageUrl', 'b64_json', 'base64']) {
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

export function resolvePikachuSize(aspectRatio, resolution) {
    const value = String(aspectRatio || resolution || '').trim();
    if (SUPPORTED_SIZES.has(value)) return value;

    const normalized = value.toLowerCase();
    if (!normalized || normalized === 'auto') return '1024x1024';

    const ratioMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!ratioMatch) return '1024x1024';

    const width = Number.parseFloat(ratioMatch[1]);
    const height = Number.parseFloat(ratioMatch[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return '1024x1024';
    }
    if (Math.abs(width - height) < 0.01) return '1024x1024';
    return width > height ? '1536x1024' : '1024x1536';
}

export function resolvePikachuQuality(resolution) {
    const value = String(resolution || '').trim().toLowerCase();
    if (['low', 'fast', '1k'].includes(value)) return 'low';
    if (['high', 'ultra', '4k'].includes(value)) return 'high';
    return 'medium';
}

export function normalizeImageResult(raw) {
    const images = collectImages(raw);
    if (images.length === 0) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.EMPTY_RESULT,
            provider: PIKACHU_PROVIDER,
            model: raw?.model || PIKACHU_IMAGE_MODEL,
            message: 'Pikachu image response did not include a usable image URL.'
        });
    }

    return { images };
}

export function normalizeProviderError(error, context = {}) {
    if (error instanceof AiProviderError) return error;

    const classified = classifyProviderError(error, {
        provider: PIKACHU_PROVIDER,
        model: context.model,
        raw: error?.raw || context.raw
    });

    return new AiProviderError({
        type: classifyPikachuErrorType(classified.message || error?.message) || classified.type,
        provider: PIKACHU_PROVIDER,
        model: context.model || classified.model,
        message: classified.message,
        cause: error,
        raw: classified.raw
    });
}

async function createEditFormData(input, context) {
    const formData = new FormData();
    const referenceImages = normalizeInputArray(input.referenceImages || input.imageUrls || input.image_urls).filter(Boolean);

    formData.append('model', input.model || context.model);
    formData.append('prompt', input.prompt || '');
    formData.append('size', context.size);
    formData.append('quality', context.quality);
    formData.append('n', '1');

    const fieldName = referenceImages.length > 1 ? 'image[]' : 'image';
    for (const [index, reference] of referenceImages.entries()) {
        const resolved = await resolveReferenceImage(reference, {
            user: context.user,
            timeoutMs: context.timeoutMs,
            model: context.model
        });
        const blob = new Blob([resolved.buffer], { type: resolved.mimeType || 'image/png' });
        formData.append(fieldName, blob, resolved.filename || `reference-${index + 1}.png`);
    }

    return formData;
}

export async function submitImageTask(input = {}, options = {}) {
    const config = options.config || getAiProviderConfig();
    const { baseUrl, apiKey } = config.pikachu;
    const model = input.model || config.pikachu.imageModel || PIKACHU_IMAGE_MODEL;

    if (!baseUrl || !apiKey) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: PIKACHU_PROVIDER,
            model,
            message: 'Pikachu image provider is not configured. Add PIKACHU_BASE_URL and PIKACHU_API_KEY to .env.'
        });
    }

    const timeoutMs = parsePositiveInteger(options.requestTimeoutMs || config.pikachu.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const size = resolvePikachuSize(input.size || input.aspectRatio, input.resolution);
    const quality = resolvePikachuQuality(input.quality || input.resolution || config.pikachu.imageQuality);
    const referenceImages = normalizeInputArray(input.referenceImages || input.imageUrls || input.image_urls).filter(Boolean);
    const isEdit = referenceImages.length > 0;
    const endpoint = `${baseUrl}${isEdit ? '/images/edits' : '/images/generations'}`;

    const fetchOptions = isEdit
        ? {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            body: await createEditFormData(input, {
                user: options.user,
                model,
                size,
                quality,
                timeoutMs
            })
        }
        : {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                prompt: input.prompt || '',
                size,
                quality,
                n: 1
            })
        };

    const response = await fetchWithTimeout(endpoint, fetchOptions, {
        action: isEdit ? 'image edit' : 'image generation',
        model,
        timeoutMs
    });
    const raw = await parseJsonResponse(response, {
        action: isEdit ? 'image edit' : 'image generation',
        model
    });
    const normalized = normalizeImageResult(raw);
    const syntheticTaskId = raw?.id || raw?.created ? `pikachu:${raw.id || raw.created}` : null;

    return {
        provider: PIKACHU_PROVIDER,
        model,
        taskId: syntheticTaskId,
        status: 'completed',
        rawStatus: 'completed',
        progress: 100,
        images: normalized.images,
        raw,
        usage: raw?.usage,
        request: {
            endpoint: isEdit ? '/images/edits' : '/images/generations',
            size,
            quality,
            referenceCount: referenceImages.length
        }
    };
}

export async function pollImageTask(providerTaskId, options = {}) {
    const config = options.config || getAiProviderConfig();
    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: PIKACHU_PROVIDER,
        model: options.model || config.pikachu.imageModel || PIKACHU_IMAGE_MODEL,
        message: `Pikachu provider does not support polling provider task ${providerTaskId || ''}.`
    });
}

export async function generateImage(input = {}, options = {}) {
    return await submitImageTask(input, options);
}
