import { getAiProviderConfig, isApimartImageConfigured, isAtlasImageConfigured, isNewapiImageConfigured, isDatalerImageConfigured, isPikachuImageConfigured, isT8ImageConfigured } from '../../services/ai/aiProviderConfig.js';
import { AI_ERROR_TYPES, classifyProviderError } from '../../services/ai/errors.js';
import {
    PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE,
    resolveProviderRuntimeConfig
} from '../../services/ai/credentialResolver.js';
import { recordProviderUsageLog } from '../../db/providerCredentials.js';
import { getAvailableImageModels, getImageModelConfig, getImageProviders } from '../../services/ai/modelRegistry.js';
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
    normalizeAtlasImageResult,
    normalizeProviderError as normalizeAtlasProviderError,
    pollImageTask as pollAtlasImageTask,
    submitImageTask as submitAtlasImageTask
} from '../../services/ai/providers/atlasProvider.js';
import {
    normalizeNewapiImageResponse,
    normalizeProviderError as normalizeNewapiProviderError,
    submitImageTask as submitNewapiImageTask
} from '../../services/ai/providers/newapiProvider.js';
import {
    normalizeProviderError as normalizeT8ProviderError,
    normalizeT8ImageResponse,
    submitImageTask as submitT8ImageTask
} from '../../services/ai/providers/t8Provider.js';
import { getInternalReferenceConfig } from '../../services/internalReferences/config.js';
import {
    buildCarrierPreservingHiddenReferenceEditPrompt,
    buildPromptWithFixedNegativePrompt
} from '../../services/internalReferences/editPromptBuilder.js';
import { lookupHiddenInternalReferences } from '../../services/internalReferences/lookup.js';
import {
    addTaskEvent,
    heartbeatTask,
    markTaskCompleted,
    markTaskFailed,
    markTaskPolling,
    recordProviderPollError,
    recordProviderPolling,
    updateTaskCredentialContext,
    updateTaskProgress
} from '../taskStore.js';
import { saveGeneratedImage } from '../../utils/saveGeneratedImage.js';

const RECOVERABLE_POLL_ERROR_TYPES = new Set([
    AI_ERROR_TYPES.NETWORK_ERROR,
    AI_ERROR_TYPES.TIMEOUT,
    AI_ERROR_TYPES.RATE_LIMIT,
    AI_ERROR_TYPES.NO_CHANNEL
]);

const DEFAULT_TASK_LEASE_MS = 120000;
const DEFAULT_TASK_HEARTBEAT_MS = 30000;
const DEFAULT_IMAGE_TASK_TIMEOUT_MS = 600000;
const ATLAS_RESULT_SAVE_RETRY_COUNT = 6;
const ATLAS_RESULT_SAVE_RETRY_DELAY_MS = 5000;
const HERMES_DESIGN_TASK_SOURCE = 'hermes_design_task';
const HERMES_DEFAULT_TEXT_MODEL_ID = 'custom-image-t8-nano-banana-3-1-flash';

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTaskElapsedMs(task) {
    const createdAt = task?.createdAt ? new Date(task.createdAt).getTime() : null;
    return Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : 0;
}

function hasTimeForRetry(task, retryDelayMs) {
    const timeoutMs = parsePositiveInteger(process.env.IMAGE_TASK_TIMEOUT_MS, DEFAULT_IMAGE_TASK_TIMEOUT_MS);
    return getTaskElapsedMs(task) + retryDelayMs + 1000 < timeoutMs;
}

function previewUrl(url) {
    if (!url || typeof url !== 'string') return null;

    try {
        const parsed = new URL(url);
        const tail = `${parsed.pathname || ''}${parsed.search || ''}`.slice(-80);
        return {
            host: parsed.host,
            tail
        };
    } catch {
        return {
            tail: String(url).slice(-80)
        };
    }
}

async function addTaskEventSafe(taskId, eventType, message = null, payload = null) {
    try {
        await addTaskEvent(taskId, eventType, message, payload);
    } catch (error) {
        console.warn('[ImageWorker] Failed to write task event:', {
            taskId,
            eventType,
            error: error?.message || error
        });
    }
}

function startTaskHeartbeat(task, options = {}, phase = 'worker') {
    const workerId = options.workerId;
    if (!workerId) {
        return () => {};
    }

    const leaseMs = Math.max(1000, Number(options.leaseMs) || DEFAULT_TASK_LEASE_MS);
    const heartbeatMs = Math.max(1000, Number(options.heartbeatMs) || DEFAULT_TASK_HEARTBEAT_MS);
    let stopped = false;

    const beat = async () => {
        if (stopped) return;
        try {
            await heartbeatTask(task.taskId, workerId, leaseMs, {
                phase,
                provider: task.provider
            });
        } catch (error) {
            console.warn('[ImageWorker] Failed to write task heartbeat:', {
                taskId: task.taskId,
                workerId,
                error: error?.message || error
            });
        }
    };

    const timer = setInterval(() => {
        void beat();
    }, heartbeatMs);

    void beat();

    return () => {
        stopped = true;
        clearInterval(timer);
    };
}

function normalizeInputArray(input) {
    if (!input) return [];
    return Array.isArray(input) ? input : [input];
}

function getTaskInput(task) {
    return task.input && typeof task.input === 'object' ? task.input : {};
}

