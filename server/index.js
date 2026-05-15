// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { spawn } from 'child_process';
import chatAgent from './agent/index.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import { getDatabaseLabel, getDb } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { seedInitialAdmin, seedInternalTestUsers } from './db/users.js';
import {
    canUseLegacyRootLibrary,
    ensureUserLibraryDirs,
    getLibraryUrlFromPath,
    getSafeUsername,
    listMediaMetadata,
    resolveLibraryUrlToPath
} from './utils/userLibrary.js';
import generationRoutes from './routes/generation.js';
import { getAiProviderConfig, isApimartTextConfigured } from './services/ai/aiProviderConfig.js';
import { createTextResponse, extractResponseText } from './services/ai/providers/apimartProvider.js';
import { resolveImageToBase64 } from './utils/imageHelpers.js';
import twitterRoutes from './routes/twitter.js';
import tiktokPostRoutes from './routes/tiktok-post.js';
import { processTikTokVideo, isValidTikTokUrl } from './tools/tiktok.js';
import localModelsRoutes from './routes/local-models.js';
import storyboardRoutes from './routes/storyboard.js';
import mattingRoutes from './routes/matting.js';
import {
    ASSETS_DIR,
    CHATS_DIR,
    IMAGES_DIR,
    LIBRARY_DIR,
    TEMP_DIR,
    VIDEOS_DIR,
    WORKFLOWS_DIR
} from './config/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';

try {
    const db = getDb();
    await runMigrations(db);
    await seedInitialAdmin();
    await seedInternalTestUsers();
    console.log(`[DB] PostgreSQL ready: ${getDatabaseLabel()}`);
} catch (error) {
    console.error('[DB] Failed to initialize database:', error.message);
    process.exit(1);
}

// Ensure library directories exist
[LIBRARY_DIR, WORKFLOWS_DIR, IMAGES_DIR, VIDEOS_DIR, CHATS_DIR, ASSETS_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Enable CORS for all routes (must come before static file serving)
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json({ limit: '100mb' }));

// Application authentication routes must stay public.
app.use('/api/auth', authRoutes);

// Protect core app APIs while leaving third-party OAuth callbacks untouched.
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/twitter/callback') || req.path.startsWith('/tiktok-post/callback')) {
        return next();
    }

    return requireAuth(req, res, () => {
        req.library = ensureUserLibraryDirs(req.user);
        return next();
    });
});

// Serve library assets only to the owning authenticated user.
app.use('/library', requireAuth, (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const safeUsername = getSafeUsername(req.user?.username);
    const cleanPath = decodeURIComponent(req.path || '/').replace(/^\/+/, '');
    const segments = cleanPath.split('/').filter(Boolean);

    let filePath = null;
    if (segments[0] === 'users') {
        if (segments[1] !== safeUsername) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        filePath = path.resolve(LIBRARY_DIR, cleanPath);
        const userRoot = path.resolve(LIBRARY_DIR, 'users', safeUsername);
        if (filePath !== userRoot && !filePath.startsWith(userRoot + path.sep)) {
            return res.status(400).json({ error: 'Invalid library path' });
        }
    } else if (canUseLegacyRootLibrary(req.user)) {
        filePath = path.resolve(LIBRARY_DIR, cleanPath);
    } else {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const libraryRoot = path.resolve(LIBRARY_DIR);
    if (!filePath.startsWith(libraryRoot + path.sep)) {
        return res.status(400).json({ error: 'Invalid library path' });
    }

    return res.sendFile(filePath, (error) => {
        if (error) next(error);
    });
});


const APIMART_HAS_CORE_CONFIG = Boolean(process.env.APIMART_BASE_URL && process.env.APIMART_API_KEY);
const WARN_LEGACY_MODELS = process.env.ENABLE_LEGACY_MODEL_WARNINGS === 'true';
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY && !APIMART_HAS_CORE_CONFIG) {
    console.warn("SERVER WARNING: GEMINI_API_KEY is not set in environment or .env file.");
}

const getClient = () => {
    return new GoogleGenAI({ apiKey: API_KEY || '' });
};

// ============================================================================
// KLING AI CONFIGURATION
// ============================================================================

const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;
const KLING_BASE_URL = 'https://api-singapore.klingai.com';

if (WARN_LEGACY_MODELS && (!KLING_ACCESS_KEY || !KLING_SECRET_KEY)) {
    console.warn("SERVER WARNING: KLING_ACCESS_KEY or KLING_SECRET_KEY not set. Kling AI models will not work.");
}

// ============================================================================
// HAILUO AI CONFIGURATION
// ============================================================================

const HAILUO_API_KEY = process.env.HAILUO_API_KEY;

if (WARN_LEGACY_MODELS && !HAILUO_API_KEY) {
    console.warn("SERVER WARNING: HAILUO_API_KEY not set. Hailuo AI models will not work.");
}

// ============================================================================
// OPENAI GPT IMAGE CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (WARN_LEGACY_MODELS && !OPENAI_API_KEY) {
    console.warn("SERVER WARNING: OPENAI_API_KEY not set. OpenAI GPT Image models will not work.");
}

// ============================================================================
// FAL.AI CONFIGURATION (for Kling 2.6 Motion Control)
// ============================================================================

const FAL_API_KEY = process.env.FAL_API_KEY;

