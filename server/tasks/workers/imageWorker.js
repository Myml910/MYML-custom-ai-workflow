import { getAiProviderConfig, isApimartImageConfigured } from '../../services/ai/aiProviderConfig.js';
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
    markTaskCompleted,
    markTaskFailed,
    markTaskPolling,
    recordProviderPollError,
    recordProviderPolling,
    updateTaskProgress
} from '../taskStore.js';

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

function getApimartProviderConfig(task) {
    const modelConfig = getImageModelConfig(task.model);
    const providerConfig = getImageProviders(task.model).find(provider => provider.provider === 'apimart');

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

function normalizeWorkerError(error, providerConfig = null) {
    const normalized = providerConfig?.provider === 'apimart'
        ? normalizeProviderError(error, { model: providerConfig.upstreamModel })
        : classifyProviderError(error, {
            provider: providerConfig?.provider,
            model: providerConfig?.upstreamModel
        });

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
        const resolved = getApimartProviderConfig(task);
        providerConfig = resolved.providerConfig;

        if (!isApimartImageConfigured(config)) {
            throw new Error('APIMart image provider is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.');
        }

        const providerInput = buildApimartInput(task, config, providerConfig, resolved.modelConfig);
        const submitResult = await submitImageTask(providerInput, { config });

        if (submitResult.status === 'completed') {
            const resultUrl = getFirstImageResultUrl(submitResult.images);
            if (!resultUrl) {
                throw new Error('APIMart image task completed without a usable image URL.');
            }

            return await markTaskCompleted(task.taskId, resultUrl, {
                provider: submitResult.provider,
                model: submitResult.model,
                images: sanitizeImagesForOutput(submitResult.images),
                rawStatus: submitResult.rawStatus || submitResult.status
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
        const resolved = getApimartProviderConfig(task);
        providerConfig = resolved.providerConfig;
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
            const resultUrl = getFirstImageResultUrl(normalizedResult.images);
            if (!resultUrl) {
                throw new Error('APIMart image task completed without a usable image URL.');
            }

            return await markTaskCompleted(task.taskId, resultUrl, {
                provider: pollResult.provider,
                model: providerConfig.upstreamModel,
                images: sanitizeImagesForOutput(normalizedResult.images),
                rawStatus: pollResult.rawStatus || pollResult.status,
                progress: pollResult.progress ?? 100
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