function isHermesDesignTask(task) {
    return getTaskInput(task).source === HERMES_DESIGN_TASK_SOURCE;
}

function mergeRuntimeHiddenImages(imageUrls, options = {}) {
    const hiddenImages = normalizeInputArray(options.hiddenReferenceImages).filter(Boolean);
    if (hiddenImages.length === 0) return imageUrls;
    return [...imageUrls, ...hiddenImages];
}

function modelSupportsRuntimeReferenceImages(providerConfig, modelConfig) {
    if (!providerConfig || !modelConfig) return false;
    if (providerConfig.isAsync) return false;

    const capabilities = Array.isArray(modelConfig.capabilities) ? modelConfig.capabilities : [];
    return Boolean(
        modelConfig.supportsImageToImage ||
        modelConfig.supportsMultiImage ||
        capabilities.includes('image-to-image') ||
        capabilities.includes('multi-image')
    );
}

function getHiddenReferenceProviderOptions(hiddenReferenceContext, providerConfig, modelConfig, options = {}) {
    if (!hiddenReferenceContext?.enabled) return {};

    const count = hiddenReferenceContext.images?.length || 0;
    if (count === 0) {
        console.log('[InternalReferences] Hidden reference lookup summary', {
            ...hiddenReferenceContext.summary,
            hiddenReferenceUsage: hiddenReferenceContext.summary.hiddenReferenceUsage || 'not_matched'
        });
        return {};
    }

    if (!options.useImageInput) {
        console.log('[InternalReferences] Hidden reference lookup summary', {
            ...hiddenReferenceContext.summary,
            hiddenReferenceUsage: 'skipped_by_env_disabled',
            provider: providerConfig?.provider || null,
            modelSupportsImageInput: modelSupportsRuntimeReferenceImages(providerConfig, modelConfig)
        });
        return {};
    }

    if (!modelSupportsRuntimeReferenceImages(providerConfig, modelConfig)) {
        console.log('[InternalReferences] Hidden reference lookup summary', {
            ...hiddenReferenceContext.summary,
            hiddenReferenceUsage: 'skipped_by_model_capability',
            provider: providerConfig?.provider || null,
            modelSupportsImageInput: false
        });
        return {};
    }

    console.log('[InternalReferences] Hidden reference lookup summary', {
        ...hiddenReferenceContext.summary,
        hiddenReferenceUsage: 'attached_runtime_only',
        provider: providerConfig?.provider || null,
        modelSupportsImageInput: true
    });

    return {
        hiddenReferenceImages: hiddenReferenceContext.images.map(image => image.dataUri).filter(Boolean),
        promptOverride: options.promptOverride || undefined
    };
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

function withCredentialPayload(payload = {}, credentialContext = null) {
    return {
        ...payload,
        credentialId: credentialContext?.credentialId || null,
        credentialSource: credentialContext?.source || 'env',
        teamId: credentialContext?.teamId || null,
        apiKeyLast4: credentialContext?.apiKeyLast4 || null
    };
}

function getFailureCredentialContext(error, credentialContext = null) {
    return credentialContext || error?.credentialContext || null;
}

async function persistFailureCredentialContext(task, credentialContext = null) {
    if (!credentialContext?.teamId && !credentialContext?.credentialId) return;

    try {
        await updateTaskCredentialContext(task.taskId, credentialContext);
        task.credentialId = credentialContext.credentialId || task.credentialId || null;
        task.teamId = credentialContext.teamId || task.teamId || null;
    } catch (error) {
        console.warn('[ImageWorker] Failed to persist failure credential context:', {
            taskId: task.taskId,
            credentialId: credentialContext.credentialId,
            teamId: credentialContext.teamId,
            error: error?.message || error
        });
    }
}

async function resolveTaskRuntimeConfig(task, providerConfig, baseConfig) {
    const { config: providerRuntimeConfig, credentialContext } = await resolveProviderRuntimeConfig({
        userId: task.userId,
        username: task.username,
        provider: providerConfig.provider,
        baseConfig: baseConfig?.[providerConfig.provider] || {},
        credentialId: task.credentialId || null
    });

    if (credentialContext?.credentialId || credentialContext?.teamId) {
        try {
            await updateTaskCredentialContext(task.taskId, credentialContext);
            task.credentialId = credentialContext.credentialId || task.credentialId || null;
            task.teamId = credentialContext.teamId || task.teamId || null;
        } catch (error) {
            console.warn('[ImageWorker] Failed to persist task credential context:', {
                taskId: task.taskId,
                credentialId: credentialContext.credentialId,
                teamId: credentialContext.teamId,
                error: error?.message || error
            });
        }
    }

    return {
        config: {
            ...baseConfig,
            [providerConfig.provider]: providerRuntimeConfig
        },
        credentialContext
    };
}

async function recordTaskProviderUsage(task, details = {}, status, error = {}) {
    await recordProviderUsageLog({
        taskId: task.taskId,
        userId: task.userId,
        teamId: details.credentialContext?.teamId || task.teamId || null,
        credentialId: details.credentialContext?.credentialId || task.credentialId || null,
        provider: details.provider || task.provider,
        upstreamModel: details.model || null,
        providerTaskId: details.providerTaskId || task.providerTaskId || null,
        requestId: details.requestId || null,
        status,
        errorType: error.errorType || null,
        errorMessage: error.errorMessage || null,
        imageCount: details.imageCount || null,
        durationMs: details.durationMs || null,
        providerCost: details.providerCost || null,
        currency: details.currency || 'USD',
        rawUsage: details.usage || null
    });
}

async function saveGeneratedImageWithAtlasRetry(task, imageResult, saveOptions, providerRemoteUrl) {
    const maxAttempts = ATLAS_RESULT_SAVE_RETRY_COUNT + 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const saved = await saveGeneratedImage(saveOptions);
            return {
                ...saved,
                localSaveAttempts: attempt
            };
        } catch (error) {
            lastError = error;
            const canRetry = attempt < maxAttempts && hasTimeForRetry(task, ATLAS_RESULT_SAVE_RETRY_DELAY_MS);
            const payload = {
                attempt,
                maxAttempts,
                errorMessage: error?.message || 'Local save failed',
                hasProviderRemoteUrl: Boolean(providerRemoteUrl),
                providerRemoteUrlPreview: previewUrl(providerRemoteUrl),
                retryDelayMs: canRetry ? ATLAS_RESULT_SAVE_RETRY_DELAY_MS : 0
            };

            await addTaskEventSafe(
                task.taskId,
                canRetry ? 'result_save_retry' : 'result_save_failed',
                canRetry
                    ? 'Provider result save failed; will retry'
                    : 'Provider result could not be downloaded and saved locally',
                {
                    ...payload,
                    provider: 'atlas'
                }
            );

            await addTaskEventSafe(
                task.taskId,
                canRetry ? 'atlas_result_save_retry' : 'atlas_result_save_failed',
                canRetry
                    ? 'Atlas result save failed; will retry'
                    : 'Atlas result URL could not be downloaded and saved locally',
                payload
            );

            if (!canRetry) break;
            await sleep(ATLAS_RESULT_SAVE_RETRY_DELAY_MS);
        }
    }

    const finalError = lastError instanceof Error
        ? lastError
        : new Error(String(lastError || 'Atlas result URL could not be downloaded and saved locally.'));
    finalError.localSaveAttempts = finalError.localSaveAttempts || maxAttempts;
    throw finalError;
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
        credentialId: details.credentialContext?.credentialId || null,
        credentialSource: details.credentialContext?.source || 'env',
        teamId: details.credentialContext?.teamId || null,
        apiKeyLast4: details.credentialContext?.apiKeyLast4 || null,
        usage: details.usage || undefined,
        raw: details.raw ? sanitizeRawForOutput(details.raw) : undefined
    };

    try {
        const saveOptions = {
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
        };
        const isAtlasProvider = details.provider === 'atlas';
        const saved = isAtlasProvider
            ? await saveGeneratedImageWithAtlasRetry(task, imageResult, saveOptions, providerRemoteUrl)
            : await saveGeneratedImage(saveOptions);

        await addTaskEventSafe(
            task.taskId,
            'result_save_completed',
            'Provider result saved to local library',
            {
                provider: details.provider,
                model: details.model,
                providerTaskId,
                workerId: details.workerId || null,
                localResultUrl: saved.resultUrl,
                localFilename: saved.filename,
                localFileSize: saved.fileSize,
                localSaveAttempts: saved.localSaveAttempts || 1,
                hasProviderRemoteUrl: Boolean(providerRemoteUrl),
                providerRemoteUrlPreview: previewUrl(providerRemoteUrl)
            }
        );

        const completed = await markTaskCompleted(task.taskId, saved.resultUrl, {
            ...output,
            localResultUrl: saved.resultUrl,
            localFilename: saved.filename,
            localFileSize: saved.fileSize,
            localSaveAttempts: saved.localSaveAttempts || 1
        }, {
            workerId: details.workerId || null
        });
        if (!completed) {
            return null;
        }
        await recordTaskProviderUsage(task, {
            ...details,
            imageCount: imageResult.images?.length || 1
        }, 'completed');
        return completed;
    } catch (error) {
        const localSaveAttempts = error?.localSaveAttempts || (details.provider === 'atlas'
            ? ATLAS_RESULT_SAVE_RETRY_COUNT + 1
            : 1);
        const errorMessage = details.provider === 'atlas'
            ? 'Atlas result URL was returned but could not be downloaded and saved locally.'
            : 'Provider result URL was returned but could not be downloaded and saved locally.';
        const failedOutput = {
            ...output,
            localSaveError: error?.message || 'Local save failed',
            localSaveAttempts
        };

        await addTaskEventSafe(
            task.taskId,
            'result_save_failed',
            'Provider result could not be downloaded and saved locally',
            {
                errorMessage: error?.message || 'Local save failed',
                localSaveAttempts,
                provider: details.provider,
                model: details.model,
                providerTaskId,
                workerId: details.workerId || null,
                hasProviderRemoteUrl: Boolean(providerRemoteUrl),
                providerRemoteUrlPreview: previewUrl(providerRemoteUrl)
            }
        );

        const failed = await markTaskFailed(task.taskId, AI_ERROR_TYPES.RESULT_DOWNLOAD_FAILED, errorMessage, {
            errorMessage,
            workerId: details.workerId || null,
            localSaveError: error?.message || 'Local save failed',
            localSaveAttempts,
            hasProviderRemoteUrl: Boolean(providerRemoteUrl),
            providerRemoteUrlPreview: previewUrl(providerRemoteUrl),
            provider: details.provider,
            model: details.model,
            providerTaskId,
            credentialId: details.credentialContext?.credentialId || null,
            credentialSource: details.credentialContext?.source || 'env',
            teamId: details.credentialContext?.teamId || null,
            apiKeyLast4: details.credentialContext?.apiKeyLast4 || null,
            taskOutput: failedOutput
        });
        if (!failed) {
            return null;
        }
        await recordTaskProviderUsage(task, {
            ...details,
            imageCount: imageResult.images?.length || 1
        }, 'failed', {
            errorType: AI_ERROR_TYPES.RESULT_DOWNLOAD_FAILED,
            errorMessage
        });
        return failed;
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

function summarizeProviderConfig(providerConfig) {
    if (!providerConfig) return null;
    return {
        provider: providerConfig.provider,
        enabled: providerConfig.enabled,
        upstreamModel: providerConfig.upstreamModel
    };
}

function summarizeAvailableImageModel(modelId) {
    try {
        const availableModel = getAvailableImageModels().find(model => model.id === modelId);
        if (!availableModel) return null;

        return {
            id: availableModel.id,
            providerChain: availableModel.providerChain,
            enabled: availableModel.enabled,
            capabilities: availableModel.capabilities
        };
    } catch (error) {
        return {
            error: error?.message || 'Failed to read available image models'
        };
    }
}

function warnUnavailableTaskModel(task, modelConfig, providers) {
    console.warn('[ImageWorker] Image model unavailable for task worker diagnostics', {
        taskId: task.taskId || task.id || null,
        taskRecordId: task.id || task.taskId || null,
        model: task.model,
        provider: task.provider || null,
        hasModelConfig: Boolean(modelConfig),
        modelConfigProviders: (modelConfig?.providers || []).map(summarizeProviderConfig),
        enabledProviders: providers.map(summarizeProviderConfig),
        availableModel: summarizeAvailableImageModel(task.model),
        env: {
            ENABLE_ATLAS_PROVIDER: process.env.ENABLE_ATLAS_PROVIDER,
            ENABLE_ATLAS_NANO_BANANA_2: process.env.ENABLE_ATLAS_NANO_BANANA_2
        }
    });
}

function getHiddenReferenceImageCount(hiddenReferenceContext) {
    return hiddenReferenceContext?.images?.length || 0;
}

function getRuntimeImageInputOverride(task, hiddenReferenceContext, hiddenReferenceConfig) {
    if (!hiddenReferenceContext?.enabled || getHiddenReferenceImageCount(hiddenReferenceContext) === 0) {
        return null;
    }
    if (!hiddenReferenceConfig?.useImageInput) {
        return null;
    }

    const overrideModelId = hiddenReferenceConfig.imageModelId;
    if (!overrideModelId) {
        console.warn('[InternalReferences] Runtime image model override skipped', {
            ...hiddenReferenceContext.summary,
            hiddenReferenceUsage: 'skipped_by_missing_override_model'
        });
        return null;
    }

    const overrideTask = {
        ...task,
        model: overrideModelId,
        provider: null
    };

    try {
        const overrideResolved = getTaskProviderConfig(overrideTask);
        if (!modelSupportsRuntimeReferenceImages(overrideResolved.providerConfig, overrideResolved.modelConfig)) {
            console.warn('[InternalReferences] Runtime image model override skipped', {
                ...hiddenReferenceContext.summary,
                hiddenReferenceUsage: 'skipped_by_override_model_capability',
                runtimeImageModelId: overrideModelId,
                provider: overrideResolved.providerConfig?.provider || null
            });
            return null;
        }

        const editPrompt = buildCarrierPreservingHiddenReferenceEditPrompt(task);

        console.log('[InternalReferences] Runtime image model override applied', {
            ...hiddenReferenceContext.summary,
            hiddenReferenceUsage: 'runtime_model_override_applied',
            runtimeModelOverrideApplied: true,
            editPromptMode: 'carrier_preserving_hidden_reference',
            promptLength: editPrompt.length,
            originalImageModelId: task.model || null,
            runtimeImageModelId: overrideModelId,
            provider: overrideResolved.providerConfig?.provider || null
        });

        return {
            task: overrideTask,
            resolved: overrideResolved,
            modelId: overrideModelId,
            editPrompt
        };
    } catch (error) {
        console.warn('[InternalReferences] Runtime image model override skipped', {
            ...hiddenReferenceContext.summary,
            hiddenReferenceUsage: 'skipped_by_override_model_unavailable',
            runtimeImageModelId: overrideModelId,
            errorType: error?.name || 'Error'
        });
        return null;
    }
}

function getRuntimeHermesTextModelOverride(task, hiddenReferenceContext) {
    if (!isHermesDesignTask(task)) {
        return null;
    }

    const hiddenReferenceCount = getHiddenReferenceImageCount(hiddenReferenceContext);
    const overrideTask = {
        ...task,
        model: HERMES_DEFAULT_TEXT_MODEL_ID,
        provider: null
    };

    try {
        const overrideResolved = getTaskProviderConfig(overrideTask);
        const promptOverride = buildPromptWithFixedNegativePrompt(task);

        console.log('[InternalReferences] Hermes design task text model override applied', {
            ...(hiddenReferenceContext?.summary || {}),
            hiddenReferenceMatched: hiddenReferenceCount > 0,
            hiddenReferenceCount,
            hiddenReferenceUsage: 'fallback_text_to_image',
            runtimeModelOverrideApplied: true,
            fallbackTextModelId: HERMES_DEFAULT_TEXT_MODEL_ID,
            originalImageModelId: task.model || null,
            provider: overrideResolved.providerConfig?.provider || null,
            promptLength: promptOverride.length
        });

        return {
            task: overrideTask,
            resolved: overrideResolved,
            modelId: HERMES_DEFAULT_TEXT_MODEL_ID,
            promptOverride
        };
    } catch (error) {
        console.warn('[InternalReferences] Hermes design task text model override skipped', {
            ...(hiddenReferenceContext?.summary || {}),
            hiddenReferenceMatched: hiddenReferenceCount > 0,
            hiddenReferenceCount,
            hiddenReferenceUsage: 'fallback_text_model_unavailable',
            fallbackTextModelId: HERMES_DEFAULT_TEXT_MODEL_ID,
            errorType: error?.name || 'Error'
        });
        return null;
    }
}

function getTaskProviderConfig(task) {
    const modelConfig = getImageModelConfig(task.model);
    const providers = getImageProviders(task.model);
    let providerConfig = task.provider
        ? providers.find(provider => provider.provider === task.provider) || null
        : null;

    if (!providerConfig && modelConfig?.providers?.length && task.provider) {
        providerConfig = modelConfig.providers.find(provider => provider.provider === task.provider && provider.enabled !== false) || null;
        if (providerConfig) {
            console.warn('[ImageWorker] Resolved task provider from model registry metadata after enabled provider chain was empty.', {
                taskId: task.taskId,
                model: task.model,
                provider: task.provider,
                resolvedProvider: providerConfig.provider
            });
        }
    }

    if (!providerConfig && !task.provider && providers.length === 1) {
        const [singleProvider] = providers;
        providerConfig = singleProvider;
        console.warn('[ImageWorker] Resolved missing task provider from sole enabled model provider.', {
            taskId: task.taskId,
            model: task.model,
            resolvedProvider: providerConfig.provider
        });
    }

    if (!providerConfig && !task.provider && providers.length === 0 && modelConfig?.providers?.length === 1) {
        const [singleProvider] = modelConfig.providers;
        if (singleProvider?.enabled !== false) {
            providerConfig = singleProvider;
            console.warn('[ImageWorker] Resolved missing task provider from sole enabled model provider.', {
                taskId: task.taskId,
                model: task.model,
                resolvedProvider: providerConfig.provider
            });
        }
    }

    if (!modelConfig || !providerConfig) {
        warnUnavailableTaskModel(task, modelConfig, providers);
        throw new Error(`Image model unavailable for task worker: ${task.model}`);
    }

    return { modelConfig, providerConfig };
}

function buildApimartInput(task, config, providerConfig, modelConfig, options = {}) {
    const input = getTaskInput(task);
    const imageUrls = mergeRuntimeHiddenImages(
        normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean),
        options
    );
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

function buildPikachuInput(task, config, providerConfig, modelConfig, options = {}) {
    const input = getTaskInput(task);
    const referenceImages = mergeRuntimeHiddenImages(
        normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean),
        options
    );

    return {
        prompt: input.prompt || task.prompt || '',
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        size: input.aspectRatio || input.size || '1024x1024',
        resolution: input.resolution || modelConfig.defaultResolution || config.pikachu.imageQuality,
        model: providerConfig.upstreamModel
    };
}

