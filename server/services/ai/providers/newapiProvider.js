import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';
import { resolveImageToBase64 } from '../../../utils/imageHelpers.js';
import { safeFetchImageUrl } from '../../../utils/safeFetchImage.js';

const NEWAPI_PROVIDER = 'newapi';
const DEFAULT_BASE_URL = 'http://10.0.0.30:13000/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_IMAGE_MODEL = 'google/gemini-3.1-flash-image-preview';

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getNewapiRuntimeConfig(config = {}) {
    return config.newapi || config || {};
}

export function buildNewapiChatCompletionsUrl(baseUrl) {
    const cleanBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBaseUrl) return '';
    if (/\/chat\/completions$/i.test(cleanBaseUrl)) return cleanBaseUrl;
    if (/\/v1$/i.test(cleanBaseUrl)) return `${cleanBaseUrl}/chat/completions`;
    return `${cleanBaseUrl}/v1/chat/completions`;
}

function createTimeoutError(context, timeoutMs, cause) {
    return new AiProviderError({
        type: AI_ERROR_TYPES.TIMEOUT,
        provider: NEWAPI_PROVIDER,
        model: context.model,
        message: `NewAPI ${context.action} timed out after ${timeoutMs}ms.`,
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

function classifyNewapiErrorType(message) {
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
    if (text.includes('no channel') || text.includes('no available channel')) {
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
    const preview = rawText.slice(0, 500);

    let data = {};
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PROVIDER_ERROR,
            provider: NEWAPI_PROVIDER,
            model: context.model,
            message: `NewAPI ${context.action} returned non-JSON response.`,
            raw: {
                requestUrl: context.requestUrl,
                status: response.status,
                contentType,
                preview
            }
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
            type: classifyNewapiErrorType(`${response.status} ${response.statusText} ${message}`),
            provider: NEWAPI_PROVIDER,
            model: context.model,
            message: `NewAPI ${context.action} failed: ${response.status} ${response.statusText} - ${message}`,
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
    const match = String(input || '').match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) return null;
    return {
        base64: match[2].replace(/\s+/g, ''),
        mimeType: match[1]
    };
}

function safeJsonPreview(value) {
    try {
        return JSON.stringify(value).slice(0, 500);
    } catch {
        return String(value || '').slice(0, 500);
    }
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

    const inlineData = item.inlineData || item.inline_data;
    const imageUrl = item.image_url || item.imageUrl;
    const fileData = item.fileData || item.file_data;
    const outputImage = item.output_image || item.outputImage;
    const url = item.url || item.uri || item.file_uri || item.fileUri || item.result_url || item.resultUrl;
    const base64 = item.b64_json || item.base64 || item.image_base64 || item.imageBase64 || inlineData?.data;

    if (outputImage) return normalizeImageItem(outputImage);
    if (imageUrl) return normalizeImageItem(typeof imageUrl === 'object' ? imageUrl.url || imageUrl.uri || imageUrl : imageUrl);
    if (fileData) return normalizeImageItem(fileData.fileUri || fileData.file_uri || fileData.url || fileData.uri);
    if (url) return normalizeImageItem(url);
    if (base64) {
        const parsed = typeof base64 === 'string' && base64.startsWith('data:') ? parseDataUri(base64) : null;
        return {
            base64: parsed ? parsed.base64 : String(base64).split(',').pop().replace(/\s+/g, ''),
            mimeType: parsed?.mimeType || inlineData?.mimeType || inlineData?.mime_type || item.mime_type || item.mimeType || 'image/png'
        };
    }
    if (item.text) return normalizeImageItem(item.text);

    for (const key of ['images', 'image', 'data', 'output', 'result', 'content', 'parts']) {
        if (item[key] && item[key] !== item) {
            const normalized = normalizeImageItem(item[key]);
            if (normalized) return normalized;
        }
    }

    return null;
}

function collectImages(raw) {
    const choices = normalizeInputArray(raw?.choices);
    const choiceContent = choices.flatMap(choice => [
        choice?.message?.content,
        choice?.message?.images,
        choice?.message?.image,
        choice?.delta?.content
    ]);
    const geminiParts = normalizeInputArray(raw?.candidates)
        .flatMap(candidate => [
            candidate?.content?.parts,
            candidate?.parts
        ]);
    const candidates = [
        choiceContent,
        geminiParts,
        raw?.data,
        raw?.images,
        raw?.image,
        raw?.url,
        raw?.image_url,
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

function dataUriFromBuffer(buffer, mimeType = 'image/png') {
    return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function fetchReferenceImageAsDataUri(reference, context = {}) {
    const downloaded = await safeFetchImageUrl(reference, {
        timeoutMs: context.timeoutMs
    });
    return dataUriFromBuffer(downloaded.buffer, downloaded.contentType);
}

async function resolveReferenceImageToDataUri(reference, user, context = {}) {
    if (typeof reference !== 'string' || !reference.trim()) return null;
    const cleanReference = reference.trim();
    if (cleanReference.startsWith('data:image/')) return cleanReference;

    const isLibraryReference = cleanReference.startsWith('/library/') || /^https?:\/\/[^/]+\/library\//i.test(cleanReference);
    if (isLibraryReference) {
        const dataUri = resolveImageToBase64(cleanReference, user);
        if (!dataUri) {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PARAM_ERROR,
                provider: NEWAPI_PROVIDER,
                model: context.model,
                message: 'NewAPI reference image could not be resolved from the local library URL.',
                raw: {
                    referencePreview: cleanReference.slice(0, 160)
                }
            });
        }
        return dataUri;
    }

    if (/^https?:\/\//i.test(cleanReference)) {
        return await fetchReferenceImageAsDataUri(cleanReference, context);
    }

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: NEWAPI_PROVIDER,
        model: context.model,
        message: 'NewAPI reference image must be a /library URL, http(s) URL, or data:image base64 URI.'
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

function buildChatContent(prompt, imageUrls) {
    if (imageUrls.length === 0) return prompt;
    return [
        { type: 'text', text: prompt },
        ...imageUrls.map(url => ({
            type: 'image_url',
            image_url: { url }
        }))
    ];
}

export function normalizeNewapiImageResponse(raw, context = {}) {
    const images = collectImages(raw);
    if (images.length === 0) {
        console.error('[NewAPI][empty image result]', {
            model: context.model || raw?.model || DEFAULT_IMAGE_MODEL,
            preview: safeJsonPreview(raw)
        });
        throw new AiProviderError({
            type: AI_ERROR_TYPES.EMPTY_RESULT,
            provider: NEWAPI_PROVIDER,
            model: context.model || raw?.model || DEFAULT_IMAGE_MODEL,
            message: 'NEWAPI_EMPTY_RESULT: NewAPI image response did not include a usable image URL or base64 image.',
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
        provider: NEWAPI_PROVIDER,
        model: context.model,
        raw: error?.raw || context.raw
    });

    return new AiProviderError({
        type: classifyNewapiErrorType(classified.message || error?.message) || classified.type,
        provider: NEWAPI_PROVIDER,
        model: context.model || classified.model,
        message: classified.message,
        cause: error,
        raw: classified.raw
    });
}

export async function submitImageTask(input = {}, options = {}) {
    const config = options.config || getAiProviderConfig();
    const newapiConfig = getNewapiRuntimeConfig(config);
    const baseUrl = newapiConfig.baseUrl || DEFAULT_BASE_URL;
    const apiKey = newapiConfig.apiKey;
    const model = input.model || newapiConfig.imageModel || DEFAULT_IMAGE_MODEL;

    if (!baseUrl) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: NEWAPI_PROVIDER,
            model,
            message: 'NewAPI image provider is not configured. Add NEWAPI_BASE_URL to .env.'
        });
    }
    if (!apiKey) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: NEWAPI_PROVIDER,
            model,
            message: 'NewAPI image provider is not configured. Add NEWAPI_API_KEY to .env.'
        });
    }

    const timeoutMs = parsePositiveInteger(newapiConfig.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const size = input.size || input.aspectRatio || 'auto';
    const resolution = input.resolution || 'auto';
    const imageUrls = await normalizeReferenceImages(input.imageUrls || input.image_urls || input.referenceImages, options.user, {
        model,
        timeoutMs
    });
    const prompt = buildPromptWithOutputHints(input.prompt || '', { size, resolution });
    const requestBody = {
        model,
        messages: [
            {
                role: 'user',
                content: buildChatContent(prompt, imageUrls)
            }
        ],
        stream: false
    };
    const requestUrl = buildNewapiChatCompletionsUrl(baseUrl);

    console.log('[NewAPI][image submit]', {
        requestUrl,
        model,
        referenceCount: imageUrls.length
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
    const normalized = normalizeNewapiImageResponse(raw, { model });

    console.log('[NewAPI][image response]', {
        requestUrl,
        model,
        responseId: raw?.id || null,
        imageCount: normalized.images.length,
        hasUsage: Boolean(raw?.usage)
    });

    return {
        provider: NEWAPI_PROVIDER,
        model,
        taskId: raw?.id || raw?.created ? `newapi:${raw.id || raw.created}` : null,
        status: 'completed',
        rawStatus: 'completed',
        progress: 100,
        images: normalized.images,
        raw,
        usage: raw?.usage,
        request: {
            endpoint: '/chat/completions',
            requestUrl,
            referenceCount: imageUrls.length
        }
    };
}

export async function pollImageTask(providerTaskId, options = {}) {
    const config = options.config || getAiProviderConfig();
    const newapiConfig = getNewapiRuntimeConfig(config);
    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: NEWAPI_PROVIDER,
        model: options.model || newapiConfig.imageModel || DEFAULT_IMAGE_MODEL,
        message: `NewAPI provider does not support polling provider task ${providerTaskId || ''}.`
    });
}

export async function generateImage(input = {}, options = {}) {
    return await submitImageTask(input, options);
}
