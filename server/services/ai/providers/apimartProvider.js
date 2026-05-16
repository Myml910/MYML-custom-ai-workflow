import { getAiProviderConfig } from '../aiProviderConfig.js';
import { AI_ERROR_TYPES, AiProviderError, classifyProviderError } from '../errors.js';

const GEMINI_FLASH_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const GPT_IMAGE_2_MODEL = 'gpt-image-2';
const APIMART_PROVIDER = 'apimart';
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const PROJECT_IMAGE_MODEL_MAP = new Map([
    ['custom-image-gpt-image-2', GPT_IMAGE_2_MODEL],
    ['custom-image-nano-banana-3-1-flash', GEMINI_FLASH_IMAGE_MODEL]
]);

function isDevelopment() {
    return process.env.NODE_ENV !== 'production';
}

function devLog(message, data = {}) {
    if (!isDevelopment()) return;
    console.log(message, data);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestTimeoutMs(options = {}) {
    return parsePositiveInteger(
        options.requestTimeoutMs ?? process.env.APIMART_REQUEST_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS
    );
}

function createRequestTimeoutError(context, timeoutMs, cause) {
    return new AiProviderError({
        type: AI_ERROR_TYPES.TIMEOUT,
        provider: APIMART_PROVIDER,
        model: context.model,
        message: `APIMart ${context.action} timed out after ${timeoutMs}ms.`,
        cause
    });
}

async function fetchWithTimeout(url, fetchOptions, context = {}) {
    const timeoutMs = context.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
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
            throw createRequestTimeoutError(context, timeoutMs, error);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function normalizeInputArray(input) {
    return Array.isArray(input) ? input : [input];
}

function toResponsesContentPart(part) {
    if (!part) return null;
    if (typeof part === 'string') {
        return { type: 'input_text', text: part };
    }
    if (part.type === 'input_text' || part.type === 'input_image') {
        return part;
    }
    if (part.type === 'text') {
        return { type: 'input_text', text: part.text || '' };
    }
    if (part.type === 'image_url' && part.image_url?.url) {
        return { type: 'input_image', image_url: part.image_url.url };
    }
    return { type: 'input_text', text: JSON.stringify(part) };
}

function toResponsesInput(input) {
    if (typeof input === 'string') {
        return input;
    }

    if (!Array.isArray(input)) {
        return input;
    }

    return input.map(message => {
        if (!message || typeof message !== 'object') {
            return { role: 'user', content: String(message ?? '') };
        }

        if (Array.isArray(message.content)) {
            return {
                ...message,
                content: message.content.map(toResponsesContentPart).filter(Boolean)
            };
        }

        return message;
    });
}

async function parseJsonResponse(response, context) {
    const rawText = await response.text();
    let data = {};

    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
        throw new Error(`APIMart ${context} returned non-JSON response: ${rawText.slice(0, 500)}`);
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.error ||
            data?.message ||
            response.statusText ||
            `HTTP ${response.status}`;

        throw new Error(`APIMart ${context} failed: ${response.status} ${response.statusText} - ${message}`);
    }

    return data;
}

function pickTaskId(data) {
    return (
        data?.task_id ||
        data?.taskId ||
        data?.data?.[0]?.task_id ||
        data?.data?.[0]?.taskId ||
        data?.data?.task_id ||
        data?.data?.taskId
    );
}

function normalizeTaskStatus(data) {
    const rawStatus = (
        data?.status ||
        data?.data?.status ||
        data?.data?.[0]?.status ||
        data?.result?.status ||
        ''
    ).toString().toLowerCase();

    if (['completed', 'complete', 'succeeded', 'success', 'done', 'finished'].includes(rawStatus)) return 'completed';
    if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected', 'timeout'].includes(rawStatus)) return 'failed';
    if (['submitted', 'queued', 'pending'].includes(rawStatus)) return 'submitted';
    return 'running';
}

function getRawTaskStatus(data) {
    return (
        data?.status ||
        data?.data?.status ||
        data?.data?.[0]?.status ||
        data?.result?.status ||
        ''
    ).toString();
}

function getTaskProgress(data) {
    return data?.progress ?? data?.data?.progress ?? data?.data?.[0]?.progress ?? data?.result?.progress;
}

function getTaskErrorMessage(data) {
    return (
        data?.error?.message ||
        data?.data?.error?.message ||
        data?.data?.[0]?.error?.message ||
        data?.error ||
        data?.data?.error ||
        data?.message ||
        data?.fail_reason ||
        data?.data?.fail_reason ||
        ''
    );
}

function getObjectKeys(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
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
            const match = item.match(/^data:([^;]+);base64,(.+)$/);
            return match ? { base64: match[2], mimeType: match[1] } : { url: item };
        }
        return item.startsWith('http') ? { url: item } : { base64: item, mimeType: 'image/png' };
    }

    if (typeof item !== 'object') return null;

    const url = item.url || item.image_url || item.imageUrl || item.image_urls || item.imageUrls || item.result_url || item.resultUrl;
    const base64 = item.b64_json || item.base64 || item.image_base64 || item.imageBase64;

    if (base64) {
        const cleanBase64 = typeof base64 === 'string' && base64.includes(',')
            ? base64.split(',').pop()
            : base64;
        const mimeType = typeof base64 === 'string' && base64.startsWith('data:')
            ? base64.match(/^data:([^;]+);base64,/)?.[1]
            : item.mime_type || item.mimeType || 'image/png';
        return { base64: cleanBase64, mimeType };
    }

    if (url) {
        return normalizeImageItem(url);
    }

    return null;
}