function buildDatalerInput(task, config, providerConfig, modelConfig, options = {}) {
    const input = getTaskInput(task);
    const imageUrls = mergeRuntimeHiddenImages(
        normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean),
        options
    );

    return {
        prompt: input.prompt || task.prompt || '',
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        size: input.aspectRatio || input.size || config.dataler.imageSize,
        resolution: input.resolution || modelConfig.defaultResolution || config.dataler.imageResolution,
        model: providerConfig.upstreamModel
    };
}

function buildAtlasInput(task, config, providerConfig, modelConfig, options = {}) {
    const input = getTaskInput(task);
    const imageUrls = mergeRuntimeHiddenImages(
        normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean),
        options
    );

    return {
        prompt: input.prompt || task.prompt || '',
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        size: input.aspectRatio || input.size || '1024x1024',
        resolution: input.resolution || modelConfig.defaultResolution || 'medium',
        model: providerConfig.upstreamModel
    };
}

function buildNewapiInput(task, config, providerConfig, modelConfig, options = {}) {
    const input = getTaskInput(task);
    const imageUrls = mergeRuntimeHiddenImages(
        normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean),
        options
    );

    return {
        prompt: input.prompt || task.prompt || '',
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        size: input.aspectRatio || input.size || 'auto',
        resolution: input.resolution || modelConfig.defaultResolution || config.newapi.imageResolution || 'auto',
        model: providerConfig.upstreamModel
    };
}

