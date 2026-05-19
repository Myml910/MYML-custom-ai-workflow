import { FALLBACK_IMAGE_MODELS, ImageModelOption, normalizeImageModelOption } from '../config/imageModels';

interface ImageModelsResponse {
    models?: unknown[];
}

let cachedImageModels: ImageModelOption[] | null = null;
let pendingImageModelsRequest: Promise<ImageModelOption[]> | null = null;

async function readJsonResponse(response: Response): Promise<ImageModelsResponse> {
    return response.json().catch(() => ({}));
}

export async function fetchImageModels({ force = false } = {}): Promise<ImageModelOption[]> {
    if (!force && cachedImageModels) return cachedImageModels;
    if (!force && pendingImageModelsRequest) return pendingImageModelsRequest;

    pendingImageModelsRequest = (async () => {
        const response = await fetch('/api/models/image', {
            credentials: 'include'
        });

        const data = await readJsonResponse(response);
        if (!response.ok) {
            throw new Error((data as any).error || response.statusText);
        }

        const models = Array.isArray(data.models)
            ? data.models.map(normalizeImageModelOption).filter(model => model.id && model.enabled !== false)
            : [];

        if (models.length === 0) {
            throw new Error('No available image models returned from server.');
        }

        cachedImageModels = models;
        return models;
    })();

    try {
        return await pendingImageModelsRequest;
    } finally {
        pendingImageModelsRequest = null;
    }
}

export function getFallbackImageModels(): ImageModelOption[] {
    return FALLBACK_IMAGE_MODELS;
}