if (WARN_LEGACY_MODELS && !FAL_API_KEY) {
    console.warn("SERVER WARNING: FAL_API_KEY not set. Kling 2.6 Motion Control will not work.");
}
// ============================================================================
// CUSTOM API CONFIGURATION
// ============================================================================
const CUSTOM_API_BASE_URL = process.env.CUSTOM_API_BASE_URL;
const CUSTOM_API_KEY = process.env.CUSTOM_API_KEY;

if (WARN_LEGACY_MODELS && !CUSTOM_API_BASE_URL) {
    console.warn("SERVER WARNING: CUSTOM_API_BASE_URL not set. Custom API models will not work.");
}

if (WARN_LEGACY_MODELS && !CUSTOM_API_KEY) {
    console.warn("SERVER WARNING: CUSTOM_API_KEY not set. Custom API models will not work.");
}
// Set up app.locals for sharing config with route modules
app.locals.GEMINI_API_KEY = API_KEY;
app.locals.KLING_ACCESS_KEY = KLING_ACCESS_KEY;
app.locals.KLING_SECRET_KEY = KLING_SECRET_KEY;
app.locals.HAILUO_API_KEY = HAILUO_API_KEY;
app.locals.OPENAI_API_KEY = OPENAI_API_KEY;
app.locals.FAL_API_KEY = FAL_API_KEY;
app.locals.CUSTOM_API_BASE_URL = CUSTOM_API_BASE_URL;
app.locals.CUSTOM_API_KEY = CUSTOM_API_KEY;
app.locals.IMAGES_DIR = IMAGES_DIR;
app.locals.VIDEOS_DIR = VIDEOS_DIR;
app.locals.LIBRARY_DIR = LIBRARY_DIR;
app.locals.WORKFLOWS_DIR = WORKFLOWS_DIR;
app.locals.CHATS_DIR = CHATS_DIR;
app.locals.ASSETS_DIR = ASSETS_DIR;
app.locals.TEMP_DIR = TEMP_DIR;

// ============================================================================
// WORKFLOW SANITIZATION HELPERS
// ============================================================================

/**
 * Saves base64 data URL to a file and returns the file URL path.
 * @param {string} dataUrl - Base64 data URL (e.g., data:image/png;base64,...)
 * @returns {{ url: string } | null} - File URL path or null if not base64
 */
function saveBase64ToFile(dataUrl, libraryDirs) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        return null;
    }

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const base64Data = matches[2];

    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        let filename, targetDir, urlType;

        if (mimeType.startsWith('video/')) {
            filename = `${id}.mp4`;
            targetDir = libraryDirs.videosDir;
            urlType = 'videos';
        } else {
            const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
            filename = `${id}.${ext}`;
            targetDir = libraryDirs.imagesDir;
            urlType = 'images';
        }

        const filePath = path.join(targetDir, filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`  [Workflow Sanitize] Saved base64 → /library/${urlType}/${filename}`);

        return { url: getLibraryUrlFromPath(filePath) };
    } catch (err) {
        console.error('  [Workflow Sanitize] Failed to save base64:', err.message);
        return null;
    }
}

/**
 * Sanitizes workflow nodes by converting base64 data to file URLs.
 * Prevents large base64 strings from bloating workflow JSON files.
 * @param {Array} nodes - Array of workflow nodes
 * @returns {Array} - Sanitized nodes with file URLs instead of base64
 */
function sanitizeWorkflowNodes(nodes, libraryDirs) {
    if (!nodes || !Array.isArray(nodes)) return nodes;

    let sanitizedCount = 0;

    const sanitized = nodes.map(node => {
        const cleanNode = { ...node };

        // Check resultUrl for base64 data
        if (cleanNode.resultUrl && cleanNode.resultUrl.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.resultUrl, libraryDirs);
            if (saved) {
                cleanNode.resultUrl = saved.url;
                sanitizedCount++;
            }
        }

        // Check lastFrame for base64 data (video nodes)
        if (cleanNode.lastFrame && cleanNode.lastFrame.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.lastFrame, libraryDirs);
            if (saved) {
                cleanNode.lastFrame = saved.url;
                sanitizedCount++;
            }
        }

        // Check editorCanvasData for base64 data (Image Editor)
        if (cleanNode.editorCanvasData && cleanNode.editorCanvasData.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.editorCanvasData, libraryDirs);
            if (saved) {
                cleanNode.editorCanvasData = saved.url;
                sanitizedCount++;
            }
        }

        // Check editorBackgroundUrl for base64 data (Image Editor)
        if (cleanNode.editorBackgroundUrl && cleanNode.editorBackgroundUrl.startsWith('data:')) {
            const saved = saveBase64ToFile(cleanNode.editorBackgroundUrl, libraryDirs);
            if (saved) {
                cleanNode.editorBackgroundUrl = saved.url;
                sanitizedCount++;
            }
        }

        return cleanNode;
    });

    if (sanitizedCount > 0) {
        console.log(`[Workflow Sanitize] Converted ${sanitizedCount} base64 field(s) to file URLs`);
    }

    return sanitized;
}

function getWorkflowPath(req, workflowId, { allowLegacy = true } = {}) {
    const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
    const primaryPath = path.join(libraryDirs.workflowsDir, `${workflowId}.json`);
    if (fs.existsSync(primaryPath) || !allowLegacy || !canUseLegacyRootLibrary(req.user)) {
        return primaryPath;
    }

    const legacyPath = path.join(WORKFLOWS_DIR, `${workflowId}.json`);
    return fs.existsSync(legacyPath) ? legacyPath : primaryPath;
}

