import express from 'express';
import { cancelTask, createTask, getLatestTaskByNodeId, getTaskById } from '../db/tasks.js';
import { getAiProviderConfig } from '../services/ai/aiProviderConfig.js';
import {
    PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE,
    resolveProviderRuntimeConfig
} from '../services/ai/credentialResolver.js';
import { getImageProviders, getSupportedImageModelIds } from '../services/ai/modelRegistry.js';

const router = express.Router();
const SUPPORTED_IMAGE_MODELS = new Set(getSupportedImageModelIds());
const SUPPORTED_IMAGE_QUALITIES = new Set(['auto', 'low', 'medium', 'high']);

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeReferenceImages(referenceImages) {
    if (!referenceImages) return null;
    return Array.isArray(referenceImages) ? referenceImages : [referenceImages];
}

function normalizeStringArray(value, limit = 20) {
    const values = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
    return values
        .map(item => normalizeString(item))
        .filter(Boolean)
        .slice(0, limit);
}

function normalizeImageQuality(quality) {
    const normalized = normalizeString(quality).toLowerCase();
    if (!normalized) return null;
    return SUPPORTED_IMAGE_QUALITIES.has(normalized) ? normalized : undefined;
}

function getCredentialErrorResponse(error) {
    if (error?.type !== PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE) return null;

    return {
        status: 403,
        body: {
            error: error.message || 'Provider credential is required for this account.',
            type: error.type,
            provider: error.provider || null,
            teamId: error.teamId || null,
            credentialId: error.credentialId || null,
            reason: error.reason || null
        }
    };
}

async function resolveImageTaskCredentialContext(req, providerConfig) {
    const aiProviderConfig = getAiProviderConfig(process.env, req.app.locals);
    const runtime = await resolveProviderRuntimeConfig({
        userId: req.user.id,
        username: req.user.username,
        provider: providerConfig.provider,
        baseConfig: aiProviderConfig?.[providerConfig.provider] || {},
        credentialId: null
    });

    return runtime.credentialContext || null;
}

router.post('/image', async (req, res) => {
    try {
        const nodeId = normalizeString(req.body.nodeId);
        const workflowId = normalizeString(req.body.workflowId) || null;
        const prompt = normalizeString(req.body.prompt);
        const imageModel = normalizeString(req.body.imageModel);
        const aspectRatio = normalizeString(req.body.aspectRatio) || null;
        const resolution = normalizeString(req.body.resolution) || null;
        const quality = normalizeImageQuality(req.body.quality);
        const source = normalizeString(req.body.source) || null;
        const legacySource = normalizeString(req.body.legacySource) || null;
        const capability = normalizeString(req.body.capability) || null;
        const referenceImages = normalizeReferenceImages(req.body.referenceImages);
        const negativePrompt = normalizeString(req.body.negativePrompt) || null;
        const projectCode = normalizeString(req.body.projectCode) || null;
        const hermesRunId = normalizeString(req.body.hermesRunId) || null;
        const designTaskId = normalizeString(req.body.designTaskId) || null;
        const title = normalizeString(req.body.title) || null;
        const targetSize = normalizeString(req.body.targetSize) || null;
        const referenceIds = normalizeStringArray(req.body.referenceIds);
        const referenceUsage = normalizeString(req.body.referenceUsage) || null;
        const originalModelRecommendation = normalizeString(req.body.originalModelRecommendation) || null;
        const normalizedModelRecommendation = normalizeString(req.body.normalizedModelRecommendation) || null;

        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!nodeId) {
            return res.status(400).json({ error: 'nodeId is required' });
        }

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        if (!imageModel) {
            return res.status(400).json({ error: 'imageModel is required' });
        }

        if (quality === undefined) {
            return res.status(400).json({ error: 'quality must be one of: auto, low, medium, high' });
        }

        if (!SUPPORTED_IMAGE_MODELS.has(imageModel)) {
            return res.status(400).json({
                error: `Image model unavailable: ${imageModel}. Available models: ${Array.from(SUPPORTED_IMAGE_MODELS).join(', ')}`
            });
        }

        const providerConfig = getImageProviders(imageModel)[0];
        if (!providerConfig) {
            return res.status(400).json({
                error: `Image model unavailable or disabled: ${imageModel}`
            });
        }

        let credentialContext = null;
        try {
            credentialContext = await resolveImageTaskCredentialContext(req, providerConfig);
        } catch (error) {
            const credentialError = getCredentialErrorResponse(error);
            if (credentialError) {
                return res.status(credentialError.status).json(credentialError.body);
            }
            throw error;
        }

        const task = await createTask({
            user: req.user,
            nodeId,
            workflowId,
            prompt,
            imageModel,
            aspectRatio,
            resolution,
            quality,
            source,
            legacySource,
            capability,
            referenceImages,
            negativePrompt,
            projectCode,
            hermesRunId,
            designTaskId,
            title,
            targetSize,
            referenceIds,
            referenceUsage,
            originalModelRecommendation,
            normalizedModelRecommendation,
            taskType: 'image_generation',
            provider: providerConfig.provider,
            teamId: credentialContext?.teamId || null,
            credentialId: credentialContext?.credentialId || null,
            credentialSource: credentialContext?.source || 'env',
            apiKeyLast4: credentialContext?.apiKeyLast4 || null
        });

        return res.status(201).json({
            taskId: task.taskId,
            nodeId: task.nodeId,
            status: task.status
        });
    } catch (error) {
        console.error('[Tasks] Failed to create image task:', error);
        return res.status(500).json({ error: error.message || 'Failed to create image task' });
    }
});

router.get('/by-node/:nodeId', async (req, res) => {
    try {
        const nodeId = normalizeString(req.params.nodeId);
        const workflowId = normalizeString(req.query.workflowId) || null;

        if (!nodeId) {
            return res.status(400).json({ error: 'nodeId is required' });
        }

        const task = await getLatestTaskByNodeId(nodeId, req.user, workflowId);
        return res.json({ task });
    } catch (error) {
        console.error('[Tasks] Failed to get task by node:', error);
        return res.status(500).json({ error: error.message || 'Failed to get task by node' });
    }
});

router.post('/:taskId/cancel', async (req, res) => {
    try {
        const taskId = normalizeString(req.params.taskId);

        if (!taskId) {
            return res.status(400).json({ error: 'task id is required' });
        }

        const task = await cancelTask(taskId, req.user);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (task.status !== 'cancelled') {
            return res.status(409).json({ error: 'Only queued tasks can be cancelled' });
        }

        return res.json({ task });
    } catch (error) {
        console.error('[Tasks] Failed to cancel task:', error);
        return res.status(500).json({ error: error.message || 'Failed to cancel task' });
    }
});

router.get('/:taskId', async (req, res) => {
    try {
        const taskId = normalizeString(req.params.taskId);

        if (!taskId) {
            return res.status(400).json({ error: 'task id is required' });
        }

        const task = await getTaskById(taskId, req.user);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        return res.json(task);
    } catch (error) {
        console.error('[Tasks] Failed to get task:', error);
        return res.status(500).json({ error: error.message || 'Failed to get task' });
    }
});

export default router;
