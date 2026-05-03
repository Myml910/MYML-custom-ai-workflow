/**
 * customApi.js
 *
 * Adapter for your internal / domestic model aggregation API.
 */

const MAX_IMAGE_REFERENCES = 6;
const NANO_BANANA_FLASH_MODEL_ID = 'custom-image-nano-banana-3-1-flash';
const DEFAULT_NANO_BANANA_FLASH_VENDOR_MODEL = 'gemini-3.1-flash-image-preview';
const NANO_BANANA_ALLOWED_ASPECT_RATIOS = new Set([
    '4:3',
    '3:4',
    '16:9',
    '9:16',
    '2:3',
    '3:2',
    '1:1',
    '4:5',
    '5:4',
    '21:9',
    '1:4',
    '4:1',
    '8:1',
    '1:8'
]);

async function downloadToBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download result from custom API URL: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function base64ToBuffer(base64) {
    const clean = base64.includes(',') ? base64.split(',').pop() : base64;
    return Buffer.from(clean, 'base64');
}

function base64ToBlob(base64) {
    const cleanBase64 = base64.includes(',')
        ? base64.split(',').pop()
        : base64;

    const buffer = Buffer.from(cleanBase64, 'base64');
    return new Blob([buffer], { type: 'image/png' });
}

function mapGptImage2Size(aspectRatio, resolution) {
    if (aspectRatio && /^\d+x\d+$/.test(aspectRatio)) {
        return aspectRatio;
    }

    const ratio = aspectRatio || 'Auto';
    const res = (resolution || 'Auto').toLowerCase();

    if (ratio === 'Auto' || res === 'auto') {
        return 'auto';
    }

    if (res === '4k') {
        if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3' || ratio === '4:5') return '2160x3840';
        if (ratio === '16:9' || ratio === '21:9' || ratio === '4:3' || ratio === '3:2') return '3840x2160';
        return '2048x2048';
    }

    if (res === '2k') {
        if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3' || ratio === '4:5') return '1152x2048';
        if (ratio === '16:9' || ratio === '21:9' || ratio === '4:3' || ratio === '3:2') return '2048x1152';
        return '2048x2048';
    }

    if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3' || ratio === '4:5') return '1024x1536';
    if (ratio === '16:9' || ratio === '21:9' || ratio === '4:3' || ratio === '3:2') return '1536x1024';
    return '1024x1024';
}

function getCustomVendorModel(modelId) {
    if (isNanoBananaFlashModel(modelId)) {
        return getNanoBananaVendorModel();
    }
    return modelId.replace('custom-image-', '');
}

function getNanoBananaVendorModel() {
    return process.env.CUSTOM_NANO_BANANA_MODEL || DEFAULT_NANO_BANANA_FLASH_VENDOR_MODEL;
}

function isNanoBananaFlashModel(modelId) {
    return modelId === NANO_BANANA_FLASH_MODEL_ID || modelId?.startsWith(`${NANO_BANANA_FLASH_MODEL_ID}-`);
}

function mapNanoBananaAspectRatio(aspectRatio) {
    if (!aspectRatio || aspectRatio === 'Auto') return undefined;
    return NANO_BANANA_ALLOWED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : undefined;
}

function mapNanoBananaImageSize(resolution) {
    if (!resolution || resolution === 'Auto') return undefined;

    const normalized = String(resolution).toUpperCase();
    if (normalized === '1K' || normalized === '2K' || normalized === '4K' || normalized === '512') {
        return normalized;
    }
    return undefined;
}

function pickImageResult(data) {
    return (
        data.image_url ||
        data.imageUrl ||
        data.url ||
        data.result_url ||
        data.resultUrl ||
        data?.data?.[0]?.url ||
        data?.data?.[0]?.image_url ||
        data?.data?.[0]?.imageUrl
    );
}

