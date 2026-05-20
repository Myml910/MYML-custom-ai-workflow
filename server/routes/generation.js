/**
 * generation.js
 * 
 * Routes for AI image and video generation.
 * Supports Gemini, Veo, Kling AI, Hailuo AI, and OpenAI GPT Image providers.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { generateKlingVideo, generateKlingImage, generateKlingMultiImage } from '../services/kling.js';
import { generateGeminiImage, generateVeoVideo } from '../services/gemini.js';
import { generateHailuoVideo } from '../services/hailuo.js';
import { generateOpenAIImage } from '../services/openai.js';
import { generateCustomVideo } from '../services/customApi.js';
import { generateSeedanceVideo } from '../services/seedance.js';
import { getAiProviderConfig } from '../services/ai/aiProviderConfig.js';
import { aiRouter } from '../services/ai/router.js';
import { getImageProviders, getSupportedImageModelIds } from '../services/ai/modelRegistry.js';
import { resolveImageToBase64, saveBufferToFile } from '../utils/imageHelpers.js';
import {
    canUseLegacyRootLibrary,
    getLibraryUrlFromPath,
    normalizeLibraryRecordId,
    normalizeSafeFilename,
    resolvePathInside
} from '../utils/userLibrary.js';
import { saveGeneratedImage } from '../utils/saveGeneratedImage.js';
import { safeFetchImageUrl } from '../utils/safeFetchImage.js';
import { IMAGES_DIR, VIDEOS_DIR } from '../config/paths.js';

const router = express.Router();
const MAX_IMAGE_REFERENCES = 6;
const DEFAULT_IMAGE_MODEL = 'custom-image-gpt-image-2';
const SUPPORTED_IMAGE_MODELS = new Set(getSupportedImageModelIds());
const VIDEO_DISABLED_ERROR = 'Video generation is currently disabled.';
const LEGACY_GENERATE_IMAGE_SOURCES = new Set(['camera-angle', 'explicit-fallback']);

// ============================================================================
// IMAGE GENERATION
// ============================================================================

function getLegacyGenerateImageSource(req) {
    const source = String(
        req.body?.legacySource ||
        req.body?.legacyReason ||
        req.get('x-myml-legacy-generation-source') ||
        ''
    ).trim();

    return LEGACY_GENERATE_IMAGE_SOURCES.has(source) ? source : null;
}

// Legacy compatibility endpoint only. New image generation should use /api/tasks/image.
router.post('/generate-image', async (req, res) => {
    try {
        const { nodeId, prompt, aspectRatio, resolution, imageBase64: rawImageBase64, imageModel, klingReferenceMode, klingFaceIntensity, klingSubjectIntensity } = req.body;
        const safeNodeId = nodeId ? normalizeLibraryRecordId(nodeId) : null;
        if (nodeId && !safeNodeId) {
            return res.status(400).json({ error: 'Invalid nodeId' });
        }

        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, OPENAI_API_KEY } = req.app.locals;
        const aiProviderConfig = getAiProviderConfig(process.env, req.app.locals);
        const effectiveImageModel = imageModel || DEFAULT_IMAGE_MODEL;
        const legacySource = getLegacyGenerateImageSource(req);

        if (!SUPPORTED_IMAGE_MODELS.has(effectiveImageModel)) {
            return res.status(400).json({
                error: `Image model unavailable: ${effectiveImageModel}. Available models: ${Array.from(SUPPORTED_IMAGE_MODELS).join(', ')}`
            });
        }

        const providerChain = getImageProviders(effectiveImageModel).map(provider => provider.provider);
        if (!legacySource) {
            return res.status(409).json({
                error: 'Legacy /api/generate-image requires an explicit legacySource. New image generation must use /api/tasks/image.',
                legacy: true,
                requiredEndpoint: '/api/tasks/image',
                allowedLegacySources: Array.from(LEGACY_GENERATE_IMAGE_SOURCES)
            });
        }

        if (legacySource === 'camera-angle' && effectiveImageModel !== DEFAULT_IMAGE_MODEL) {
            return res.status(400).json({
                error: `Camera Angle legacy generation only supports ${DEFAULT_IMAGE_MODEL}.`,
                legacy: true,
                legacySource
            });
        }

        console.warn('[Generation][Legacy] /api/generate-image invoked', {
            legacySource,
            nodeId: safeNodeId,
            projectModelId: effectiveImageModel,
            providerChain,
            referenceCount: Array.isArray(rawImageBase64) ? rawImageBase64.length : (rawImageBase64 ? 1 : 0)
        });

        // Determine provider
        const isKlingModel = effectiveImageModel && effectiveImageModel.startsWith('kling-');
        const isOpenAIModel = effectiveImageModel && effectiveImageModel.startsWith('gpt-image-');
        const isCustomImageModel = effectiveImageModel && effectiveImageModel.startsWith('custom-image-');

        let imageBuffer;
        let imageFormat = 'png';
        let aiResult = null;

        if (isCustomImageModel) {
            // --- CUSTOM IMAGE GENERATION ---
            let resolvedImages = null;
            if (rawImageBase64) {
                const rawImages = Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64];
                resolvedImages = rawImages.map(img => resolveImageToBase64(img, req.user)).filter(Boolean);
            }

            const referenceCount = resolvedImages ? resolvedImages.length : 0;

            console.log('[AI Gateway][image route]', {
                projectModelId: effectiveImageModel,
                referenceCount,
                size: aspectRatio || aiProviderConfig.apimart.imageSize,
                resolution: resolution || aiProviderConfig.apimart.imageResolution
            });

            aiResult = await aiRouter.generateImage({
                nodeId: safeNodeId,
                projectModelId: effectiveImageModel,
                prompt,
                imageUrls: resolvedImages && resolvedImages.length > 0 ? resolvedImages : undefined,
                size: aspectRatio || aiProviderConfig.apimart.imageSize,
                resolution: resolution || aiProviderConfig.apimart.imageResolution
            }, { config: aiProviderConfig, user: req.user });

            imageBuffer = aiResult.imageBuffer;
            imageFormat = aiResult.imageFormat || 'png';

        } else if (isKlingModel) {
            // --- KLING AI IMAGE GENERATION ---
            if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                return res.status(500).json({
                    error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env"
                });
            }

            console.log(`Using Kling AI model for image: ${effectiveImageModel}`);

            // Resolve images if provided
            let resolvedImages = null;
            if (rawImageBase64) {
                const rawImages = (Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64]).slice(0, MAX_IMAGE_REFERENCES);
                resolvedImages = rawImages.map(img => resolveImageToBase64(img, req.user)).filter(Boolean);
            }

            let klingImageUrl;

            // Determine which API to use based on model and reference images:
            // - kling-v1-5: Uses standard API with image_reference parameter
            // - kling-v2, kling-v2-1: Use Multi-Image API (image_reference not supported)
            const isV2Model = effectiveImageModel === 'kling-v2' || effectiveImageModel === 'kling-v2-1' || effectiveImageModel === 'kling-v2-new';
            const hasReferenceImages = resolvedImages && resolvedImages.length > 0;

            if (hasReferenceImages && isV2Model) {
                // V2 models: Use Multi-Image API for image-to-image
                console.log(`Using Kling Multi-Image API for ${effectiveImageModel} with ${resolvedImages.length} subject image(s)`);
                klingImageUrl = await generateKlingMultiImage({
                    prompt,
                    subjectImages: resolvedImages,
                    modelId: effectiveImageModel,
                    aspectRatio,
                    resolution,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            } else if (hasReferenceImages && resolvedImages.length > 1) {
                // Multiple images with non-V2 model: Use Multi-Image API
                console.log(`Using Kling Multi-Image API with ${resolvedImages.length} subject images`);
                klingImageUrl = await generateKlingMultiImage({
                    prompt,
                    subjectImages: resolvedImages,
                    modelId: effectiveImageModel,
                    aspectRatio,
                    resolution,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            } else {
                // V1.5 or text-to-image: Use standard API (V1.5 supports image_reference)
                klingImageUrl = await generateKlingImage({
                    prompt,
                    imageBase64: resolvedImages,
                    modelId: effectiveImageModel,
                    aspectRatio,
                    resolution,
                    klingReferenceMode,
                    klingFaceIntensity,
                    klingSubjectIntensity,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            }

            // Download from Kling's URL
            const downloadedImage = await safeFetchImageUrl(klingImageUrl);
            imageBuffer = downloadedImage.buffer;

            if (klingImageUrl.includes('.jpg') || klingImageUrl.includes('.jpeg')) {
                imageFormat = 'jpg';
            }

        } else if (isOpenAIModel) {
            // --- OPENAI GPT IMAGE GENERATION ---
            if (!OPENAI_API_KEY) {
                return res.status(500).json({
                    error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env"
                });
            }

            console.log(`Using OpenAI GPT Image model: ${effectiveImageModel}`);

            // Resolve images if provided
            let imageBase64Array = null;
            if (rawImageBase64) {
                const rawImages = (Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64]).slice(0, MAX_IMAGE_REFERENCES);
                imageBase64Array = rawImages.map(img => resolveImageToBase64(img, req.user)).filter(Boolean);
            }

            imageBuffer = await generateOpenAIImage({
                prompt,
                imageBase64Array,
                aspectRatio,
                resolution,
                apiKey: OPENAI_API_KEY
            });

        } else {
            // --- GEMINI IMAGE GENERATION (Default) ---
            if (!GEMINI_API_KEY) {
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            let imageBase64Array = null;
            if (rawImageBase64) {
                const rawImages = (Array.isArray(rawImageBase64) ? rawImageBase64 : [rawImageBase64]).slice(0, MAX_IMAGE_REFERENCES);
                imageBase64Array = rawImages.map(img => resolveImageToBase64(img, req.user)).filter(Boolean);
            }

            imageBuffer = await generateGeminiImage({
                prompt,
                imageBase64Array,
                aspectRatio,
                resolution,
                apiKey: GEMINI_API_KEY
            });
        }

        const saved = await saveGeneratedImage({
            user: req.user,
            buffer: imageBuffer,
            prompt,
            model: effectiveImageModel,
            provider: aiResult?.provider,
            providerTaskId: aiResult?.taskId,
            taskId: aiResult?.requestId,
            nodeId: safeNodeId,
            metadataId: safeNodeId || undefined,
            remoteUrl: aiResult?.images?.[0]?.url,
            imageFormat
        });

        console.log(`Image saved: ${saved.resultUrl} (model: ${effectiveImageModel})`);
        return res.json({ resultUrl: saved.resultUrl, legacy: true, legacySource });

    } catch (error) {
        console.error("Server Image Gen Error:", error);
        res.status(500).json({ error: error.message || "Image generation failed" });
    }
});

// ============================================================================
// VIDEO GENERATION
// ============================================================================

router.post('/generate-video', async (req, res) => {
    return res.status(503).json({ error: VIDEO_DISABLED_ERROR });

    try {
        const { nodeId, prompt, imageBase64: rawImageBase64, lastFrameBase64: rawLastFrameBase64, motionReferenceUrl: rawMotionReferenceUrl, aspectRatio, resolution, duration, videoModel, generateAudio } = req.body;
        const safeNodeId = nodeId ? normalizeLibraryRecordId(nodeId) : null;
        if (nodeId && !safeNodeId) {
            return res.status(400).json({ error: 'Invalid nodeId' });
        }

        const { GEMINI_API_KEY, KLING_ACCESS_KEY, KLING_SECRET_KEY, HAILUO_API_KEY, CUSTOM_API_BASE_URL, CUSTOM_API_KEY } = req.app.locals;
        const videosDir = req.library?.videosDir || req.app.locals.VIDEOS_DIR;

        // Resolve file URLs to base64
        const imageBase64 = resolveImageToBase64(rawImageBase64, req.user);
        const lastFrameBase64 = resolveImageToBase64(rawLastFrameBase64, req.user);
        const motionReferenceUrl = resolveImageToBase64(rawMotionReferenceUrl, req.user);

        // Determine provider
        const isKlingModel = videoModel && videoModel.startsWith('kling-');
        const isHailuoModel = videoModel && videoModel.startsWith('hailuo-');
        const isCustomVideoModel = videoModel && videoModel.startsWith('custom-video-');
        const isSeedanceModel = videoModel === 'custom-video-seedance-2-0';

        let videoBuffer;

        if (isSeedanceModel) {
            console.log(`Using Seedance 2.0 video model: ${videoModel}, duration: ${duration || 5}s`);

            videoBuffer = await generateSeedanceVideo({
                prompt,
                imageUrl: rawImageBase64,
                lastFrameUrl: rawLastFrameBase64,
                aspectRatio,
                resolution,
                duration,
                generateAudio,
                apiBaseUrl: CUSTOM_API_BASE_URL,
                apiKey: CUSTOM_API_KEY
            });

        } else if (isCustomVideoModel) {
            // --- CUSTOM VIDEO GENERATION ---
            if (!CUSTOM_API_BASE_URL || !CUSTOM_API_KEY) {
                return res.status(500).json({
                    error: "Custom API not configured. Add CUSTOM_API_BASE_URL and CUSTOM_API_KEY to .env"
                });
            }

            console.log(`Using Custom API video model: ${videoModel}, duration: ${duration || 5}s`);

            videoBuffer = await generateCustomVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                aspectRatio,
                resolution,
                duration,
                modelId: videoModel,
                apiBaseUrl: CUSTOM_API_BASE_URL,
                apiKey: CUSTOM_API_KEY
            });

        } else if (isKlingModel) {
            // --- KLING AI VIDEO GENERATION ---

            // Check if this is a Kling 2.6 model (route to Fal.ai - official API doesn't support v2.6)
            const isKling26 = videoModel === 'kling-v2-6';
            // Check if this is a motion control request (kling-v2-6 with motion reference)
            const isMotionControl = isKling26 && motionReferenceUrl;

            let resultVideoUrl;

            if (isKling26) {
                // --- KLING 2.6 VIA FAL.AI ---
                // Official Kling API doesn't support v2.6, use fal.ai instead
                const { FAL_API_KEY } = req.app.locals;

                if (!FAL_API_KEY) {
                    return res.status(500).json({
                        error: "FAL_API_KEY not configured. Add FAL_API_KEY to .env for Kling 2.6."
                    });
                }

                if (isMotionControl) {
                    // Motion Control mode
                    console.log(`\n[Route] Kling 2.6 Motion Control detected - routing to fal.ai`);
                    console.log(`[Route] Motion Reference: ${motionReferenceUrl ? 'YES (' + Math.round(motionReferenceUrl.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Character Image: ${imageBase64 ? 'YES (' + Math.round(imageBase64.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Prompt: ${prompt ? prompt.substring(0, 50) + '...' : '(none)'}`);

                    const { generateFalMotionControl } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalMotionControl({
                        prompt,
                        characterImageBase64: imageBase64,
                        motionVideoBase64: motionReferenceUrl,
                        characterOrientation: 'video',
                        apiKey: FAL_API_KEY
                    });
                } else {
                    // Standard Image-to-Video mode
                    console.log(`\n[Route] Kling 2.6 Image-to-Video - routing to fal.ai`);
                    console.log(`[Route] Image: ${imageBase64 ? 'YES (' + Math.round(imageBase64.length / 1024) + ' KB)' : 'NO'}`);
                    console.log(`[Route] Duration: ${duration || 5}s`);
                    console.log(`[Route] Generate Audio: ${req.body.generateAudio !== false}`);

                    const { generateFalImageToVideo } = await import('../services/fal.js');

                    resultVideoUrl = await generateFalImageToVideo({
                        prompt,
                        imageBase64,
                        duration: String(duration || 5),
                        generateAudio: req.body.generateAudio !== false, // Default to true
                        apiKey: FAL_API_KEY
                    });
                }
            } else {
                // --- STANDARD KLING VIDEO GENERATION ---
                if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
                    return res.status(500).json({
                        error: "Kling API credentials not configured. Add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env"
                    });
                }

                console.log(`Using Kling AI model: ${videoModel}, duration: ${duration || 5}s`);

                resultVideoUrl = await generateKlingVideo({
                    prompt,
                    imageBase64,
                    lastFrameBase64,
                    modelId: videoModel,
                    aspectRatio,
                    duration: duration || 5,
                    motionReferenceUrl,
                    accessKey: KLING_ACCESS_KEY,
                    secretKey: KLING_SECRET_KEY
                });
            }

            // Download from the result URL
            const videoResponse = await fetch(resultVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download generated video');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else if (isHailuoModel) {
            // --- HAILUO AI VIDEO GENERATION ---
            if (!HAILUO_API_KEY) {
                return res.status(500).json({
                    error: "Hailuo API key not configured. Add HAILUO_API_KEY to .env"
                });
            }

            console.log(`Using Hailuo AI model: ${videoModel}, duration: ${duration || 6}s`);

            const hailuoVideoUrl = await generateHailuoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                modelId: videoModel,
                aspectRatio,
                resolution,
                duration: duration || 6,
                apiKey: HAILUO_API_KEY
            });

            // Download from Hailuo's URL
            const videoResponse = await fetch(hailuoVideoUrl);
            if (!videoResponse.ok) {
                throw new Error('Failed to download video from Hailuo');
            }
            videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        } else {
            // --- VEO VIDEO GENERATION (Default) ---
            if (!GEMINI_API_KEY) {
                return res.status(500).json({ error: "Server missing API Key config" });
            }

            console.log(`Using Veo model: ${videoModel || 'veo-3.1'}, duration: ${duration || 8}s, generateAudio: ${req.body.generateAudio !== false}`);

            videoBuffer = await generateVeoVideo({
                prompt,
                imageBase64,
                lastFrameBase64,
                aspectRatio,
                resolution,
                duration: duration || 8,
                generateAudio: req.body.generateAudio !== false, // Default to true
                apiKey: GEMINI_API_KEY
            });
        }

        // Save to library - use unique filename to preserve previous generations
        const saved = saveBufferToFile(videoBuffer, videosDir, 'vid', 'mp4');

        // Determine metadata ID: use nodeId for recovery if available, otherwise use file ID
        const metadataId = safeNodeId || saved.id;

        // Save metadata (id must match the metadata filename for delete to work)
        const metadata = {
            id: metadataId,  // Must match the filename for delete API to find it
            filename: saved.filename,
            prompt: prompt,
            model: videoModel || 'veo-3.1',
            aspectRatio: aspectRatio || 'Auto',
            resolution: resolution || 'Auto',
            createdAt: new Date().toISOString(),
            type: 'videos'
        };
        const metadataPath = resolvePathInside(videosDir, `${metadataId}.json`);
        if (!metadataPath) {
            return res.status(403).json({ error: 'Video metadata path is outside the user library' });
        }
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        if (isSeedanceModel) {
            console.log('[Seedance][saved]', {
                model: videoModel,
                savedUrl: saved.url
            });
        }

        console.log(`Video saved: ${saved.url} (model: ${videoModel || 'veo-3.1'})`);
        return res.json({ resultUrl: saved.url });

    } catch (error) {
        console.error("Server Video Gen Error:", error);
        res.status(500).json({ error: error.message || "Video generation failed" });
    }
});

// ============================================================================
// GENERATION STATUS / RECOVERY
// ============================================================================

function getMetadataResultUrl(metaPath, metadata) {
    const safeFilename = normalizeSafeFilename(metadata?.filename);
    if (!safeFilename) return null;

    const mediaPath = resolvePathInside(path.dirname(metaPath), safeFilename);
    return mediaPath ? getLibraryUrlFromPath(mediaPath) : null;
}

/**
 * Check if a generation has finished for a specific nodeId.
 * Returns the resultUrl if it exists.
 */