function buildT8Input(task, config, providerConfig, modelConfig, options = {}) {
    const input = getTaskInput(task);
    const imageUrls = mergeRuntimeHiddenImages(
        normalizeInputArray(input.referenceImages || input.imageUrls).filter(Boolean),
        options
    );
    const aspectRatio = input.aspectRatio || input.size || null;

    return {
        prompt: options.promptOverride || input.prompt || task.prompt || '',
        projectModelId: task.model,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        size: input.size || 'auto',
        aspectRatio,
        resolution: input.resolution || modelConfig.defaultResolution || 'auto',
        imageSize: input.imageSize || input.image_size || input.resolution || modelConfig.defaultResolution,
        quality: input.quality || input.requestedQuality,
        model: providerConfig.upstreamModel
    };
}

function normalizeWorkerError(error, providerConfig = null) {
    if (error?.type === PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE) {
        return {
            type: PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE,
            message: error.message || 'Provider credential is required for this team'
        };
    }

    let normalized;
    if (providerConfig?.provider === 'apimart') {
        normalized = normalizeProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 'dataler') {
        normalized = normalizeDatalerProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 'pikachu') {
        normalized = normalizePikachuProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 'atlas') {
        normalized = normalizeAtlasProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 'newapi') {
        normalized = normalizeNewapiProviderError(error, { model: providerConfig.upstreamModel });
    } else if (providerConfig?.provider === 't8') {
        normalized = normalizeT8ProviderError(error, { model: providerConfig.upstreamModel });
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
    if (task.providerTaskId || task.provider_task_id) {
        try {
            await addTaskEvent(
                task.taskId,
                'task_resume_polling',
                'Task already has provider task id; skipping provider submit',
                {
                    workerId: options.workerId || null,
                    attemptCount: task.attemptCount,
                    provider: task.provider,
                    providerTaskId: task.providerTaskId || task.provider_task_id
                }
            );
        } catch (error) {
            console.warn('[ImageWorker] Failed to write task_resume_polling event:', {
                taskId: task.taskId,
                error: error?.message || error
            });
        }

        return await pollImageTaskStatus(
            {
                ...task,
                providerTaskId: task.providerTaskId || task.provider_task_id,
                status: 'polling'
            },
            options
        );
    }

    let providerConfig = null;
    let credentialContext = null;
    const stopHeartbeat = startTaskHeartbeat(task, options, 'submit');

    try {
        const baseConfig = options.config || getAiProviderConfig();
        const hiddenReferenceConfig = getInternalReferenceConfig();
        const hiddenReferenceContext = await lookupHiddenInternalReferences(task, {
            config: hiddenReferenceConfig
        });
        const imageInputOverride = getRuntimeImageInputOverride(
            task,
            hiddenReferenceContext,
            hiddenReferenceConfig
        );
        const runtimeOverride = imageInputOverride || getRuntimeHermesTextModelOverride(task, hiddenReferenceContext);
        const taskForSubmit = runtimeOverride?.task || task;
        const resolved = runtimeOverride?.resolved || getTaskProviderConfig(taskForSubmit);
        providerConfig = resolved.providerConfig;
        const runtime = await resolveTaskRuntimeConfig(taskForSubmit, providerConfig, baseConfig);
        const config = runtime.config;
        credentialContext = runtime.credentialContext;

        if (providerConfig.provider === 'apimart' && !isApimartImageConfigured(config)) {
            throw new Error('APIMart image provider is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.');
        }
        if (providerConfig.provider === 'dataler' && !isDatalerImageConfigured(config)) {
            throw new Error('Dataler image provider is not configured. Add DATALER_API_BASE_URL and DATALER_API_KEY to .env.');
        }
        if (providerConfig.provider === 'pikachu' && !isPikachuImageConfigured(config)) {
            throw new Error('Pikachu image provider is not configured. Add PIKACHU_BASE_URL and PIKACHU_API_KEY to .env.');
        }
        if (providerConfig.provider === 'atlas' && !isAtlasImageConfigured(config)) {
            throw new Error('Atlas image provider is not configured. Add ATLAS_BASE_URL and ATLAS_API_KEY to .env, or configure a team provider credential.');
        }
        if (providerConfig.provider === 'newapi' && !isNewapiImageConfigured(config)) {
            throw new Error('NewAPI image provider is not configured. Add NEWAPI_BASE_URL and NEWAPI_API_KEY to .env.');
        }
        if (providerConfig.provider === 't8' && !isT8ImageConfigured(config)) {
            throw new Error('T8 image provider is not configured. Add T8_BASE_URL and T8_API_KEY to .env.');
        }

        const providerInputOptions = getHiddenReferenceProviderOptions(
            hiddenReferenceContext,
            providerConfig,
            resolved.modelConfig,
            {
                useImageInput: hiddenReferenceConfig.useImageInput,
                promptOverride: runtimeOverride?.editPrompt || runtimeOverride?.promptOverride || null
            }
        );

        if (providerConfig.provider === 'dataler') {
            const providerInput = buildDatalerInput(taskForSubmit, config, providerConfig, resolved.modelConfig, providerInputOptions);
            const submitResult = await submitDatalerImageTask(providerInput, {
                config,
                user: getTaskUser(taskForSubmit)
            });

            if (submitResult.status !== 'completed') {
                throw new Error(submitResult.error || 'Dataler image task did not complete.');
            }

            const normalizedResult = normalizeDatalerImageResponse(submitResult);
            return await completeImageTaskWithResult(taskForSubmit, normalizedResult, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                usage: submitResult.usage || null,
                raw: submitResult.raw || null,
                workerId: options.workerId || null,
                credentialContext
            });
        }

        if (providerConfig.provider === 'pikachu') {
            const providerInput = buildPikachuInput(taskForSubmit, config, providerConfig, resolved.modelConfig, providerInputOptions);
            const submitResult = await submitPikachuImageTask(providerInput, {
                config,
                user: getTaskUser(taskForSubmit)
            });

            if (submitResult.status !== 'completed') {
                throw new Error(submitResult.error || 'Pikachu image task did not complete.');
            }

            const normalizedResult = normalizePikachuImageResult(submitResult);
            return await completeImageTaskWithResult(taskForSubmit, normalizedResult, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                usage: submitResult.usage || null,
                raw: submitResult.raw || null,
                workerId: options.workerId || null,
                credentialContext
            });
        }

        if (providerConfig.provider === 'atlas') {
            const providerInput = buildAtlasInput(taskForSubmit, config, providerConfig, resolved.modelConfig, providerInputOptions);
            const submitResult = await submitAtlasImageTask(providerInput, {
                config,
                user: getTaskUser(taskForSubmit)
            });

            if (submitResult.status === 'completed') {
                const normalizedResult = normalizeAtlasImageResult(submitResult.raw || submitResult);
                return await completeImageTaskWithResult(taskForSubmit, normalizedResult, {
                    provider: submitResult.provider,
                    model: submitResult.model,
                    rawStatus: submitResult.rawStatus || submitResult.status,
                    progress: submitResult.progress ?? 100,
                    providerTaskId: submitResult.taskId || null,
                    usage: submitResult.usage || null,
                    raw: submitResult.raw || null,
                    workerId: options.workerId || null,
                    credentialContext
                });
            }

            if (submitResult.status === 'failed') {
                throw new Error(submitResult.error || 'Atlas image task submit failed.');
            }

            if (!submitResult.taskId) {
                throw new Error(submitResult.error || 'Atlas image task submit did not return prediction id.');
            }

            return await markTaskPolling(task.taskId, submitResult.taskId, withCredentialPayload({
                workerId: options.workerId || null,
                attemptCount: task.attemptCount,
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? null,
                request: submitResult.request || null
            }, credentialContext));
        }

        if (providerConfig.provider === 'newapi') {
            const providerInput = buildNewapiInput(taskForSubmit, config, providerConfig, resolved.modelConfig, providerInputOptions);
            const submitResult = await submitNewapiImageTask(providerInput, {
                config,
                user: getTaskUser(taskForSubmit)
            });

            if (submitResult.status !== 'completed') {
                throw new Error(submitResult.error || 'NewAPI image task did not complete.');
            }

            const normalizedResult = normalizeNewapiImageResponse(submitResult.raw || submitResult, {
                model: submitResult.model
            });
            return await completeImageTaskWithResult(taskForSubmit, normalizedResult, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                usage: submitResult.usage || null,
                raw: submitResult.raw || null,
                workerId: options.workerId || null,
                credentialContext
            });
        }

        if (providerConfig.provider === 't8') {
            const providerInput = buildT8Input(taskForSubmit, config, providerConfig, resolved.modelConfig, providerInputOptions);
            const submitResult = await submitT8ImageTask(providerInput, {
                config,
                user: getTaskUser(taskForSubmit)
            });

            if (submitResult.status !== 'completed') {
                throw new Error(submitResult.error || 'T8 image task did not complete.');
            }

            const normalizedResult = normalizeT8ImageResponse(submitResult.raw || submitResult, {
                model: submitResult.model
            });
            return await completeImageTaskWithResult(taskForSubmit, normalizedResult, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                usage: submitResult.usage || null,
                raw: submitResult.raw || null,
                workerId: options.workerId || null,
                credentialContext
            });
        }

        if (providerConfig.provider !== 'apimart') {
            throw new Error(`Unsupported image task provider: ${providerConfig.provider}`);
        }

        const providerInput = buildApimartInput(taskForSubmit, config, providerConfig, resolved.modelConfig, providerInputOptions);
        const submitResult = await submitImageTask(providerInput, { config });

        if (submitResult.status === 'completed') {
            return await completeImageTaskWithResult(taskForSubmit, { images: submitResult.images }, {
                provider: submitResult.provider,
                model: submitResult.model,
                rawStatus: submitResult.rawStatus || submitResult.status,
                progress: submitResult.progress ?? 100,
                providerTaskId: submitResult.taskId || null,
                workerId: options.workerId || null,
                credentialContext
            });
        }

        if (!submitResult.taskId) {
            throw new Error(submitResult.error || 'APIMart image task submit did not return task_id.');
        }

        if (submitResult.status === 'failed') {
            throw new Error(submitResult.error || 'APIMart image task submit failed.');
        }

        return await markTaskPolling(task.taskId, submitResult.taskId, withCredentialPayload({
            workerId: options.workerId || null,
            attemptCount: task.attemptCount,
            provider: submitResult.provider,
            model: submitResult.model,
            rawStatus: submitResult.rawStatus || submitResult.status,
            progress: submitResult.progress ?? null,
            request: submitResult.request || null
        }, credentialContext));
    } catch (error) {
        const normalized = normalizeWorkerError(error, providerConfig);
        const failureCredentialContext = getFailureCredentialContext(error, credentialContext);
        await persistFailureCredentialContext(task, failureCredentialContext);
        const failed = await markTaskFailed(task.taskId, normalized.type, normalized.message, withCredentialPayload({
            phase: 'submit',
            workerId: options.workerId || null,
            attemptCount: task.attemptCount,
            provider: providerConfig?.provider || task.provider,
            userId: task.userId || null,
            username: task.username || null
        }, failureCredentialContext));
        if (!failed) {
            return null;
        }
        await recordTaskProviderUsage(task, {
            provider: providerConfig?.provider || task.provider,
            model: providerConfig?.upstreamModel || null,
            credentialContext: failureCredentialContext
        }, 'failed', {
            errorType: normalized.type,
            errorMessage: normalized.message
        });
        return failed;
    } finally {
        stopHeartbeat();
    }
}