function pickImageBase64(data) {
    return (
        data.image_base64 ||
        data.imageBase64 ||
        data.b64_json ||
        data?.data?.[0]?.b64_json ||
        data?.data?.[0]?.image_base64 ||
        data?.data?.[0]?.imageBase64
    );
}

function pickVideoResult(data) {
    return (
        data.video_url ||
        data.videoUrl ||
        data.url ||
        data.result_url ||
        data.resultUrl ||
        data?.data?.[0]?.url ||
        data?.data?.[0]?.video_url ||
        data?.data?.[0]?.videoUrl
    );
}

export async function generateCustomImage({
    prompt,
    imageBase64,
    aspectRatio,
    resolution,
    modelId,
    apiBaseUrl,
    apiKey
}) {
    const isNanoBananaFlash = isNanoBananaFlashModel(modelId);
    const effectiveApiBaseUrl = isNanoBananaFlash
        ? (process.env.CUSTOM_NANO_BANANA_BASE_URL || apiBaseUrl)
        : apiBaseUrl;
    const effectiveApiKey = isNanoBananaFlash
        ? (process.env.CUSTOM_NANO_BANANA_API_KEY || apiKey)
        : apiKey;

    if (!effectiveApiBaseUrl) {
        throw new Error(isNanoBananaFlash
            ? 'CUSTOM_NANO_BANANA_BASE_URL or CUSTOM_API_BASE_URL is not configured'
            : 'CUSTOM_API_BASE_URL is not configured');
    }
    if (!effectiveApiKey) {
        throw new Error(isNanoBananaFlash
            ? 'CUSTOM_NANO_BANANA_API_KEY or CUSTOM_API_KEY is not configured'
            : 'CUSTOM_API_KEY is not configured');
    }

    const baseUrl = effectiveApiBaseUrl.replace(/\/$/, '');
    const projectModel = modelId;
    const model = getCustomVendorModel(modelId);

    const images = Array.isArray(imageBase64) ? imageBase64 : imageBase64 ? [imageBase64] : [];
    const imageBase64Array = images.filter(Boolean).slice(0, MAX_IMAGE_REFERENCES);

    if (isNanoBananaFlash) {
        const endpoint = `${baseUrl}/v1/images/edits`;
        const form = new FormData();
        const vendorModel = getNanoBananaVendorModel();
        const aspect_ratio = mapNanoBananaAspectRatio(aspectRatio);
        const image_size = mapNanoBananaImageSize(resolution);
        const imageInputNames = imageBase64Array.map((_, idx) => `input_${idx + 1}.png`);
        const usingDedicatedNanoBananaKey = Boolean(process.env.CUSTOM_NANO_BANANA_API_KEY);

        form.append('model', vendorModel);
        form.append('prompt', prompt);
        form.append('response_format', 'b64_json');
        if (aspect_ratio) {
            form.append('aspect_ratio', aspect_ratio);
        }
        if (image_size) {
            form.append('image_size', image_size);
        }

        imageBase64Array.forEach((base64, idx) => {
            const imageBlob = base64ToBlob(base64);
            form.append('image', imageBlob, imageInputNames[idx]);
        });

        console.log('[CustomAPI][nano banana image edit request]', {
            endpoint,
            baseUrl,
            projectModel,
            vendorModel,
            usingDedicatedNanoBananaKey,
            prompt,
            hasImage: imageBase64Array.length > 0,
            imageCount: imageBase64Array.length,
            imageBase64Lengths: imageBase64Array.map(base64 => base64.length),
            imageInputNames,
            aspect_ratio,
            image_size,
            response_format: 'b64_json'
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${effectiveApiKey}`
            },
            body: form
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Custom nano banana edits API failed: ${response.status} ${response.statusText} ${text}`);
        }

        const data = await response.json();

        const base64 = pickImageBase64(data);
        if (base64) return base64ToBuffer(base64);

        const resultUrl = pickImageResult(data);
        if (resultUrl) {
            if (typeof resultUrl === 'string' && resultUrl.startsWith('data:')) {
                return base64ToBuffer(resultUrl);
            }
            return await downloadToBuffer(resultUrl);
        }

        throw new Error(`Custom nano banana edits API returned unsupported response: ${JSON.stringify(data).slice(0, 800)}`);
    }

    if (imageBase64Array.length > 0) {
        const endpoint = `${baseUrl}/v1/images/edits`;
        const form = new FormData();
        const size = mapGptImage2Size(aspectRatio, resolution);

        form.append('model', model);
        form.append('prompt', prompt);
        form.append('size', size);
        form.append('response_format', 'b64_json');

        imageBase64Array.forEach((base64, idx) => {
            const imageBlob = base64ToBlob(base64);
            form.append('image', imageBlob, `input_${idx + 1}.png`);
        });

        console.log('[CustomAPI][gpt-image-2 edits request]', {
            endpoint,
            model,
            prompt,
            hasImage: true,
            imageCount: imageBase64Array.length,
            imageBase64Lengths: imageBase64Array.map(base64 => base64.length),
            appendedImageNames: imageBase64Array.map((_, idx) => `input_${idx + 1}.png`),
            size,
            response_format: 'b64_json'
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${effectiveApiKey}`
            },
            body: form
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Custom gpt-image-2 edits API failed: ${response.status} ${response.statusText} ${text}`);
        }

        const data = await response.json();

        const base64 = pickImageBase64(data);
        if (base64) return base64ToBuffer(base64);

        const resultUrl = pickImageResult(data);
        if (resultUrl) {
            if (typeof resultUrl === 'string' && resultUrl.startsWith('data:')) {
                return base64ToBuffer(resultUrl);
            }
            return await downloadToBuffer(resultUrl);
        }

        throw new Error(`Custom gpt-image-2 edits API returned unsupported response: ${JSON.stringify(data).slice(0, 800)}`);
    }

    // No reference image: keep the existing text-to-image generation endpoint.
    const endpoint = `${baseUrl}/v1/images/generations`;
    const requestBody = {
        model,
        prompt,
        size: mapGptImage2Size(aspectRatio, resolution),
        n: 1,
        response_format: 'b64_json'
    };

    console.log('[CustomAPI][image generation request]', {
        endpoint,
        model: requestBody.model,
        prompt: requestBody.prompt,
        size: requestBody.size,
        response_format: requestBody.response_format,
        hasImage: false
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Custom image API failed: ${response.status} ${response.statusText} ${text}`);
    }

    const data = await response.json();

    const base64 = pickImageBase64(data);
    if (base64) return base64ToBuffer(base64);

    const resultUrl = pickImageResult(data);
    if (resultUrl) {
        if (typeof resultUrl === 'string' && resultUrl.startsWith('data:')) {
            return base64ToBuffer(resultUrl);
        }
        return await downloadToBuffer(resultUrl);
    }

    throw new Error(`Custom image API returned unsupported response: ${JSON.stringify(data).slice(0, 800)}`);
}
export async function generateCustomVideo({
    prompt,
    imageBase64,
    lastFrameBase64,
    aspectRatio,
    resolution,
    duration,
    modelId,
    apiBaseUrl,
    apiKey
}) {
    if (!apiBaseUrl) throw new Error('CUSTOM_API_BASE_URL is not configured');
    if (!apiKey) throw new Error('CUSTOM_API_KEY is not configured');

    const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/generate-video`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelId,
            prompt,
            image_base64: imageBase64,
            last_frame_base64: lastFrameBase64,
            aspect_ratio: aspectRatio,
            resolution,
            duration
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Custom video API failed: ${response.status} ${response.statusText} ${text}`);
    }

    const data = await response.json();

    const resultUrl = pickVideoResult(data);
    if (resultUrl) return await downloadToBuffer(resultUrl);

    throw new Error(`Custom video API returned unsupported response: ${JSON.stringify(data).slice(0, 800)}`);
}