router.get('/generation-status/:nodeId', async (req, res) => {
    try {
        const nodeId = normalizeLibraryRecordId(req.params.nodeId);
        if (!nodeId) {
            return res.status(400).json({ error: 'Invalid nodeId' });
        }

        const imagesDir = req.library?.imagesDir || req.app.locals.IMAGES_DIR;
        const videosDir = req.library?.videosDir || req.app.locals.VIDEOS_DIR;

        // Check images metadata
        let imageMetaPath = resolvePathInside(imagesDir, `${nodeId}.json`);
        if (!imageMetaPath) {
            return res.status(403).json({ error: 'Image metadata path is outside the user library' });
        }
        if (!fs.existsSync(imageMetaPath) && canUseLegacyRootLibrary(req.user)) {
            const legacyImageMetaPath = resolvePathInside(IMAGES_DIR, `${nodeId}.json`);
            if (fs.existsSync(legacyImageMetaPath)) {
                imageMetaPath = legacyImageMetaPath;
            }
        }
        if (fs.existsSync(imageMetaPath)) {
            const meta = JSON.parse(fs.readFileSync(imageMetaPath, 'utf8'));
            const resultUrl = getMetadataResultUrl(imageMetaPath, meta);
            if (!resultUrl) {
                return res.status(500).json({ error: 'Invalid image metadata filename' });
            }
            return res.json({ status: 'success', resultUrl, type: 'image', createdAt: meta.createdAt });
        }

        // Check videos metadata
        let videoMetaPath = resolvePathInside(videosDir, `${nodeId}.json`);
        if (!videoMetaPath) {
            return res.status(403).json({ error: 'Video metadata path is outside the user library' });
        }
        if (!fs.existsSync(videoMetaPath) && canUseLegacyRootLibrary(req.user)) {
            const legacyVideoMetaPath = resolvePathInside(VIDEOS_DIR, `${nodeId}.json`);
            if (fs.existsSync(legacyVideoMetaPath)) {
                videoMetaPath = legacyVideoMetaPath;
            }
        }
        if (fs.existsSync(videoMetaPath)) {
            const meta = JSON.parse(fs.readFileSync(videoMetaPath, 'utf8'));
            const resultUrl = getMetadataResultUrl(videoMetaPath, meta);
            if (!resultUrl) {
                return res.status(500).json({ error: 'Invalid video metadata filename' });
            }
            return res.json({ status: 'success', resultUrl, type: 'video', createdAt: meta.createdAt });
        }

        res.json({ status: 'pending' });
    } catch (error) {
        console.error("Status Check Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