export async function pollImageTaskStatus(task, options = {}) {
    let providerConfig = null;
    let credentialContext = null;
    const stopHeartbeat = startTaskHeartbeat(task, options, 'poll');

    try {
        if (!task.providerTaskId) {
            throw new Error('Polling task is missing provider_task_id.');
        }

        const baseConfig = options.config || getAiProviderConfig();
        const resolved = getTaskProviderConfig(task);
        providerConfig = resolved.providerConfig;
        const runtime = await resolveTaskRuntimeConfig(task, providerConfig, baseConfig);
        const config = runtime.config;
        credentialContext = runtime.credentialContext;

        if (!['apimart', 'atlas'].includes(providerConfig.provider)) {
            throw new Error(`Provider ${providerConfig.provider} does not support polling.`);
        }

        const pollResult = providerConfig.provider === 'atlas'
            ? await pollAtlasImageTask(task.providerTaskId, {
                config,
                model: providerConfig.upstreamModel
            })
            : await pollImageTask(task.providerTaskId, {
                config,
                model: providerConfig.upstreamModel
            });

        await recordProviderPolling(task.taskId, withCredentialPayload({
            workerId: options.workerId || null,
            attemptCount: task.attemptCount,
            providerTaskId: task.providerTaskId,
            provider: pollResult.provider,
            model: providerConfig.upstreamModel,
            providerStatus: pollResult.rawStatus || pollResult.status,
            progress: pollResult.progress ?? null
        }, credentialContext));

        if (pollResult.status === 'completed') {
            const normalizedResult = providerConfig.provider === 'atlas'
                ? normalizeAtlasImageResult(pollResult.raw || pollResult)
                : normalizeImageResult(pollResult.raw);
            return await completeImageTaskWithResult(task, normalizedResult, {
                provider: pollResult.provider,
                model: providerConfig.upstreamModel,
                rawStatus: pollResult.rawStatus || pollResult.status,
                progress: pollResult.progress ?? 100,
                providerTaskId: task.providerTaskId || pollResult.taskId || null,
                workerId: options.workerId || null,
                credentialContext
            });
        }

        if (pollResult.status === 'failed') {
            const normalized = normalizeWorkerError(
                new Error(pollResult.error || 'APIMart image task failed.'),
                providerConfig
            );
            const failed = await markTaskFailed(task.taskId, normalized.type, normalized.message, withCredentialPayload({
                phase: 'poll',
                workerId: options.workerId || null,
                attemptCount: task.attemptCount,
                providerTaskId: task.providerTaskId || null,
                providerStatus: pollResult.rawStatus || pollResult.status
            }, credentialContext));
            if (!failed) {
                return null;
            }
            await recordTaskProviderUsage(task, {
                provider: pollResult.provider,
                model: providerConfig.upstreamModel,
                providerTaskId: task.providerTaskId || pollResult.taskId || null,
                credentialContext
            }, 'failed', {
                errorType: normalized.type,
                errorMessage: normalized.message
            });
            return failed;
        }

        return await updateTaskProgress(task.taskId, pollResult.progress, withCredentialPayload({
            workerId: options.workerId || null,
            attemptCount: task.attemptCount,
            provider: pollResult.provider,
            model: providerConfig.upstreamModel,
            rawStatus: pollResult.rawStatus || pollResult.status,
            progress: pollResult.progress ?? null
        }, credentialContext));
    } catch (error) {
        const normalized = normalizeWorkerError(error, providerConfig);
        const failureCredentialContext = getFailureCredentialContext(error, credentialContext);
        await persistFailureCredentialContext(task, failureCredentialContext);
        if (task.providerTaskId && isRecoverablePollError(normalized)) {
            await recordProviderPollError(task.taskId, withCredentialPayload({
                workerId: options.workerId || null,
                attemptCount: task.attemptCount,
                providerTaskId: task.providerTaskId,
                errorType: normalized.type,
                errorMessage: normalized.message
            }, failureCredentialContext));
            return task;
        }

        const failed = await markTaskFailed(task.taskId, normalized.type, normalized.message, withCredentialPayload({
            phase: 'poll',
            workerId: options.workerId || null,
            attemptCount: task.attemptCount,
            providerTaskId: task.providerTaskId || null,
            provider: providerConfig?.provider || task.provider,
            userId: task.userId || null,
            username: task.username || null
        }, failureCredentialContext));
        if (!failed) {
            return null;
        }
        await recordTaskProviderUsage(task, {
            provider: providerConfig?.provider || task.provider,
            model: providerConfig?.upstreamModel || null,
            providerTaskId: task.providerTaskId || null,
            credentialContext: failureCredentialContext
        }, 'failed', {
            errorType: normalized.type,
            errorMessage: normalized.message
        });
        return failed;
    } finally {
        stopHeartbeat();
    }
}
