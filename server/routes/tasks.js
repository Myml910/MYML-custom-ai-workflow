import express from 'express';
import { cancelTask, createTask, getLatestTaskByNodeId, getTaskById } from '../db/tasks.js';
import { getImageProviders, getSupportedImageModelIds } from '../services/ai/modelRegistry.js';

const router = express.Router();
const SUPPORTED_IMAGE_MODELS = new Set(getSupportedImageModelIds());

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeReferenceImages(referenceImages) {
    if (!referenceImages) return null;
    return Array.isArray(referenceImages) ? referenceImages : [referenceImages];
}

router.post('/image', async (req, res) => {
    try {
        const nodeId = normalizeString(req.body.nodeId);
        const workflowId = normalizeString(req.body.workflowId) || null;
        const prompt = normalizeString(req.body.prompt);
        const imageModel = normalizeString(req.body.imageModel);
        const aspectRatio = normalizeString(req.body.aspectRatio) || null;
        const resolution = normalizeString(req.body.resolution) || null;
        const referenceImages = normalizeReferenceImages(req.body.referenceImages);

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

        if (!SUPPORTED_IMAGE_MODELS.has(imageModel)) {
            return res.status(400).json({
                error: `Image model unavailable: ${imageModel}. Available models: ${Array.from(SUPPORTED_IMAGE_MODELS).join(', ')}`
            });
        }

        const provider = getImageProviders(imageModel)[0]?.provider || 'apimart';
        const task = await createTask({
            user: req.user,
            nodeId,
            workflowId,
            prompt,
            imageModel,
            aspectRatio,
            resolution,
            referenceImages,
            taskType: 'image_generation',
            provider
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
