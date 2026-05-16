import { getAiProviderConfig, isApimartImageConfigured, isDatalerImageConfigured, isPikachuImageConfigured } from '../../services/ai/aiProviderConfig.js';
import { AI_ERROR_TYPES, classifyProviderError } from '../../services/ai/errors.js';
import { getImageModelConfig, getImageProviders } from '../../services/ai/modelRegistry.js';
import {
    normalizeImageResult,
    normalizeProviderError,
    normalizeResolution,
    pollImageTask,
    submitImageTask
} from '../../services/ai/providers/apimartProvider.js';
import {
    normalizeDatalerImageResponse,
    normalizeProviderError as normalizeDatalerProviderError,
    submitImageTask as submitDatalerImageTask
} from '../../services/ai/providers/datalerProvider.js';
import {
    normalizeImageResult as normalizePikachuImageResult,
    normalizeProviderError as normalizePikachuProviderError,
    submitImageTask as submitPikachuImageTask
} from '../../services/ai/providers/pikachuProvider.js';
import {
    addTaskEvent,
    markTaskCompleted,
    markTaskFailed,
    markTaskPolling,
    recordProviderPollError,
    recordProviderPolling,
    updateTaskProgress
} from '../taskStore.js';
import { saveGeneratedImage } from '../../utils/saveGeneratedImage.js';

const RECOVERABLE_POLL_ERROR_TYPES = new Set([
    AI_ERROR_TYPES.NETWORK_ERROR,
    AI_ERROR_TYPES.TIMEOUT,
    AI_ERROR_TYPES.RATE_LIMIT,
    AI_ERROR_TYPES.NO_CHANNEL
]);

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

function getTaskInput(task) {
    return task.input && typeof task.input === 'object' ? task.input : {};
}

function getFirstImageResultUrl(images) {
    const image = images?.[0];
    if (!image) return null;
    if (image.url) return image.url;
    if (image.base64) {
        const mimeType = image.mimeType || 'image/png';
        return `data:${mimeType};base64,${image.base64}`;
    }
    return null;
}

function getTaskUser(task) {
    return {
        id: task.userId,
        username: task.username
    };
}

async function completeImageTaskWithResult(task, imageResult, details) {
    const providerResultUrl = getFirstImageResultUrl(imageResult.images);
    if (!providerResultUrl) {
        throw new Error('Image provider task completed without a usable image URL.');
    }

    const providerTaskId = details.providerTaskId || task.providerTaskId || null;
    const providerRemoteUrl = providerResultUrl.startsWith('data:') ? null : providerResultUrl;
    const output = {
        provider: details.provider,
        model: details.model,
        images: sanitizeImagesForOutput(imageResult.images),
        rawStatus: details.rawStatus,
        progress: details.progress,
        providerTaskId,
        providerRemoteUrl,
        usage: details.usage || undefined,
        raw: details.raw ? sanitizeRawForOutput(details.raw) : undefined
    };

    try {
        const saved = await saveGeneratedImage({
            user: getTaskUser(task),
            imageResult,
            prompt: task.prompt,
            model: task.model,
            provider: details.provider,
            providerTaskId,
            taskId: task.taskId,
            nodeId: task.nodeId,
            workflowId: task.workflowId,
            metadataId: task.nodeId || task.taskId,
            remoteUrl: providerRemoteUrl || undefined
        });

        return await markTaskCompleted(task.taskId, saved.resultUrl, {
            ...output,
            localResultUrl: saved.resultUrl,
            localFilename: saved.filename
        });
    } catch (error) {
        await addTaskEvent(
            task.taskId,
            'local_save_failed',
            'Local save failed; using provider remote URL fallback',
            {
                errorMessage: error?.message || 'Local save failed',
                providerRemoteUrl
            }
        );

        return await markTaskCompleted(task.taskId, providerResultUrl, {
            ...output,
            localSaveError: error?.message || 'Local save failed'
        });
    }
}

function sanitizeImagesForOutput(images = []) {
    return images.map(image => {
        if (image?.url) {
            return {
                url: image.url,
                mimeType: image.mimeType || null
            };
        }

        if (image?.base64) {
            return {
                hasBase64: true,
                mimeType: image.mimeType || 'image/png'
            };
        }

        return image;
    });
}

function sanitizeRawForOutput(value, depth = 0) {
    if (depth > 4) return '[omitted nested raw]';
    if (typeof value === 'string') {
        if (value.startsWith('data:') || value.length > 2000) return '[omitted long string]';
        return value;
    }
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => sanitizeRawForOutput(item, depth + 1));

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
            const normalizedKey = key.toLowerCase();
            if (['base64', 'b64_json', 'image_base64', 'imagebase64'].includes(normalizedKey)) {
                return [key, '[omitted base64]'];
            }
            return [key, sanitizeRawForOutput(item, depth + 1)];
        })
    );
}

