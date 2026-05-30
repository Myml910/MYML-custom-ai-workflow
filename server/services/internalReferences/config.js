import path from 'path';

const DEFAULT_MANIFEST_PATH = 'server/internal-references/manifest.sample.json';
const DEFAULT_REFERENCE_ROOT = 'library/internal-references';
const DEFAULT_MAX_IMAGES = 2;
const DEFAULT_IMAGE_MODEL_ID = 'custom-image-t8-gpt-image-2-edit';

function isEnabledFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveWorkspacePath(value, fallback) {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    return path.resolve(process.cwd(), raw);
}

export function getInternalReferenceConfig(env = process.env) {
    return {
        enabled: isEnabledFlag(env.INTERNAL_REFERENCE_LOOKUP_ENABLED),
        manifestPath: resolveWorkspacePath(env.INTERNAL_REFERENCE_MANIFEST_PATH, DEFAULT_MANIFEST_PATH),
        rootPath: resolveWorkspacePath(env.INTERNAL_REFERENCE_ROOT, DEFAULT_REFERENCE_ROOT),
        maxImages: parsePositiveInteger(env.INTERNAL_REFERENCE_MAX_IMAGES, DEFAULT_MAX_IMAGES),
        useImageInput: isEnabledFlag(env.INTERNAL_REFERENCE_USE_IMAGE_INPUT),
        imageModelId: typeof env.INTERNAL_REFERENCE_IMAGE_MODEL_ID === 'string' && env.INTERNAL_REFERENCE_IMAGE_MODEL_ID.trim()
            ? env.INTERNAL_REFERENCE_IMAGE_MODEL_ID.trim()
            : DEFAULT_IMAGE_MODEL_ID
    };
}