// Mount generation routes (image and video generation)
app.use('/api', generationRoutes);

// Mount Twitter routes (Post to X feature)
app.use('/api/twitter', twitterRoutes);

// Mount TikTok routes (Post to TikTok feature)
app.use('/api/tiktok-post', tiktokPostRoutes);

// Mount Local Models routes (local open-source model discovery)
app.use('/api/local-models', localModelsRoutes);

// Mount Storyboard routes (AI script generation)
app.use('/api/storyboard', storyboardRoutes);

// Mount Matting proxy routes (local background removal engine)
app.use('/api/matting', mattingRoutes);

// NOTE: Old Kling helpers removed - now in server/services/kling.js

// --- Library Assets API ---

const WINDOWS_RESERVED_FILENAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

const MIME_EXTENSION_MAP = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov'
};

function normalizeAssetBaseName(name) {
    let safeName = String(name || '')
        .trim()
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/^[_\-.]+|[_\-.]+$/g, '')
        .toLowerCase();

    if (!safeName) {
        safeName = 'asset';
    }

    if (WINDOWS_RESERVED_FILENAMES.has(safeName)) {
        safeName = `asset_${safeName}`;
    }

    return safeName.slice(0, 80).replace(/^[_\-.]+|[_\-.]+$/g, '') || 'asset';
}

function normalizeAssetExtension(ext, fallback = '.png') {
    const normalized = String(ext || fallback || '.png').toLowerCase();
    const withDot = normalized.startsWith('.') ? normalized : `.${normalized}`;
    const safeExt = withDot.replace(/[^a-z0-9.]/g, '');

    return /^\.[a-z0-9]{1,12}$/.test(safeExt) ? safeExt : fallback;
}

function getExtensionFromMime(mimeType) {
    return MIME_EXTENSION_MAP[String(mimeType || '').toLowerCase()] || '.png';
}

function createUniqueAssetFilename(destDir, baseName, ext) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const shortId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
        const filename = `${baseName}_${shortId}${ext}`;
        const filePath = path.join(destDir, filename);

        if (!fs.existsSync(filePath)) {
            return { filename, filePath };
        }
    }

    throw new Error('Unable to allocate unique asset filename');
}

