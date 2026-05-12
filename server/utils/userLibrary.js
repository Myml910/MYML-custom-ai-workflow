import fs from 'fs';
import path from 'path';
import { LIBRARY_DIR } from '../config/paths.js';

const USER_LIBRARY_TYPES = ['assets', 'images', 'videos', 'workflows', 'chats'];
const LEGACY_ROOT_USERNAMES = new Set(['myml']);

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

function resolveInside(root, relativePath) {
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(root, relativePath);
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
        return null;
    }
    return resolvedPath;
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

    cleanPath = decodeURIComponent(cleanPath.split('?')[0]);
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
        resolvedPath = resolveInside(path.join(LIBRARY_DIR, 'users', requestedUsername), segments.slice(2).join('/'));
    } else if (allowLegacyForMyml && canUseLegacyRootLibrary(user)) {
        resolvedPath = resolveInside(LIBRARY_DIR, relativePath);
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
                const filePath = path.join(dir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const metadata = JSON.parse(content);
                metadata.url = getLibraryUrlFromPath(path.join(dir, metadata.filename));
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

export { USER_LIBRARY_TYPES };
