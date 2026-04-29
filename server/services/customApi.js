/**
 * customApi.js
 *
 * Adapter for your internal / domestic model aggregation API.
 */

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
    if (!apiBaseUrl) throw new Error('CUSTOM_API_BASE_URL is not configured');
    if (!apiKey) throw new Error('CUSTOM_API_KEY is not configured');

    const baseUrl = apiBaseUrl.replace(/\/$/, '');
    const model = modelId.replace('custom-image-', '');

    // =========================
    // Image-to-image / edit mode
    // =========================
    // T8star verified:
    // GPT Image 2 image editing uses /v1/images/edits.
    if (imageBase64) {
        const endpoint = `${baseUrl}/v1/images/edits`;

        const form = new FormData();
        form.append('model', model);
        form.append('prompt', prompt);

        const imageBlob = base64ToBlob(imageBase64);
        form.append('image', imageBlob, 'input.png');

        const resolvedSize = resolution && resolution !== 'Auto' ? resolution : '2k';
        form.append('size', resolvedSize);

        if (aspectRatio && aspectRatio !== 'Auto') {
        form.append('aspect_ratio', aspectRatio);
        }

        console.log('[CustomAPI][image edit request]', {
            endpoint,
            model,
            prompt,
            hasImage: true,
            imageBase64Length: imageBase64.length,
            size: resolvedSize,
            aspect_ratio: aspectRatio && aspectRatio !== 'Auto' ? aspectRatio : undefined
        });
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            body: form
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Custom image edit API failed: ${response.status} ${response.statusText} ${text}`);
        }

        const data = await response.json();

        const base64 = pickImageBase64(data);
        if (base64) return base64ToBuffer(base64);

        const resultUrl = pickImageResult(data);
        if (resultUrl) return await downloadToBuffer(resultUrl);

        throw new Error(`Custom image edit API returned unsupported response: ${JSON.stringify(data).slice(0, 800)}`);
    }

    // =========================
    // Text-to-image mode
    // =========================
    // No reference image: use /v1/images/generations.
    const endpoint = `${baseUrl}/v1/images/generations`;

    const requestBody = {
        model,
        prompt,
        size: resolution && resolution !== 'Auto' ? resolution : '2k',
        n: 1,
        ...(aspectRatio && aspectRatio !== 'Auto' ? { aspect_ratio: aspectRatio } : {})
    };

    console.log('[CustomAPI][image generation request]', {
        endpoint,
        model: requestBody.model,
        prompt: requestBody.prompt,
        size: requestBody.size,
        aspect_ratio: requestBody.aspect_ratio,
        hasImage: false
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
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
    if (resultUrl) return await downloadToBuffer(resultUrl);

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