function readAssetLibraryData(libraryJsonPath) {
    if (!fs.existsSync(libraryJsonPath)) {
        return [];
    }

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(libraryJsonPath, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to read asset library metadata: ${error.message}`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error('Asset library metadata must be an array');
    }

    return parsed;
}

function writeAssetLibraryData(libraryJsonPath, libraryData) {
    if (!Array.isArray(libraryData)) {
        throw new Error('Asset library metadata must be an array');
    }

    const tmpPath = `${libraryJsonPath}.${process.pid}.${Date.now()}.${crypto.randomUUID().slice(0, 8)}.tmp`;

    try {
        fs.mkdirSync(path.dirname(libraryJsonPath), { recursive: true });
        fs.writeFileSync(tmpPath, JSON.stringify(libraryData, null, 2));
        fs.renameSync(tmpPath, libraryJsonPath);
    } catch (error) {
        if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
        throw error;
    }
}

function normalizeAssetUrlForCompare(url) {
    return typeof url === 'string' ? url.split('?')[0] : '';
}

// Save curated asset to library
app.post('/api/library', async (req, res) => {
    try {
        const { sourceUrl, name, category, meta } = req.body;

        if (!sourceUrl || !name || !category) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Determine destination directory
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const destDir = path.join(libraryDirs.assetsDir, category);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Sanitize display name into a filesystem-safe base only.
        // The user-facing name is preserved in assets.json.
        const safeName = normalizeAssetBaseName(name);

        let destFilename;
        let destPath;

        // HANDLE DATA URL (Base64)
        if (sourceUrl.startsWith('data:')) {
            const matches = sourceUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return res.status(400).json({ error: 'Invalid data URL format' });
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            const ext = normalizeAssetExtension(getExtensionFromMime(mimeType));
            const uniqueTarget = createUniqueAssetFilename(destDir, safeName, ext);
            destFilename = uniqueTarget.filename;
            destPath = uniqueTarget.filePath;

            fs.writeFileSync(destPath, buffer);
        }
        // HANDLE FILE PATH OR URL
        else {
            // Determine source file path
            let sourcePath = null;

            // Normalize URL: remove origin if present to get just the path
            let cleanUrl = sourceUrl;
            try {
                // If it's a full URL, extract pathname
                if (sourceUrl.startsWith('http')) {
                    const u = new URL(sourceUrl);
                    cleanUrl = u.pathname;
                }
            } catch (e) {
                // Not a valid URL, treat as path
            }

            // Always strip query string (cache busting params like ?t=123)
            cleanUrl = cleanUrl.split('?')[0];

            // Ensure cleanUrl starts with / if it doesn't (though URL.pathname does)
            if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;

            // Handle URL decoding (e.g. %20 -> space)
            cleanUrl = decodeURIComponent(cleanUrl);

            if (cleanUrl.startsWith('/library/')) {
                sourcePath = resolveLibraryUrlToPath(cleanUrl, req.user);
            } else if (cleanUrl.startsWith('/assets/images/')) { // Legacy support
                sourcePath = path.join(IMAGES_DIR, cleanUrl.replace('/assets/images/', ''));
            } else if (cleanUrl.startsWith('/assets/videos/')) { // Legacy support
                sourcePath = path.join(VIDEOS_DIR, cleanUrl.replace('/assets/videos/', ''));
            }

            if (!sourcePath || !fs.existsSync(sourcePath)) {
                console.error(`Save asset failed: Source file not found. URL: ${sourceUrl}, Path: ${sourcePath}`);
                return res.status(404).json({ error: "Source file not found", debug: { sourceUrl, sourcePath, cleanUrl } });
            }

            const fallbackExt = sourceUrl.includes('video') ? '.mp4' : '.png';
            const ext = normalizeAssetExtension(path.extname(sourcePath), fallbackExt);
            const uniqueTarget = createUniqueAssetFilename(destDir, safeName, ext);
            destFilename = uniqueTarget.filename;
            destPath = uniqueTarget.filePath;

            fs.copyFileSync(sourcePath, destPath);
        }

        // Update assets.json
        const libraryJsonPath = path.join(libraryDirs.assetsDir, 'assets.json');
        const libraryData = readAssetLibraryData(libraryJsonPath);

        const newEntry = {
            id: crypto.randomUUID(),
            name: name,
            category: category,
            url: getLibraryUrlFromPath(destPath),
            type: sourceUrl.includes('video') || (sourceUrl.startsWith('data:video')) ? 'video' : 'image',
            createdAt: new Date().toISOString(),
            ...meta
        };

        libraryData.push(newEntry);
        writeAssetLibraryData(libraryJsonPath, libraryData);

        res.json({ success: true, asset: newEntry });
    } catch (error) {
        console.error("Save to library error:", error);
        res.status(500).json({ error: error.message });
    }
});

// List library assets
app.get('/api/library', async (req, res) => {
    try {
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const libraryJsonPath = path.join(libraryDirs.assetsDir, 'assets.json');
        let libraryData = readAssetLibraryData(libraryJsonPath);

        if (canUseLegacyRootLibrary(req.user)) {
            const legacyJsonPath = path.join(ASSETS_DIR, 'assets.json');
            if (fs.existsSync(legacyJsonPath)) {
                libraryData = [
                    ...libraryData,
                    ...readAssetLibraryData(legacyJsonPath)
                ];
            }
        }

        // Sort newest first
        libraryData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(libraryData);
    } catch (error) {
        console.error("List library error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete library asset
app.delete('/api/library/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        let libraryJsonPath = path.join(libraryDirs.assetsDir, 'assets.json');
        if (!fs.existsSync(libraryJsonPath) && canUseLegacyRootLibrary(req.user)) {
            const legacyJsonPath = path.join(ASSETS_DIR, 'assets.json');
            if (fs.existsSync(legacyJsonPath)) {
                libraryJsonPath = legacyJsonPath;
            }
        }

        if (!fs.existsSync(libraryJsonPath)) {
            return res.status(404).json({ error: "Library not found" });
        }

        let libraryData = readAssetLibraryData(libraryJsonPath);
        const assetIndex = libraryData.findIndex(a => a.id === id);

        if (assetIndex === -1) {
            return res.status(404).json({ error: "Asset not found" });
        }

        const asset = libraryData[assetIndex];
        const assetUrl = normalizeAssetUrlForCompare(asset.url);
        const otherEntriesUseSameUrl = libraryData.some((entry, index) =>
            index !== assetIndex &&
            normalizeAssetUrlForCompare(entry.url) === assetUrl
        );

        if (!otherEntriesUseSameUrl && asset.url && asset.url.startsWith('/library/')) {
            const filePath = resolveLibraryUrlToPath(asset.url, req.user);
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Remove from array
        libraryData.splice(assetIndex, 1);
        writeAssetLibraryData(libraryJsonPath, libraryData);

        res.json({ success: true });
    } catch (error) {
        console.error("Delete library asset error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Workflow API Routes ---

// Save/Update workflow
app.post('/api/workflows', async (req, res) => {
    try {
        const workflow = req.body;
        if (!workflow.id) {
            workflow.id = crypto.randomUUID();
        }
        workflow.updatedAt = new Date().toISOString();
        if (!workflow.createdAt) {
            workflow.createdAt = workflow.updatedAt;
        }


        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const filePath = path.join(libraryDirs.workflowsDir, `${workflow.id}.json`);

        // Preserve existing coverUrl if it exists
        if (fs.existsSync(filePath)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (existingData.coverUrl) {
                    workflow.coverUrl = existingData.coverUrl;
                }
            } catch (readError) {
                console.warn("Could not read existing workflow to preserve cover:", readError);
            }
        }

        // Sanitize nodes: convert any base64 data to file URLs before saving
        if (workflow.nodes) {
            workflow.nodes = sanitizeWorkflowNodes(workflow.nodes, libraryDirs);
        }

        fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));


        res.json({ success: true, id: workflow.id });
    } catch (error) {
        console.error("Save workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Public Workflows API (bundled examples) ---

// List public workflows (shipped with the repo in public/workflows/)
// Dynamically scans directory - no need to maintain index.json manually
app.get('/api/public-workflows', async (req, res) => {
    try {
        const publicWorkflowsDir = path.join(__dirname, '..', 'public', 'workflows');

        if (!fs.existsSync(publicWorkflowsDir)) {
            return res.json([]);
        }

        // Scan all .json files except index.json
        const files = fs.readdirSync(publicWorkflowsDir)
            .filter(f => f.endsWith('.json') && f !== 'index.json');

        const workflows = files.map(file => {
            try {
                const content = fs.readFileSync(path.join(publicWorkflowsDir, file), 'utf8');
                const workflow = JSON.parse(content);

                // Generate description from workflow content
                const nodeTypes = workflow.nodes?.reduce((acc, n) => {
                    acc[n.type] = (acc[n.type] || 0) + 1;
                    return acc;
                }, {}) || {};
                const typesSummary = Object.entries(nodeTypes)
                    .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
                    .join(', ');
                const description = workflow.description ||
                    (typesSummary ? `Workflow with ${typesSummary}` : 'A public workflow template');

                return {
                    id: file.replace('.json', ''),
                    title: workflow.title || 'Untitled Workflow',
                    description,
                    nodeCount: workflow.nodes?.length || 0,
                    coverUrl: workflow.coverUrl || null
                };
            } catch (parseError) {
                console.warn(`Skipping invalid workflow file: ${file}`, parseError.message);
                return null;
            }
        }).filter(Boolean); // Remove any null entries from parse errors

        // Sort by title alphabetically
        workflows.sort((a, b) => a.title.localeCompare(b.title));

        res.json(workflows);
    } catch (error) {
        console.error("List public workflows error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Load specific public workflow
app.get('/api/public-workflows/:id', async (req, res) => {
    try {
        const publicWorkflowsDir = path.join(__dirname, '..', 'public', 'workflows');
        const filePath = path.join(publicWorkflowsDir, `${req.params.id}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Public workflow not found" });
        }

        const content = fs.readFileSync(filePath, 'utf8');
        res.json(JSON.parse(content));
    } catch (error) {
        console.error("Load public workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- User Workflows API ---

// List all workflows
app.get('/api/workflows', async (req, res) => {
    try {
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const workflowDirs = [libraryDirs.workflowsDir];
        if (canUseLegacyRootLibrary(req.user)) {
            workflowDirs.push(WORKFLOWS_DIR);
        }

        const workflows = workflowDirs.flatMap(workflowsDir => {
            if (!fs.existsSync(workflowsDir)) return [];
            const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
            return files.map(file => {
                const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
            const workflow = JSON.parse(content);
            return {
                id: workflow.id,
                title: workflow.title,
                createdAt: workflow.createdAt,
                updatedAt: workflow.updatedAt,
                nodeCount: workflow.nodes?.length || 0,
                coverUrl: workflow.coverUrl
            };
            });
        });
        workflows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        res.json(workflows);
    } catch (error) {
        console.error("List workflows error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Load specific workflow
app.get('/api/workflows/:id', async (req, res) => {
    try {
        const filePath = getWorkflowPath(req, req.params.id);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Workflow not found" });
        }
        const content = fs.readFileSync(filePath, 'utf8');
        res.json(JSON.parse(content));
    } catch (error) {
        console.error("Load workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete workflow
app.delete('/api/workflows/:id', async (req, res) => {
    try {
        const filePath = getWorkflowPath(req, req.params.id);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Workflow not found" });
        }
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (error) {
        console.error("Delete workflow error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update workflow cover
app.put('/api/workflows/:id/cover', async (req, res) => {
    try {
        const { coverUrl } = req.body;
        const filePath = getWorkflowPath(req, req.params.id);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Workflow not found" });
        }

        const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        workflowData.coverUrl = coverUrl;
        fs.writeFileSync(filePath, JSON.stringify(workflowData, null, 2));

        res.json({ success: true, coverUrl });
    } catch (error) {
        console.error("Update cover error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// GEMINI IMAGE DESCRIPTION API
// ============================================================================

// Describe an image for prompt generation
app.post('/api/gemini/describe-image', async (req, res) => {
    try {
        const { imageUrl, prompt } = req.body;
        console.log(`[Gemini DescribeV2] Request received. imageUrl: ${imageUrl ? (imageUrl.length > 100 ? imageUrl.substring(0, 100) + '...' : imageUrl) : 'missing'}`);
        // DEBUG: Verify story context injection
        if (prompt) {
            console.log('[Gemini DescribeV2] Received Prompt:', prompt);
        }

        if (!imageUrl) {
            return res.status(400).json({ error: 'Image URL is required' });
        }

        const aiProviderConfig = getAiProviderConfig(process.env, req.app.locals);
        if (isApimartTextConfigured(aiProviderConfig)) {
            const resolvedImage = resolveImageToBase64(imageUrl, req.user);
            if (!resolvedImage) {
                return res.status(400).json({ error: 'Could not process image URL. Provide base64 data or a valid library path.', debug: { imageUrl } });
            }

            const data = await createTextResponse([
                {
                    role: 'user',
                    content: [
                        { type: 'input_text', text: prompt || 'Describe this image in detail for video generation.' },
                        { type: 'input_image', image_url: resolvedImage }
                    ]
                }
            ], { config: aiProviderConfig });

            const text = extractResponseText(data);
            if (!text) {
                return res.status(500).json({ error: 'Failed to describe image' });
            }

            return res.json({ description: text });
        }

        // Handle base64 or file URL
        let imagePart;

        // Check if it's a data URL (base64)
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                imagePart = {
                    inlineData: {
                        data: matches[2],
                        mimeType: matches[1]
                    }
                };
            }
        }
        // Handle local file paths (e.g., /library/images/...)
        else {
            // Strip domain if present to get relative path
            let cleanUrl = imageUrl;
            try {
                if (imageUrl.startsWith('http')) {
                    const u = new URL(imageUrl);
                    cleanUrl = u.pathname;
                }
            } catch (e) {
                // ignore invalid url parse, treat as path
            }

            // CRITICAL: Strip query string (cache busting params like ?t=123)
            if (cleanUrl.includes('?')) {
                cleanUrl = cleanUrl.split('?')[0];
            }

            console.log(`[Gemini DescribeV2] Cleaned path: ${cleanUrl}`);

            if (cleanUrl.startsWith('/library/')) {
                const fullPath = resolveLibraryUrlToPath(cleanUrl, req.user);
                if (cleanUrl.includes('/videos/')) {
                    return res.status(400).json({ error: 'Video description not directly supported, use a frame.' });
                }

                console.log(`[Gemini DescribeV2] Resolved path: ${fullPath}`);

                if (fullPath && fs.existsSync(fullPath)) {
                    const imageData = fs.readFileSync(fullPath);
                    const base64Data = imageData.toString('base64');
                    const mimeType = fullPath.endsWith('.png') ? 'image/png' :
                        fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/webp';

                    imagePart = {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    };
                } else {
                    console.log(`[Gemini DescribeV2] File not found at: ${fullPath}`);
                }
            }
        }

        if (!imagePart) {
            console.log('[Gemini DescribeV2] Failed to process image part');
            return res.status(400).json({ error: 'Could not process image URL. Provide base64 data or a valid library path.', debug: { imageUrl } });
        }

        const client = getClient();
        // Correct SDK usage for @google/genai ^1.32.0
        const result = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: {
                parts: [
                    { text: prompt || "Describe this image in detail for video generation." },
                    imagePart
                ]
            }
        });

        let text = "";

        // Handle @google/genai SDK response structure
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                text = candidate.content.parts[0].text || "";
            }
        }
        // Fallback for other potential response shapes
        else if (result.response && typeof result.response.text === 'function') {
            text = result.response.text();
        }

        if (!text) {
            console.warn('[Gemini DescribeV2] Warning: No text content found in response.');
            console.debug('[Gemini DescribeV2] Response dump:', JSON.stringify(result, null, 2));
        }

        res.json({ description: text });

    } catch (error) {
        console.error("Describe image error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Optimize a prompt for video generation
app.post('/api/gemini/optimize-prompt', async (req, res) => {
    try {
        const { prompt } = req.body;
        console.log(`[Gemini Optimize] Request received. Prompt: ${prompt ? (prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt) : 'missing'}`);

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const systemInstruction = "You are an expert video prompt engineer. Your goal is to rewrite the user's prompt to be descriptive, visual, and optimized for AI video generation models like Veo, Kling, and Hailuo. detailed, cinematic, and focused on motion and atmosphere. Keep it under 60 words. Output ONLY the rewritten prompt.";

        const aiProviderConfig = getAiProviderConfig(process.env, req.app.locals);
        if (isApimartTextConfigured(aiProviderConfig)) {
            const data = await createTextResponse([
                {
                    role: 'system',
                    content: systemInstruction
                },
                {
                    role: 'user',
                    content: `User Prompt: ${prompt}`
                }
            ], { config: aiProviderConfig });

            const optimized = extractResponseText(data).trim().replace(/^["']|["']$/g, '');
            if (!optimized) {
                return res.status(500).json({ error: 'Failed to optimize prompt' });
            }

            return res.json({ optimizedPrompt: optimized });
        }

        const client = getClient();

        const result = await client.models.generateContent({
            model: "gemini-2.0-flash",
            contents: {
                parts: [
                    { text: `${systemInstruction}\n\nUser Prompt: ${prompt}` }
                ]
            }
        });

        let text = "";

        // Handle @google/genai SDK response structure
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                text = candidate.content.parts[0].text || "";
            }
        }
        // Fallback for other potential response shapes
        else if (result.response && typeof result.response.text === 'function') {
            text = result.response.text();
        }

        if (!text) {
            console.warn('[Gemini Optimize] Warning: No text content found in response.');
            return res.status(500).json({ error: 'Failed to optimize prompt' });
        }

        // Clean up text (remove quotes if present)
        text = text.trim().replace(/^["']|["']$/g, '');

        res.json({ optimizedPrompt: text });

    } catch (error) {
        console.error("Optimize prompt error:", error);
        res.status(500).json({ error: error.message });
    }
});

// NOTE: Old generation routes removed - now in server/routes/generation.js


// ============================================================================
// ASSET HISTORY API
// ============================================================================

// Save an asset (image or video)
app.post('/api/assets/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { data, prompt } = req.body;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const targetDir = type === 'images' ? libraryDirs.imagesDir : libraryDirs.videosDir;
        const id = Date.now().toString();
        const ext = type === 'images' ? 'png' : 'mp4';
        const filename = `${id}.${ext}`;
        const metaFilename = `${id}.json`;

        // Save the asset file
        const base64Data = data.replace(/^data:[^;]+;base64,/, '');
        const assetPath = path.join(targetDir, filename);
        fs.writeFileSync(assetPath, base64Data, 'base64');

        // Save metadata
        const metadata = {
            id,
            filename,
            prompt: prompt || '',
            createdAt: new Date().toISOString(),
            type
        };
        fs.writeFileSync(path.join(targetDir, metaFilename), JSON.stringify(metadata, null, 2));

        res.json({ success: true, id, filename, url: getLibraryUrlFromPath(assetPath) });
    } catch (error) {
        console.error('Save asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List all assets of a type (with pagination support)
app.get('/api/assets/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const limit = parseInt(req.query.limit) || 0; // 0 = no limit (backward compatible)
        const offset = parseInt(req.query.offset) || 0;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const targetDir = type === 'images' ? libraryDirs.imagesDir : libraryDirs.videosDir;
        const legacyDir = type === 'images' ? IMAGES_DIR : VIDEOS_DIR;
        const assets = listMediaMetadata({ user: req.user, type, primaryDir: targetDir, legacyDir });

        // Sort by createdAt descending (newest first)
        assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // If limit is specified, return paginated response
        if (limit > 0) {
            const paginatedAssets = assets.slice(offset, offset + limit);
            return res.json({
                assets: paginatedAssets,
                total: assets.length,
                hasMore: offset + limit < assets.length
            });
        }

        // Backward compatible: return full array if no limit specified
        res.json(assets);
    } catch (error) {
        console.error('List assets error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete an asset
app.delete('/api/assets/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;

        if (!['images', 'videos'].includes(type)) {
            return res.status(400).json({ error: 'Invalid asset type' });
        }

        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const targetDir = type === 'images' ? libraryDirs.imagesDir : libraryDirs.videosDir;
        let metaPath = path.join(targetDir, `${id}.json`);
        if (!fs.existsSync(metaPath) && canUseLegacyRootLibrary(req.user)) {
            const legacyDir = type === 'images' ? IMAGES_DIR : VIDEOS_DIR;
            const legacyMetaPath = path.join(legacyDir, `${id}.json`);
            if (fs.existsSync(legacyMetaPath)) {
                metaPath = legacyMetaPath;
            }
        }
        const assetDir = path.dirname(metaPath);

        // Read metadata to get the actual filename (may differ from ID)
        let assetFilename = null;
        if (fs.existsSync(metaPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                assetFilename = metadata.filename;
            } catch (e) {
                console.warn(`Could not read metadata for ${id}:`, e.message);
            }
        }

        // Delete the media file using filename from metadata
        if (assetFilename) {
            const assetPath = path.join(assetDir, assetFilename);
            if (fs.existsSync(assetPath)) {
                fs.unlinkSync(assetPath);
                console.log(`Deleted asset file: ${assetPath}`);
            }
        }

        // Delete the metadata file
        if (fs.existsSync(metaPath)) {
            fs.unlinkSync(metaPath);
            console.log(`Deleted metadata file: ${metaPath}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete asset error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// TIKTOK IMPORT API
// ============================================================================

/**
 * Import a TikTok video without watermark
 * Downloads the video, optionally trims first/last frames, saves to library
 */
app.post('/api/tiktok/import', async (req, res) => {
    try {
        const { url, enableTrim = true } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'TikTok URL is required' });
        }

        if (!isValidTikTokUrl(url)) {
            return res.status(400).json({ error: 'Invalid TikTok URL format. Please provide a valid TikTok video URL.' });
        }

        console.log(`[TikTok API] Processing import request for: ${url}`);

        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const result = await processTikTokVideo(url, libraryDirs.videosDir, enableTrim);

        res.json(result);
    } catch (error) {
        console.error('[TikTok API] Import error:', error);
        res.status(500).json({
            error: error.message || 'Failed to import TikTok video',
            details: error.toString()
        });
    }
});

/**
 * Validate a TikTok URL without downloading
 */
app.post('/api/tiktok/validate', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ valid: false, error: 'URL is required' });
        }

        const valid = isValidTikTokUrl(url);
        res.json({ valid, url });
    } catch (error) {
        res.status(500).json({ valid: false, error: error.message });
    }
});

// ============================================================================
// VIDEO TRIM API
// ============================================================================

/**
 * Check if FFmpeg is available on the system
 */
async function isFFmpegAvailable() {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ['-version'], { shell: true });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

/**
 * Trim a video using FFmpeg
 * @param {string} inputPath - Input video path
 * @param {string} outputPath - Output video path
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 */
async function trimVideoWithFFmpeg(inputPath, outputPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
        const duration = endTime - startTime;

        if (duration <= 0) {
            reject(new Error('Invalid trim range: end time must be greater than start time'));
            return;
        }

        const args = [
            '-y',                           // Overwrite output
            '-i', inputPath,                // Input file
            '-ss', startTime.toString(),    // Start time
            '-t', duration.toString(),      // Duration
            '-c:v', 'libx264',              // Video codec
            '-c:a', 'aac',                  // Audio codec
            '-preset', 'fast',              // Encoding speed
            '-crf', '23',                   // Quality (lower = better)
            outputPath                       // Output file
        ];

        console.log(`[Video Trim] Running FFmpeg with args:`, args.join(' '));

        const proc = spawn('ffmpeg', args, { shell: true });

        let stderr = '';
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log(`[Video Trim] Successfully trimmed video`);
                resolve();
            } else {
                reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-500)}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`FFmpeg error: ${err.message}`));
        });
    });
}

/**
 * Trim a video and save to library
 * Accepts video URL (from library), start/end times, and saves trimmed video
 */
app.post('/api/trim-video', async (req, res) => {
    try {
        const { videoUrl, startTime, endTime, nodeId } = req.body;

        if (!videoUrl || startTime === undefined || endTime === undefined) {
            return res.status(400).json({ error: 'videoUrl, startTime, and endTime are required' });
        }

        console.log(`[Video Trim] Request: ${videoUrl}, ${startTime}s to ${endTime}s`);

        // Check if FFmpeg is available
        const ffmpegAvailable = await isFFmpegAvailable();
        if (!ffmpegAvailable) {
            return res.status(500).json({
                error: 'FFmpeg is not installed. Video trimming requires FFmpeg to be installed on the server.'
            });
        }

        // Strip query string from URL (e.g., ?t=123456 cache busters)
        const cleanVideoUrl = videoUrl.split('?')[0];

        // Resolve video path from URL
        let inputPath;
        if (cleanVideoUrl.startsWith('/library/')) {
            inputPath = resolveLibraryUrlToPath(cleanVideoUrl, req.user);
        } else if (cleanVideoUrl.startsWith('http')) {
            // For remote URLs, we'd need to download first - for now, only local library videos
            return res.status(400).json({ error: 'Only local library videos can be trimmed' });
        } else {
            return res.status(400).json({ error: 'Invalid video URL format' });
        }

        // Check if input file exists
        if (!inputPath || !fs.existsSync(inputPath)) {
            console.error(`[Video Trim] Input file not found: ${inputPath}`);
            return res.status(404).json({ error: 'Source video not found' });
        }

        // Generate unique output filename
        const timestamp = Date.now();
        const hash = crypto.randomBytes(4).toString('hex');
        const outputFilename = `trimmed_${timestamp}_${hash}.mp4`;
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const outputPath = path.join(libraryDirs.videosDir, outputFilename);

        // Trim the video
        await trimVideoWithFFmpeg(inputPath, outputPath, startTime, endTime);

        // Save metadata for history panel
        const id = `${timestamp}_${hash}`;
        const metaFilename = `${id}.json`;
        const metadata = {
            id,
            filename: outputFilename,
            prompt: `Trimmed video (${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s)`,
            model: 'video-editor',
            sourceUrl: videoUrl,
            trimStart: startTime,
            trimEnd: endTime,
            createdAt: new Date().toISOString(),
            type: 'videos'
        };
        fs.writeFileSync(path.join(libraryDirs.videosDir, metaFilename), JSON.stringify(metadata, null, 2));

        const resultUrl = getLibraryUrlFromPath(outputPath);
        console.log(`[Video Trim] Saved: ${resultUrl}`);

        res.json({
            success: true,
            url: resultUrl,
            filename: outputFilename,
            duration: endTime - startTime
        });

    } catch (error) {
        console.error('[Video Trim] Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to trim video',
            details: error.toString()
        });
    }
});

// ============================================================================
// CHAT AGENT API
// NOTE: Currently using LangGraph.js. If more complex agent capabilities
// are needed (multi-agent, advanced tools), consider migrating to Python.
// ============================================================================

// Send a message to the chat agent
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, message, media } = req.body;

        const aiProviderConfig = getAiProviderConfig(process.env, req.app.locals);
        const chatApiKey = isApimartTextConfigured(aiProviderConfig)
            ? aiProviderConfig.apimart.apiKey
            : (aiProviderConfig.legacy.chatApiKey || API_KEY);

        if (!chatApiKey) {
            return res.status(500).json({
                error: "Server missing AI text config. Add APIMART_API_KEY or fallback CHAT_API_KEY to .env and restart the server."
            });
        }

        if (!sessionId) {
            return res.status(400).json({ error: "sessionId is required" });
        }

        if (!message && !media) {
            return res.status(400).json({ error: "message or media is required" });
        }

        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const result = await chatAgent.sendMessage(sessionId, message, media, chatApiKey, {
            chatsDir: libraryDirs.chatsDir,
            user: req.user
        });

        res.json({
            success: true,
            response: result.response,
            topic: result.topic,
            messageCount: result.messageCount
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        res.status(500).json({ error: error.message || "Chat failed" });
    }
});

// List all chat sessions
app.get('/api/chat/sessions', async (req, res) => {
    try {
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const sessions = chatAgent.listSessions({ chatsDir: libraryDirs.chatsDir });
        res.json(sessions);
    } catch (error) {
        console.error("List sessions error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a chat session
app.delete('/api/chat/sessions/:id', async (req, res) => {
    try {
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        chatAgent.deleteSession(req.params.id, { chatsDir: libraryDirs.chatsDir });
        res.json({ success: true });
    } catch (error) {
        console.error("Delete session error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get full session data (for loading a specific chat)
app.get('/api/chat/sessions/:id', async (req, res) => {
    try {
        const libraryDirs = req.library || ensureUserLibraryDirs(req.user);
        const sessionData = chatAgent.getSessionData(req.params.id, { chatsDir: libraryDirs.chatsDir });
        if (!sessionData) {
            return res.status(404).json({ error: "Session not found" });
        }
        res.json(sessionData);
    } catch (error) {
        console.error("Get session error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));

    // Handle SPA routing without intercepting API or library routes.
    app.use((req, res, next) => {
        if (
            !['GET', 'HEAD'].includes(req.method) ||
            req.path.startsWith('/api/') ||
            req.path === '/api' ||
            req.path.startsWith('/library/') ||
            req.path === '/library'
        ) {
            return next();
        }

        return res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, HOST, () => {
    console.log(`Backend server running on http://${HOST}:${PORT}`);
});
