import { randomUUID } from 'crypto';
import { getAiProviderConfig, isApimartImageConfigured, isAtlasImageConfigured, isDatalerImageConfigured, isNewapiImageConfigured, isPikachuImageConfigured, isT8ImageConfigured } from './aiProviderConfig.js';
import { AiProviderError, AI_ERROR_TYPES, classifyProviderError } from './errors.js';
import { logAiEvent } from './logger.js';
import { getImageModelConfig, getImageProviders } from './modelRegistry.js';
import {
    generateImage as generateApimartImage,
    imageResultToBuffer,
    normalizeResolution
} from './providers/apimartProvider.js';
import { generateImage as generateDatalerImage } from './providers/datalerProvider.js';
import { generateImage as generatePikachuImage } from './providers/pikachuProvider.js';
import { generateImage as generateAtlasImage } from './providers/atlasProvider.js';
import { generateImage as generateNewapiImage } from './providers/newapiProvider.js';
import { generateImage as generateT8Image } from './providers/t8Provider.js';

function getImageFormat(result) {
    const mimeType = result?.images?.[0]?.mimeType || '';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    if (mimeType.includes('webp')) return 'webp';
    return 'png';
}

async function runApimartProvider(input, providerConfig, modelConfig, config) {
    if (!isApimartImageConfigured(config)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: 'apimart',
            model: providerConfig.upstreamModel,
            message: 'APIMart image provider is not configured. Add APIMART_BASE_URL and APIMART_API_KEY to .env.'
        });
    }

    const resolution = normalizeResolution(
        providerConfig.upstreamModel,
        input.resolution || modelConfig.defaultResolution || config.apimart.imageResolution
    );

    return await generateApimartImage({
        prompt: input.prompt,
        imageUrls: input.imageUrls.length > 0 ? input.imageUrls : undefined,
        size: input.size || config.apimart.imageSize,
        resolution,
        model: providerConfig.upstreamModel
    }, { config });
}

async function runPikachuProvider(input, providerConfig, modelConfig, config, options = {}) {
    if (!isPikachuImageConfigured(config)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: 'pikachu',
            model: providerConfig.upstreamModel,
            message: 'Pikachu image provider is not configured. Add PIKACHU_BASE_URL and PIKACHU_API_KEY to .env.'
        });
    }

    return await generatePikachuImage({
        prompt: input.prompt,
        referenceImages: input.imageUrls.length > 0 ? input.imageUrls : undefined,
        size: input.size,
        resolution: input.resolution || modelConfig.defaultResolution || config.pikachu.imageQuality,
        model: providerConfig.upstreamModel
    }, {
        config,
        user: options.user
    });
}

async function runDatalerProvider(input, providerConfig, modelConfig, config, options = {}) {
    if (!isDatalerImageConfigured(config)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: 'dataler',
            model: providerConfig.upstreamModel,
            message: 'Dataler image provider is not configured. Add DATALER_API_BASE_URL and DATALER_API_KEY to .env.'
        });
    }

    return await generateDatalerImage({
        prompt: input.prompt,
        imageUrls: input.imageUrls.length > 0 ? input.imageUrls : undefined,
        size: input.size || config.dataler.imageSize,
        resolution: input.resolution || modelConfig.defaultResolution || config.dataler.imageResolution,
        model: providerConfig.upstreamModel
    }, {
        config,
        user: options.user
    });
}

async function runAtlasProvider(input, providerConfig, modelConfig, config, options = {}) {
    if (!isAtlasImageConfigured(config)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: 'atlas',
            model: providerConfig.upstreamModel,
            message: 'Atlas image provider is not configured. Add ATLAS_BASE_URL and ATLAS_API_KEY to .env, or configure a team provider credential.'
        });
    }

    return await generateAtlasImage({
        prompt: input.prompt,
        imageUrls: input.imageUrls.length > 0 ? input.imageUrls : undefined,
        size: input.size,
        resolution: input.resolution || modelConfig.defaultResolution,
        model: providerConfig.upstreamModel
    }, {
        config,
        user: options.user
    });
}

async function runNewapiProvider(input, providerConfig, modelConfig, config, options = {}) {
    if (!isNewapiImageConfigured(config)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: 'newapi',
            model: providerConfig.upstreamModel,
            message: 'NewAPI image provider is not configured. Add NEWAPI_BASE_URL and NEWAPI_API_KEY to .env.'
        });
    }

    return await generateNewapiImage({
        prompt: input.prompt,
        imageUrls: input.imageUrls.length > 0 ? input.imageUrls : undefined,
        size: input.size,
        resolution: input.resolution || modelConfig.defaultResolution,
        model: providerConfig.upstreamModel
    }, {
        config,
        user: options.user
    });
}

