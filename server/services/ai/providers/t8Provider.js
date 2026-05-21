import fs from 'fs';
import path from 'path';
import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';
import { safeFetchImageUrl } from '../../../utils/safeFetchImage.js';
import { resolveLibraryUrlToPath } from '../../../utils/userLibrary.js';

const T8_PROVIDER = 't8';
const GPT_IMAGE_2_MODEL = 'gpt-image-2';
const NANO_BANANA_MODEL = 'gemini-3.1-flash-image-preview';
const T8_GPT_IMAGE_2_TEXT_MODEL_ID = 'custom-image-t8-gpt-image-2';
const T8_NANO_BANANA_TEXT_MODEL_ID = 'custom-image-t8-nano-banana-3-1-flash';
const T8_GPT_IMAGE_2_EDIT_MODEL_ID = 'custom-image-t8-gpt-image-2-edit';
const T8_NANO_BANANA_EDIT_MODEL_ID = 'custom-image-t8-nano-banana-3-1-flash-edit';
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_GPT_IMAGE_SIZE = 'auto';
const DEFAULT_GPT_IMAGE_QUALITY = 'medium';
const DEFAULT_NANO_IMAGE_SIZE = '1K';
const DEFAULT_RESPONSE_FORMAT = 'url';
const MAX_REFERENCE_IMAGES = 6;
const DEFAULT_REFERENCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

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