function getTaskProviderConfig(task) {
    const modelConfig = getImageModelConfig(task.model);
    const providers = getImageProviders(task.model);
    const providerConfig = providers.find(provider => provider.provider === task.provider) || providers[0];

    if (!modelConfig || !providerConfig) {
        throw new Error(`Image model unavailable for task worker: ${task.model}`);
    }

    return { modelConfig, providerConfig };
}

function buildApimartInput(task, config, providerConfig, modelConfig) {
    const input = getTaskInput(task);
    const imageUrls = normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean);
    const resolution = normalizeResolution(
        providerConfig.upstreamModel,
        input.resolution || modelConfig.defaultResolution || config.apimart.imageResolution
    );

    return {
        prompt: input.prompt || task.prompt || '',
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        size: input.aspectRatio || input.size || config.apimart.imageSize,
        resolution,
        model: providerConfig.upstreamModel
    };
}

function buildPikachuInput(task, config, providerConfig, modelConfig) {
    const input = getTaskInput(task);
    const referenceImages = normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean);

    return {
        prompt: input.prompt || task.prompt || '',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        size: input.aspectRatio || input.size || '1024x1024',
        resolution: input.resolution || modelConfig.defaultResolution || config.pikachu.imageQuality,
        model: providerConfig.upstreamModel
    };
}

function buildDatalerInput(task, config, providerConfig, modelConfig) {
    const input = getTaskInput(task);
    const imageUrls = normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean);

    return {
        prompt: input.prompt || task.prompt || '',
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        size: input.aspectRatio || input.size || config.dataler.imageSize,
        resolution: input.resolution || modelConfig.defaultResolution || config.dataler.imageResolution,
        model: providerConfig.upstreamModel
    };
}

function normalizeWorkerError(error, providerConfig = null) {
    let normalized;
    if (providerConfig?.provider === 'apimart') {
        normalized = normalizeProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 'dataler') {
        normalized = normalizeDatalerProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 'pikachu') {
        normalized = normalizePikachuProviderError(error, { model: providerConfig.upstreamModel });
    } else {
        normalized = classifyProviderError(error, {
            provider: providerConfig?.provider,
            model: providerConfig?.upstreamModel
        });
    }

    return {
        type: normalized.type || AI_ERROR_TYPES.PROVIDER_ERROR,
        message: normalized.message || 'Image task failed'
    };
}

function isTransientProviderMessage(message = '') {
    const text = String(message).toLowerCase();
    return (
        text.includes('500') ||
        text.includes('502') ||
        text.includes('503') ||
        text.includes('504') ||
        text.includes('fetch failed') ||
        text.includes('network') ||
        text.includes('timeout') ||
        text.includes('timed out') ||
        text.includes('temporarily') ||
        text.includes('temporary') ||
        text.includes('service unavailable') ||
        text.includes('bad gateway') ||
        text.includes('gateway timeout') ||
        text.includes('upstream')
    );
}

function isRecoverablePollError(normalizedError) {
    if (RECOVERABLE_POLL_ERROR_TYPES.has(normalizedError.type)) {
        return true;
    }

    return normalizedError.type === AI_ERROR_TYPES.PROVIDER_ERROR &&
        isTransientProviderMessage(normalizedError.message);
}

