import fs from 'fs/promises';
import path from 'path';

const MIME_BY_EXT = new Map([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.webp', 'image/webp'],
    ['.gif', 'image/gif']
]);

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isExternalUrl(value) {
    return /^https?:\/\//i.test(cleanString(value)) || /^data:/i.test(cleanString(value));
}

function isPathInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getMimeType(filePath) {
    return MIME_BY_EXT.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function resolveCandidatePath(rootPath, filePath) {
    const raw = cleanString(filePath);
    if (!raw || isExternalUrl(raw)) {
        return null;
    }

    const resolved = path.isAbsolute(raw)
        ? path.resolve(raw)
        : path.resolve(rootPath, raw);
    const normalizedRoot = path.resolve(rootPath);

    if (!isPathInside(normalizedRoot, resolved)) {
        return null;
    }
    return resolved;
}

export async function resolveInternalReferenceAsset(asset, config) {
    const resolvedPath = resolveCandidatePath(config.rootPath, asset?.filePath);
    if (!resolvedPath) {
        return null;
    }

    let stat;
    try {
        stat = await fs.stat(resolvedPath);
    } catch {
        return null;
    }
    if (!stat.isFile()) {
        return null;
    }

    try {
        const bytes = await fs.readFile(resolvedPath);
        const mimeType = getMimeType(resolvedPath);
        return {
            id: cleanString(asset.id) || null,
            dataUri: `data:${mimeType};base64,${bytes.toString('base64')}`,
            mimeType,
            byteLength: bytes.byteLength,
            productType: cleanString(asset.productType) || null,
            printMode: cleanString(asset.printMode) || null
        };
    } catch {
        return null;
    }
}
