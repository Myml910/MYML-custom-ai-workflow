import fs from 'fs/promises';

function normalizeAssetList(raw) {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.assets)) return raw.assets;
    if (Array.isArray(raw?.references)) return raw.references;
    return [];
}

export async function loadInternalReferenceManifest(config) {
    if (!config?.enabled) {
        return [];
    }

    let content;
    try {
        content = await fs.readFile(config.manifestPath, 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return [];
        }
        throw new Error('Internal reference manifest could not be read.');
    }

    try {
        const parsed = JSON.parse(content);
        return normalizeAssetList(parsed).filter(item => item && typeof item === 'object' && !Array.isArray(item));
    } catch {
        throw new Error('Internal reference manifest contains invalid JSON.');
    }
}
