import fs from 'fs';
import path from 'path';
import { LIBRARY_DIR } from '../config/paths.js';

const USER_LIBRARY_TYPES = ['assets', 'images', 'videos', 'workflows', 'chats'];
const LIBRARY_ASSET_CATEGORIES = ['Character', 'Scene', 'Item', 'Style', 'Sound Effect', 'Others'];
const LEGACY_ROOT_USERNAMES = new Set(['myml']);
const WINDOWS_RESERVED_FILENAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

export function getSafeUsername(username) {
    return String(username || 'anonymous')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/^\.+$/, '_') || 'anonymous';
}

function encodePathSegment(segment) {
    return encodeURIComponent(segment).replace(/%2F/gi, '/');
}

export function getUserLibraryRoot(user) {
    return path.join(LIBRARY_DIR, 'users', getSafeUsername(user?.username));
}

export function getUserLibraryDirs(user) {
    const rootDir = getUserLibraryRoot(user);
    return {
        rootDir,
        assetsDir: path.join(rootDir, 'assets'),
        imagesDir: path.join(rootDir, 'images'),
        videosDir: path.join(rootDir, 'videos'),
        workflowsDir: path.join(rootDir, 'workflows'),
        chatsDir: path.join(rootDir, 'chats')
    };
}

export function ensureUserLibraryDirs(user) {
    const dirs = getUserLibraryDirs(user);
    for (const dir of Object.values(dirs)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dirs;
}

export function canUseLegacyRootLibrary(user) {
    return LEGACY_ROOT_USERNAMES.has(getSafeUsername(user?.username));
}

export function getLibraryUrlFromPath(filePath) {
    const relativePath = path.relative(LIBRARY_DIR, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('File is outside library directory');
    }

    return `/library/${relativePath.split(path.sep).map(encodePathSegment).join('/')}`;
}

function isPathInside(root, targetPath) {
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(targetPath);
    const relativePath = path.relative(resolvedRoot, resolvedPath);
    return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function resolvePathInside(root, ...segments) {
    if (!root) return null;
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(resolvedRoot, ...segments);
    return isPathInside(resolvedRoot, resolvedPath) ? resolvedPath : null;
}

function hasUnsafePathSeparator(value) {
    return /[\\/]/.test(value) || value.includes('\0');
}

export function normalizeAssetCategory(category) {
    if (typeof category !== 'string') return null;
    const normalizedKey = category.trim().toLowerCase().replace(/[\s_-]+/g, '');
    return LIBRARY_ASSET_CATEGORIES.find(item =>
        item.toLowerCase().replace(/[\s_-]+/g, '') === normalizedKey
    ) || null;
}

export function normalizeLibraryRecordId(id) {
    if (typeof id !== 'string' && typeof id !== 'number') return null;
    const value = String(id).trim();
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ? value : null;
}

export function normalizeWorkflowId(id) {
    return normalizeLibraryRecordId(id);
}

export function normalizePublicWorkflowId(id) {
    if (typeof id !== 'string') return null;
    const value = id.trim();
    if (!value || value.length > 160 || hasUnsafePathSeparator(value)) return null;
    if (value === '.' || value === '..' || value.includes('\0')) return null;
    return /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,159}$/.test(value) ? value : null;
}

export function normalizeSafeFilename(filename, options = {}) {
    if (typeof filename !== 'string') return null;
    const value = filename.trim();
    if (!value || value.length > 255 || hasUnsafePathSeparator(value)) return null;
    if (/[<>:"|?*\x00-\x1F]/.test(value)) return null;
    if (value === '.' || value === '..' || value.includes('\0')) return null;

    const ext = path.extname(value).toLowerCase();
    const basename = path.basename(value, path.extname(value)).toLowerCase();
    if (!basename || WINDOWS_RESERVED_FILENAMES.has(basename)) return null;

    const allowedExtensions = options.allowedExtensions;
    if (Array.isArray(allowedExtensions)) {
        const allowed = allowedExtensions.map(item => String(item).toLowerCase());
        if (!allowed.includes(ext)) return null;
    }

    return value;
}

export function resolveLibraryUrlToPath(input, user, options = {}) {
    if (!input || typeof input !== 'string') return null;

    const {
        allowLegacyForMyml = true,
        requireExisting = true
    } = options;

    let cleanPath = input;
    try {
        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
            cleanPath = new URL(cleanPath).pathname;
        }
    } catch {
        return null;
    }

    try {
        cleanPath = decodeURIComponent(cleanPath.split('?')[0]);
    } catch {
        return null;
    }
    if (!cleanPath.startsWith('/library/')) return null;

    const relativePath = cleanPath.replace('/library/', '');
    const segments = relativePath.split('/').filter(Boolean);
    const safeUsername = getSafeUsername(user?.username);

    let resolvedPath = null;
    if (segments[0] === 'users') {
        const requestedUsername = segments[1];
        if (!requestedUsername || requestedUsername !== safeUsername) {
            return null;
        }
        resolvedPath = resolvePathInside(path.join(LIBRARY_DIR, 'users', requestedUsername), segments.slice(2).join('/'));
    } else if (allowLegacyForMyml && canUseLegacyRootLibrary(user)) {
        resolvedPath = resolvePathInside(LIBRARY_DIR, relativePath);
    }

    if (!resolvedPath) return null;
    if (requireExisting && !fs.existsSync(resolvedPath)) return null;
    return resolvedPath;
}

export function listMediaMetadata({ user, type, primaryDir, legacyDir }) {
    const entries = [];
    const scan = (dir) => {
        if (!dir || !fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const filePath = resolvePathInside(dir, file);
                if (!filePath) continue;
                const content = fs.readFileSync(filePath, 'utf8');
                const metadata = JSON.parse(content);
                const safeFilename = normalizeSafeFilename(metadata.filename);
                if (!safeFilename) continue;
                const mediaPath = resolvePathInside(dir, safeFilename);
                if (!mediaPath) continue;
                metadata.url = getLibraryUrlFromPath(mediaPath);
                metadata.type = metadata.type || type;
                entries.push(metadata);
            } catch {
                // Skip invalid metadata files.
            }
        }
    };

    scan(primaryDir);
    if (legacyDir && canUseLegacyRootLibrary(user)) {
        scan(legacyDir);
    }

    return entries;
}

export { LIBRARY_ASSET_CATEGORIES, USER_LIBRARY_TYPES };
