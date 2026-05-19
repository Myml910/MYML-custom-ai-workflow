import express from 'express';
import { getAvailableImageModels } from '../services/ai/modelRegistry.js';

const router = express.Router();

router.get('/image', (_req, res) => {
    return res.json({
        models: getAvailableImageModels()
    });
});

export default router;