export function buildT8ImageEditsUrl(baseUrl) {
    const cleanBaseUrl = cleanString(baseUrl).replace(/\/+$/, '');
    if (!cleanBaseUrl) return '';
    if (/\/images\/edits$/i.test(cleanBaseUrl)) return cleanBaseUrl;
    if (/\/v1$/i.test(cleanBaseUrl)) return `${cleanBaseUrl}/images/edits`;
    return `${cleanBaseUrl}/v1/images/edits`;
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

function isT8TextProjectModel(projectModelId) {
    return projectModelId === T8_GPT_IMAGE_2_TEXT_MODEL_ID || projectModelId === T8_NANO_BANANA_TEXT_MODEL_ID;
}

function isT8EditProjectModel(projectModelId) {
    return projectModelId === T8_GPT_IMAGE_2_EDIT_MODEL_ID || projectModelId === T8_NANO_BANANA_EDIT_MODEL_ID;
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

function normalizeGptImageEditSize({ requestedSize, model }) {
    const cleanRequestedSize = cleanString(requestedSize);
    const lowerRequestedSize = cleanRequestedSize.toLowerCase();

    if (isAutoValue(cleanRequestedSize)) {
        return {
            value: undefined,
            summary: {
                sizeMode: 'auto_omitted'
            }
        };
    }

    if (cleanRequestedSize && GPT_IMAGE_SIZE_ALLOWLIST.has(lowerRequestedSize) && lowerRequestedSize !== DEFAULT_GPT_IMAGE_SIZE) {
        return {
            value: lowerRequestedSize,
            summary: {
                size: lowerRequestedSize
            }
        };
    }

    if (cleanRequestedSize) {
        console.warn('[T8][edit size omitted]', {
            model,
            requestedSize: cleanRequestedSize,
            sizeMode: 'invalid_omitted'
        });
    }

    return {
        value: undefined,
        summary: {
            sizeMode: 'invalid_omitted'
        }
    };
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

function getReferenceImages(input = {}) {
    return [
        ...normalizeInputArray(input.imageUrls),
        ...normalizeInputArray(input.image_urls),
        ...normalizeInputArray(input.referenceImages),
        ...normalizeInputArray(input.images)
    ]
        .filter(Boolean)
        .slice(0, MAX_REFERENCE_IMAGES);
}

function hasReferenceImages(input = {}) {
    return getReferenceImages(input).length > 0;
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

        console.warn(context.errorLogLabel || '[T8][image error response]', {
            status: response.status,
            statusText: response.statusText,
            url: context.requestUrl,
            model: context.model,
            projectModelId: context.projectModelId || undefined,
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

function guessMimeType(filePathOrUrl) {
    const ext = path.extname(String(filePathOrUrl || '').split('?')[0]).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.avif') return 'image/avif';
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

function getReferenceImageMaxBytes(config = {}) {
    return parsePositiveInteger(
        config.referenceImageMaxBytes || process.env.T8_REFERENCE_IMAGE_MAX_BYTES,
        DEFAULT_REFERENCE_IMAGE_MAX_BYTES
    );
}

function assertReferenceImageSize(buffer, { model, maxBytes, sourceType }) {
    const byteLength = Buffer.isBuffer(buffer) ? buffer.length : Buffer.byteLength(buffer || '');
    if (byteLength <= maxBytes) return;

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: T8_PROVIDER,
        model,
        message: `T8 reference image is too large (${byteLength} bytes). Limit is ${maxBytes} bytes.`,
        raw: {
            sourceType,
            byteLength,
            maxBytes
        }
    });
}

function parseDataUriForUpload(input) {
    const parsed = parseDataUri(input);
    if (!parsed) return null;
    if (!String(parsed.mimeType || '').toLowerCase().startsWith('image/')) return null;
    return {
        buffer: Buffer.from(parsed.base64, 'base64'),
        mimeType: parsed.mimeType || 'image/png',
        filename: `reference.${(parsed.mimeType || 'image/png').split('/').pop() || 'png'}`
    };
}

async function resolveReferenceImage(reference, { user, timeoutMs, maxBytes, model }) {
    const effectiveMaxBytes = parsePositiveInteger(maxBytes, DEFAULT_REFERENCE_IMAGE_MAX_BYTES);

    if (typeof reference !== 'string' || !reference.trim()) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 reference image must be a /library URL, http(s) URL, or data:image base64 URI.'
        });
    }

    const cleanReference = reference.trim();
    const dataUri = parseDataUriForUpload(cleanReference);
    if (dataUri) {
        assertReferenceImageSize(dataUri.buffer, {
            model,
            maxBytes: effectiveMaxBytes,
            sourceType: 'data-uri'
        });
        return dataUri;
    }
    if (cleanReference.startsWith('data:')) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 reference image data URI must use an image/* MIME type.'
        });
    }

    const localPath = resolveLibraryUrlToPath(cleanReference, user);
    if (localPath) {
        const stat = fs.statSync(localPath);
        if (stat.size > effectiveMaxBytes) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PARAM_ERROR,
                provider: T8_PROVIDER,
                model,
                message: `T8 reference image is too large (${stat.size} bytes). Limit is ${effectiveMaxBytes} bytes.`,
                raw: {
                    sourceType: 'library-file',
                    byteLength: stat.size,
                    maxBytes: effectiveMaxBytes
                }
            });
        }
        const buffer = fs.readFileSync(localPath);
        assertReferenceImageSize(buffer, {
            model,
            maxBytes: effectiveMaxBytes,
            sourceType: 'library-file'
        });
        return {
            buffer,
            mimeType: guessMimeType(localPath),
            filename: path.basename(localPath)
        };
    }

    if (/^https?:\/\//i.test(cleanReference)) {
        try {
            const downloaded = await safeFetchImageUrl(cleanReference, {
                timeoutMs,
                maxBytes: effectiveMaxBytes
            });
            return {
                buffer: downloaded.buffer,
                mimeType: downloaded.contentType || guessMimeType(cleanReference),
                filename: getFilenameFromUrl(downloaded.url || cleanReference, 'reference.png')
            };
        } catch (error) {
            throw new AiProviderError({
                type: error.message?.startsWith('Blocked unsafe image URL') || error.message?.includes('Unsupported image content type')
                    ? AI_ERROR_TYPES.PARAM_ERROR
                    : AI_ERROR_TYPES.NETWORK_ERROR,
                provider: T8_PROVIDER,
                model,
                message: `Failed to fetch T8 reference image: ${error.message}`,
                cause: error
            });
        }
    }

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: T8_PROVIDER,
        model,
        message: 'T8 reference image must be a /library URL, http(s) URL, or data:image base64 URI.'
    });
}

async function buildEditFormData(input = {}, model, referenceImages, context = {}) {
    const formData = new FormData();
    const prompt = input.prompt || '';
    let summary = {
        imageCount: referenceImages.length,
        response_format: DEFAULT_RESPONSE_FORMAT
    };

    formData.append('model', model);
    formData.append('prompt', prompt);
    formData.append('response_format', DEFAULT_RESPONSE_FORMAT);

    if (model === GPT_IMAGE_2_MODEL) {
        const size = normalizeGptImageEditSize({
            requestedSize: input.size,
            model
        });
        const quality = normalizeGptImage2Quality(input.quality || input.requestedQuality, model);
        if (size.value) {
            formData.append('size', size.value);
        }
        formData.append('quality', quality);
        summary = {
            ...summary,
            ...size.summary,
            quality
        };
    } else if (model === NANO_BANANA_MODEL) {
        const aspectRatio = normalizeNanoAspectRatio(input.aspectRatio || input.aspect_ratio || input.size, model);
        const imageSize = normalizeNanoImageSize(input.imageSize || input.image_size || input.resolution, model);
        if (aspectRatio.value) {
            formData.append('aspect_ratio', aspectRatio.value);
        }
        formData.append('image_size', imageSize);
        summary = {
            ...summary,
            ...aspectRatio.summary,
            image_size: imageSize
        };
    } else {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: `T8 image edit model is not supported: ${model}`
        });
    }

    for (const [index, reference] of referenceImages.entries()) {
        const resolved = await resolveReferenceImage(reference, {
            user: context.user,
            timeoutMs: context.timeoutMs,
            maxBytes: context.referenceImageMaxBytes,
            model
        });
        const blob = new Blob([resolved.buffer], { type: resolved.mimeType || 'image/png' });
        formData.append('image', blob, resolved.filename || `reference-${index + 1}.png`);
    }

    return { formData, summary };
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
    const projectModelId = cleanString(input.projectModelId || input.modelId || input.imageModel);
    const referenceImages = getReferenceImages(input);
    const isEditModel = isT8EditProjectModel(projectModelId);

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

    if (isEditModel && referenceImages.length === 0) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 edit model requires at least one reference image.'
        });
    }

    if (!isEditModel && hasReferenceImages(input)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: 'T8 text-to-image model does not support reference images. Choose a T8 edit model for image-to-image or multi-image generation.'
        });
    }

    const timeoutMs = parsePositiveInteger(t8Config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const referenceImageMaxBytes = getReferenceImageMaxBytes(t8Config);
    const requestUrl = isEditModel ? buildT8ImageEditsUrl(baseUrl) : buildT8ImageGenerationsUrl(baseUrl);

    if (isEditModel) {
        const { formData, summary } = await buildEditFormData(input, model, referenceImages, {
            user: options.user,
            timeoutMs,
            referenceImageMaxBytes
        });

        console.log('[T8][image edit submit]', {
            url: requestUrl,
            model,
            projectModelId,
            promptLength: getPromptLength(input.prompt),
            ...summary
        });

        const response = await fetchWithTimeout(requestUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            body: formData
        }, {
            action: 'image edit',
            model,
            timeoutMs
        });

        const raw = await parseJsonResponse(response, {
            action: 'image edit',
            model,
            projectModelId,
            requestUrl,
            errorLogLabel: '[T8][image edit error response]'
        });
        const normalized = normalizeT8ImageResponse(raw, { model });

        console.log('[T8][image edit response]', {
            url: requestUrl,
            model,
            projectModelId,
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
                endpoint: '/images/edits',
                requestUrl,
                projectModelId,
                ...summary
            }
        };
    }

    if (projectModelId && !isT8TextProjectModel(projectModelId)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: T8_PROVIDER,
            model,
            message: `T8 project model is not supported for text-to-image: ${projectModelId}`
        });
    }

    const { body: requestBody, summary } = buildRequestBody(input, model);

    console.log('[T8][image submit]', {
        url: requestUrl,
        model,
        projectModelId: projectModelId || undefined,
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
        projectModelId,
        requestUrl
    });
    const normalized = normalizeT8ImageResponse(raw, { model });

    console.log('[T8][image response]', {
        url: requestUrl,
        model,
        projectModelId: projectModelId || undefined,
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
            projectModelId: projectModelId || undefined,
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