function collectImages(data) {
    const candidates = [
        data?.b64_json,
        data?.base64,
        data?.images,
        data?.image,
        data?.image_url,
        data?.image_urls,
        data?.url,
        data?.output,
        data?.result,
        data?.result?.url,
        data?.result?.image_url,
        data?.result?.image_urls,
        data?.result?.images,
        data?.result?.[0],
        data?.data,
        data?.data?.result,
        data?.data?.result?.url,
        data?.data?.result?.image_url,
        data?.data?.result?.image_urls,
        data?.data?.result?.images,
        data?.data?.result?.[0],
        data?.data?.output,
        data?.data?.[0],
        data?.data?.[0]?.url,
        data?.data?.[0]?.image_url,
        data?.data?.[0]?.image_urls,
        data?.data?.[0]?.result,
        data?.data?.[0]?.result?.images,
        data?.data?.[0]?.output,
        data
    ];

    const images = [];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const items = Array.isArray(candidate) ? candidate : [candidate];
        for (const item of items) {
            const normalized = normalizeImageItem(item);
            if (normalized) images.push(normalized);

            if (item && typeof item === 'object') {
                for (const key of ['images', 'image_url', 'image_urls', 'url', 'output', 'result', 'data', 'content', 'b64_json', 'base64']) {
                    if (item[key] && item[key] !== item) {
                        const nested = Array.isArray(item[key]) ? item[key] : [item[key]];
                        for (const nestedItem of nested) {
                            const nestedImage = normalizeImageItem(nestedItem);
                            if (nestedImage) images.push(nestedImage);
                        }
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

function extractContentText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';

    return content
        .map(part => {
            if (typeof part === 'string') return part;
            if (!part || typeof part !== 'object') return '';
            if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
                return part.text || part.output_text || part.input_text || '';
            }
            return part.text || part.output_text || '';
        })
        .join('')
        .trim();
}

function extractChoicesText(data) {
    const choices = Array.isArray(data?.choices) ? data.choices : [];
    const choiceContent = choices[0]?.message?.content;
    return extractContentText(choiceContent);
}

function extractOutputText(data) {
    if (typeof data?.output_text === 'string') {
        return data.output_text.trim();
    }

    const outputItems = Array.isArray(data?.output) ? data.output : [];
    const content = outputItems.flatMap(item => normalizeInputArray(item?.content)).filter(Boolean);
    return extractContentText(content);
}

function getImageModelLimits(model) {
    if (model === GEMINI_FLASH_IMAGE_MODEL) {
        return { maxReferenceImages: 14 };
    }
    if (model === GPT_IMAGE_2_MODEL) {
        return { maxReferenceImages: 16 };
    }
    return { maxReferenceImages: 14 };
}

export function normalizeResolution(model, resolution) {
    const value = String(resolution || '').trim();
    if (!value || value.toLowerCase() === 'auto') {
        return model === GPT_IMAGE_2_MODEL ? '2k' : '2K';
    }

    const normalized = value.toLowerCase();
    if (['1k', '2k', '4k'].includes(normalized)) {
        return model === GPT_IMAGE_2_MODEL ? normalized : normalized.toUpperCase();
    }

    return value;
}

export function resolveApimartImageModel(projectModelId, fallbackModel) {
    if (!projectModelId) {
        return fallbackModel || GEMINI_FLASH_IMAGE_MODEL;
    }

    const mappedModel = PROJECT_IMAGE_MODEL_MAP.get(projectModelId);
    if (mappedModel) {
        return mappedModel;
    }

    throw new Error(`Unsupported APIMart image project model: ${projectModelId}`);
}

function createImageGenerationRequestBody(input, config) {
    const { imageModel, imageResolution, imageSize } = config.apimart;
    const model = input.model || imageModel;
    const { maxReferenceImages } = getImageModelLimits(model);
    const imageUrls = normalizeInputArray(input.imageUrls || input.image_urls || [])
        .filter(Boolean)
        .slice(0, maxReferenceImages);

    const requestBody = {
        model,
        prompt: input.prompt || '',
        size: input.size || imageSize,
        resolution: normalizeResolution(model, input.resolution || imageResolution),
        n: 1
    };

    if (imageUrls.length > 0) {
        requestBody.image_urls = imageUrls;
    }

    return { model, requestBody, imageUrls };
}

export async function createTextResponse(input, options = {}) {
    const config = options.config || getAiProviderConfig();
    const { baseUrl, apiKey, textModel } = config.apimart;

    if (!baseUrl || !apiKey) {
        throw new Error('APIMart text API is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.');
    }

    const endpoint = `${baseUrl}/responses`;
    const body = {
        model: options.model || textModel,
        input: toResponsesInput(input)
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    return await parseJsonResponse(response, 'responses request');
}

export function extractResponseText(data) {
    const candidates = [
        extractOutputText(data),
        extractChoicesText(data),
        extractOutputText(data?.data),
        extractChoicesText(data?.data)
    ];

    const text = candidates.find(value => typeof value === 'string' && value.trim());
    if (text) return text.trim();

    throw new Error('APIMart text response did not include parsable text content.');
}

export async function submitImageTask(input, options = {}) {
    const config = options.config || getAiProviderConfig();
    const { baseUrl, apiKey } = config.apimart;

    if (!baseUrl || !apiKey) {
        throw new Error('APIMart image API is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.');
    }

    const { model, requestBody, imageUrls } = createImageGenerationRequestBody(input, config);

    const requestTimeoutMs = getRequestTimeoutMs(options);
    const submitResponse = await fetchWithTimeout(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    }, {
        action: 'image generation submit',
        model,
        timeoutMs: requestTimeoutMs
    });

    const submitData = await parseJsonResponse(submitResponse, 'image generation submit');
    const taskId = pickTaskId(submitData);
    const immediateImages = collectImages(submitData);
    const submitStatus = getRawTaskStatus(submitData);
    const submittedAt = new Date().toISOString();

    devLog('[APIMart][image submit]', {
        task_id: taskId,
        code: submitData?.code,
        status: submitStatus || undefined
    });

    if (!taskId && immediateImages.length > 0) {
        return {
            provider: APIMART_PROVIDER,
            model,
            taskId,
            status: 'completed',
            images: immediateImages,
            raw: submitData,
            submittedAt,
            request: {
                size: requestBody.size,
                resolution: requestBody.resolution,
                referenceCount: imageUrls.length
            }
        };
    }

    if (!taskId) {
        return {
            provider: APIMART_PROVIDER,
            model,
            status: 'failed',
            images: [],
            raw: submitData,
            submittedAt,
            error: `APIMart image generation did not return task_id: ${JSON.stringify(submitData).slice(0, 800)}`
        };
    }

    return {
        provider: APIMART_PROVIDER,
        model,
        taskId,
        status: normalizeTaskStatus(submitData),
        rawStatus: submitStatus || undefined,
        progress: getTaskProgress(submitData),
        images: [],
        raw: submitData,
        submittedAt,
        request: {
            size: requestBody.size,
            resolution: requestBody.resolution,
            referenceCount: imageUrls.length
        }
    };
}

export async function pollImageTask(providerTaskId, options = {}) {
    const config = options.config || getAiProviderConfig();
    const { baseUrl, apiKey } = config.apimart;

    if (!baseUrl || !apiKey) {
        throw new Error('APIMart image API is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.');
    }

    const requestTimeoutMs = getRequestTimeoutMs(options);
    const taskResponse = await fetchWithTimeout(`${baseUrl}/tasks/${encodeURIComponent(providerTaskId)}`, {
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    }, {
        action: `task ${providerTaskId} poll`,
        model: options.model,
        timeoutMs: requestTimeoutMs
    });

    const taskData = await parseJsonResponse(taskResponse, `task ${providerTaskId} poll`);
    const status = normalizeTaskStatus(taskData);
    const rawStatus = getRawTaskStatus(taskData) || status;
    const progress = getTaskProgress(taskData);
    const errorMessage = getTaskErrorMessage(taskData);
    const images = status === 'completed' ? collectImages(taskData) : [];

    return {
        provider: APIMART_PROVIDER,
        model: options.model || undefined,
        taskId: providerTaskId,
        status,
        rawStatus,
        progress,
        images,
        raw: taskData,
        error: status === 'failed' ? (errorMessage || 'APIMart image task failed.') : undefined
    };
}

export function normalizeImageResult(raw) {
    const images = collectImages(raw);
    if (images.length === 0) {
        throw new Error('Task completed but no image could be parsed');
    }

    return {
        images
    };
}

export function normalizeProviderError(error, context = {}) {
    return classifyProviderError(error, {
        provider: APIMART_PROVIDER,
        model: context.model,
        raw: error?.raw || context.raw
    });
}

export async function generateImage(input, options = {}) {
    const config = options.config || getAiProviderConfig();
    const { imagePollIntervalMs, imagePollTimeoutMs } = config.apimart;
    const submitResult = await submitImageTask(input, options);
    const model = submitResult.model;

    if (!submitResult.taskId) {
        return submitResult;
    }

    const startedAt = Date.now();
    let lastData = submitResult.raw;
    let lastStatus = submitResult.rawStatus || 'submitted';
    let lastProgress = submitResult.progress;
    let lastErrorMessage = getTaskErrorMessage(submitResult.raw);
    let pollAttempt = 0;

    while (Date.now() - startedAt < imagePollTimeoutMs) {
        await sleep(imagePollIntervalMs);
        pollAttempt++;

        const taskResult = await pollImageTask(submitResult.taskId, { ...options, model });
        const taskData = taskResult.raw;
        lastData = taskData;
        const status = taskResult.status;
        lastStatus = taskResult.rawStatus || status;
        lastProgress = taskResult.progress;
        lastErrorMessage = taskResult.error || getTaskErrorMessage(taskData);

        devLog('[APIMart][image poll]', {
            task_id: submitResult.taskId,
            pollAttempt,
            elapsedMs: Date.now() - startedAt,
            status: lastStatus,
            progress: lastProgress,
            errorMessage: lastErrorMessage || undefined,
            hasResult: Boolean(taskData?.result || taskData?.data?.result || taskData?.data?.[0]?.result)
        });

        if (status === 'completed') {
            const images = taskResult.images;
            if (images.length === 0) {
                devLog('[APIMart][image parse miss]', {
                    task_id: submitResult.taskId,
                    resultKeys: getObjectKeys(taskData?.data?.result || taskData?.result),
                    dataKeys: getObjectKeys(taskData?.data),
                    rootKeys: getObjectKeys(taskData)
                });

                return {
                    provider: APIMART_PROVIDER,
                    model,
                    taskId: submitResult.taskId,
                    status: 'failed',
                    images: [],
                    raw: taskData,
                    error: 'Task completed but no image could be parsed'
                };
            }

            return {
                provider: APIMART_PROVIDER,
                model,
                taskId: submitResult.taskId,
                status,
                images,
                raw: taskData
            };
        }

        if (status === 'failed') {
            const error =
                taskData?.error?.message ||
                taskData?.error ||
                taskData?.message ||
                taskData?.fail_reason ||
                'APIMart image task failed.';

            return {
                provider: APIMART_PROVIDER,
                model,
                taskId: submitResult.taskId,
                status,
                images: [],
                raw: taskData,
                error
            };
        }
    }

    return {
        provider: APIMART_PROVIDER,
        model,
        taskId: submitResult.taskId,
        status: 'failed',
        images: [],
        raw: lastData,
        error: `APIMart image task timed out: task_id=${submitResult.taskId}, lastStatus=${lastStatus || 'unknown'}, lastProgress=${lastProgress ?? 'unknown'}, lastErrorMessage=${lastErrorMessage || 'none'}, elapsedMs=${Date.now() - startedAt}`
    };
}

export async function imageResultToBuffer(result) {
    const image = result?.images?.[0];
    if (!image) {
        throw new Error(result?.error || 'APIMart image result did not include an image.');
    }

    if (image.base64) {
        return Buffer.from(image.base64, 'base64');
    }

    if (image.url) {
        if (image.url.startsWith('data:')) {
            const match = image.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) return Buffer.from(match[2], 'base64');
        }

        const response = await fetch(image.url);
        if (!response.ok) {
            throw new Error(`Failed to download APIMart image result: ${response.status} ${response.statusText}`);
        }
        return Buffer.from(await response.arrayBuffer());
    }

    throw new Error('APIMart image result did not include url or base64 data.');
}