async function runT8Provider(input, providerConfig, modelConfig, config, options = {}) {
    if (!isT8ImageConfigured(config)) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.AUTH_ERROR,
            provider: 't8',
            model: providerConfig.upstreamModel,
            message: 'T8 image provider is not configured. Add T8_BASE_URL and T8_API_KEY to .env.'
        });
    }

    return await generateT8Image({
        prompt: input.prompt,
        imageUrls: input.imageUrls.length > 0 ? input.imageUrls : undefined,
        size: input.size,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution || modelConfig.defaultResolution,
        imageSize: input.imageSize || input.resolution || modelConfig.defaultResolution,
        quality: input.quality,
        model: providerConfig.upstreamModel
    }, {
        config,
        user: options.user
    });
}

async function runImageProvider(input, providerConfig, modelConfig, config, options = {}) {
    if (providerConfig.provider === 'apimart') {
        return await runApimartProvider(input, providerConfig, modelConfig, config);
    }
    if (providerConfig.provider === 'dataler') {
        return await runDatalerProvider(input, providerConfig, modelConfig, config, options);
    }
    if (providerConfig.provider === 'pikachu') {
        return await runPikachuProvider(input, providerConfig, modelConfig, config, options);
    }
    if (providerConfig.provider === 'atlas') {
        return await runAtlasProvider(input, providerConfig, modelConfig, config, options);
    }
    if (providerConfig.provider === 'newapi') {
        return await runNewapiProvider(input, providerConfig, modelConfig, config, options);
    }
    if (providerConfig.provider === 't8') {
        return await runT8Provider(input, providerConfig, modelConfig, config, options);
    }

    throw new AiProviderError({
        type: AI_ERROR_TYPES.PARAM_ERROR,
        provider: providerConfig.provider,
        model: providerConfig.upstreamModel,
        message: `Unsupported image provider: ${providerConfig.provider}`
    });
}

async function generateImage(input = {}, options = {}) {
    const startedAt = Date.now();
    const requestId = input.requestId || randomUUID();
    const projectModelId = input.projectModelId || input.imageModel;
    const nodeId = input.nodeId;
    const modelConfig = getImageModelConfig(projectModelId);
    const providerConfigs = getImageProviders(projectModelId);

    if (!modelConfig || providerConfigs.length === 0) {
        throw new AiProviderError({
            type: AI_ERROR_TYPES.PARAM_ERROR,
            provider: 'ai-router',
            model: projectModelId,
            message: `Image model unavailable: ${projectModelId}`
        });
    }

    const config = options.config || getAiProviderConfig();
    const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
    const routerInput = {
        ...input,
        imageUrls,
        size: input.size || config.apimart.imageSize
    };

    logAiEvent({
        event: 'image_generation_start',
        requestId,
        nodeId,
        projectModelId,
        status: 'submitted'
    });

    const providerConfig = providerConfigs[0];

    try {
        logAiEvent({
            event: 'image_generation_provider_start',
            requestId,
            nodeId,
            provider: providerConfig.provider,
            projectModelId,
            upstreamModel: providerConfig.upstreamModel,
            status: 'submitted'
        });

        const providerResult = await runImageProvider(routerInput, providerConfig, modelConfig, config, options);
        if (providerResult.status !== 'completed') {
            throw new AiProviderError({
                type: AI_ERROR_TYPES.PROVIDER_ERROR,
                provider: providerConfig.provider,
                model: providerConfig.upstreamModel,
                message: providerResult.error || `${providerConfig.provider} image generation failed.`,
                raw: providerResult
            });
        }

        const imageBuffer = await imageResultToBuffer(providerResult);
        const durationMs = Date.now() - startedAt;

        logAiEvent({
            event: 'image_generation_completed',
            requestId,
            nodeId,
            provider: providerConfig.provider,
            projectModelId,
            upstreamModel: providerConfig.upstreamModel,
            taskId: providerResult.taskId,
            status: providerResult.status,
            durationMs
        });

        return {
            ...providerResult,
            requestId,
            provider: providerConfig.provider,
            projectModelId,
            upstreamModel: providerConfig.upstreamModel,
            imageBuffer,
            imageFormat: getImageFormat(providerResult),
            durationMs
        };
    } catch (error) {
        const classifiedError = classifyProviderError(error, {
            provider: providerConfig.provider,
            model: providerConfig.upstreamModel,
            raw: error?.raw
        });
        const durationMs = Date.now() - startedAt;

        logAiEvent({
            event: 'image_generation_failed',
            requestId,
            nodeId,
            provider: providerConfig.provider,
            projectModelId,
            upstreamModel: providerConfig.upstreamModel,
            status: 'failed',
            durationMs,
            errorType: classifiedError.type,
            errorMessage: classifiedError.message
        });

        throw classifiedError;
    }
}

export const aiRouter = {
    generateImage
};

export { generateImage };