export async function executeImageTask(task, options = {}) {
    let providerConfig = null;

    try {
        const config = options.config || getAiProviderConfig();
        const resolved = getTaskProviderConfig(task);
        providerConfig = resolved.providerConfig;

        if (providerConfig.provider === 'apimart' && !isApimartImageConfigured(config)) {
            throw new Error('APIMart image provider is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.');
        }
        if (providerConfig.provider === 'dataler' && !isDatalerImageConfigured(config)) {
            throw new Error('Dataler image provider is not configured. Add DATALER_API_BASE_URL and DATALER_API_KEY to .env.');
        }
        if (providerConfig.provider === 'pikachu' && !isPikachuImageConfigured(config)) {
            throw new Error('Pikachu image provider is not configured. Add PIKACHU_BASE_URL and PIKACHU_API_KEY to .env.');
        }

        if (providerConfig.provider === 'dataler') {
            const providerInput = buildDatalerInput(task, config, providerConfig, resolved.modelConfig);
            const submitResult = await submitDatalerImageTask(providerInput, {
                config,
                user: getTaskUser(task)
            });

            if (submitResult.status !== 'completed') {
                throw new Error(submitResult.error || 'Dataler image task did not complete.');
            }

            const normalizedResult = normalizeDatalerImageResponse(submitResult);
            return await completeImageTaskWithResult(task, normalizedResult, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                usage: submitResult.usage || null,
                raw: submitResult.raw || null
            });
        }

        if (providerConfig.provider === 'pikachu') {
            const providerInput = buildPikachuInput(task, config, providerConfig, resolved.modelConfig);
            const submitResult = await submitPikachuImageTask(providerInput, {
                config,
                user: getTaskUser(task)
            });

            if (submitResult.status !== 'completed') {
                throw new Error(submitResult.error || 'Pikachu image task did not complete.');
            }

            const normalizedResult = normalizePikachuImageResult(submitResult);
            return await completeImageTaskWithResult(task, normalizedResult, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                usage: submitResult.usage || null,
                raw: submitResult.raw || null
            });
        }

        if (providerConfig.provider !== 'apimart') {
            throw new Error(`Unsupported image task provider: ${providerConfig.provider}`);
        }

        const providerInput = buildApimartInput(task, config, providerConfig, resolved.modelConfig);
        const submitResult = await submitImageTask(providerInput, { config });

        if (submitResult.status === 'completed') {
            return await completeImageTaskWithResult(task, { images: submitResult.images }, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null
            });
        }

        if (!submitResult.taskId) {
            throw new Error(submitResult.error || 'APIMart image task submit did not return task_id.');
        }

        if (submitResult.status === 'failed') {
            throw new Error(submitResult.error || 'APIMart image task submit failed.');
        }

        return await markTaskPolling(task.taskId, submitResult.taskId, {
            provider: submitResult.provider,
            model: submitResult.model,
            rawStatus: submitResult.rawStatus || submitResult.status,
            progress: submitResult.progress ?? null,
            request: submitResult.request || null
        });
    } catch (error) {
        const normalized = normalizeWorkerError(error, providerConfig);
        return await markTaskFailed(task.taskId, normalized.type, normalized.message, {
            phase: 'submit'
        });
    }
}

export async function pollImageTaskStatus(task, options = {}) {
    let providerConfig = null;

    try {
        if (!task.providerTaskId) {
            throw new Error('Polling task is missing provider_task_id.');
        }

        const config = options.config || getAiProviderConfig();
        const resolved = getTaskProviderConfig(task);
        providerConfig = resolved.providerConfig;

        if (providerConfig.provider !== 'apimart') {
            throw new Error(`Provider ${providerConfig.provider} does not support polling.`);
        }

        const pollResult = await pollImageTask(task.providerTaskId, {
            config,
            model: providerConfig.upstreamModel
        });

        await recordProviderPolling(task.taskId, {
            providerTaskId: task.providerTaskId,
            provider: pollResult.provider,
            model: providerConfig.upstreamModel,
            providerStatus: pollResult.rawStatus || pollResult.status,
            progress: pollResult.progress ?? null
        });

        if (pollResult.status === 'completed') {
            const normalizedResult = normalizeImageResult(pollResult.raw);
            return await completeImageTaskWithResult(task, normalizedResult, {
                provider: pollResult.provider,
                model: providerConfig.upstreamModel,
                rawStatus: pollResult.rawStatus || pollResult.status,
                progress: pollResult.progress ?? 100,
                providerTaskId: task.providerTaskId || pollResult.taskId || null
            });
        }

        if (pollResult.status === 'failed') {
            const normalized = normalizeWorkerError(
                new Error(pollResult.error || 'APIMart image task failed.'),
                providerConfig
            );
            return await markTaskFailed(task.taskId, normalized.type, normalized.message, {
                phase: 'poll',
                providerTaskId: task.providerTaskId || null,
                providerStatus: pollResult.rawStatus || pollResult.status
            });
        }

        return await updateTaskProgress(task.taskId, pollResult.progress, {
            provider: pollResult.provider,
            model: providerConfig.upstreamModel,
            rawStatus: pollResult.rawStatus || pollResult.status,
            progress: pollResult.progress ?? null
        });
    } catch (error) {
        const normalized = normalizeWorkerError(error, providerConfig);
        if (task.providerTaskId && isRecoverablePollError(normalized)) {
            await recordProviderPollError(task.taskId, {
                providerTaskId: task.providerTaskId,
                errorType: normalized.type,
                errorMessage: normalized.message
            });
            return task;
        }

        return await markTaskFailed(task.taskId, normalized.type, normalized.message, {
            phase: 'poll',
            providerTaskId: task.providerTaskId || null
        });
    }
}
