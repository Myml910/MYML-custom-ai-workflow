import fs from 'fs';
import path from 'path';
import { imageResultToBuffer } from '../services/ai/providers/apimartProvider.js';
import { saveBufferToFile } from './imageHelpers.js';
import { ensureUserLibraryDirs } from './userLibrary.js';

function normalizeExtension(extension, fallback = 'png') {
    const value = String(extension || fallback || 'png')
        .trim()
        .toLowerCase()
        .replace(/^\./, '');

    if (value === 'jpeg') return 'jpg';
    return /^[a-z0-9]{1,12}$/.test(value) ? value : fallback;
}

function getImageMimeType(imageResult) {
    return imageResult?.images?.[0]?.mimeType || '';
}

function getExtensionFromMimeType(mimeType) {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    return 'png';
}

function getExtensionFromUrl(url) {
    if (!url || typeof url !== 'string' || url.startsWith('data:')) return null;

    try {
        const pathname = new URL(url).pathname;
        const ext = path.extname(pathname).replace(/^\./, '');
        return ext || null;
    } catch {
        const cleanUrl = url.split('?')[0];
        const ext = path.extname(cleanUrl).replace(/^\./, '');
        return ext || null;
    }
}

function getFirstImageUrl(imageResult) {
    const image = imageResult?.images?.[0];
    if (!image) return null;
    if (image.url) return image.url;
    if (image.base64) {
        const mimeType = image.mimeType || 'image/png';
        return `data:${mimeType};base64,${image.base64}`;
    }
    return null;
}

function getImageExtension({ imageResult, imageFormat, remoteUrl }) {
    if (imageFormat) {
        return normalizeExtension(imageFormat);
    }

    const mimeType = getImageMimeType(imageResult);
    if (mimeType) {
        return getExtensionFromMimeType(mimeType);
    }

    return normalizeExtension(getExtensionFromUrl(remoteUrl), 'png');
}

export async function saveGeneratedImage(options = {}) {
    const {
        user,
        imageResult,
        buffer,
        prompt,
        model,
        provider,
        providerTaskId,
        taskId,
        nodeId,
        workflowId,
        metadataId,
        type = 'images',
        remoteUrl,
        imageFormat
    } = options;

    const imageBuffer = buffer || await imageResultToBuffer(imageResult);
    const providerRemoteUrl = remoteUrl || getFirstImageUrl(imageResult);
    const libraryDirs = ensureUserLibraryDirs(user);
    const extension = getImageExtension({ imageResult, imageFormat, remoteUrl: providerRemoteUrl });
    const saved = saveBufferToFile(imageBuffer, libraryDirs.imagesDir, 'img', extension);
    const savedMetadataId = metadataId || nodeId || saved.id;
    const metadataRemoteUrl = providerRemoteUrl && !providerRemoteUrl.startsWith('data:')
        ? providerRemoteUrl
        : undefined;
    const metadata = {
        id: savedMetadataId,
        filename: saved.filename,
        prompt: prompt || '',
        model: model || '',
        createdAt: new Date().toISOString(),
        type,
        taskId: taskId || undefined,
        nodeId: nodeId || undefined,
        workflowId: workflowId || undefined,
        userId: user?.id || undefined,
        username: user?.username || undefined,
        provider: provider || undefined,
        providerTaskId: providerTaskId || undefined,
        remoteUrl: metadataRemoteUrl
    };

    fs.writeFileSync(
        path.join(libraryDirs.imagesDir, `${savedMetadataId}.json`),
        JSON.stringify(metadata, null, 2)
    );

    return {
        resultUrl: saved.url,
        filename: saved.filename,
        filePath: saved.path,
        metadata
    };
}
