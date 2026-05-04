const DEFAULT_SEEDANCE_MODEL = 'doubao-seedance-2-0-260128';
const SEEDANCE_MODEL_ID = 'custom-video-seedance-2-0';
const SEEDANCE_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', '9:21', 'keep_ratio', 'adaptive']);
const SEEDANCE_RESOLUTIONS = new Set(['480p', '720p', '1080p']);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getSeedanceConfig(apiBaseUrl, apiKey) {
    const baseUrl = process.env.CUSTOM_SEEDANCE_BASE_URL || apiBaseUrl;
    const key = process.env.CUSTOM_SEEDANCE_API_KEY || apiKey;

    if (!baseUrl) {
        throw new Error('CUSTOM_SEEDANCE_BASE_URL or CUSTOM_API_BASE_URL is not configured');
    }
    if (!key) {
        throw new Error('CUSTOM_SEEDANCE_API_KEY or CUSTOM_API_KEY is not configured');
    }

    return {
        baseUrl: baseUrl.replace(/\/$/, ''),
        apiKey: key,
        vendorModel: process.env.CUSTOM_SEEDANCE_MODEL || DEFAULT_SEEDANCE_MODEL,
        usingDedicatedSeedanceKey: Boolean(process.env.CUSTOM_SEEDANCE_API_KEY)
    };
}

function mapSeedanceDuration(duration) {
    return duration === 10 ? 10 : 5;
}

function mapSeedanceResolution(resolution) {
    return SEEDANCE_RESOLUTIONS.has(resolution) ? resolution : '720p';
}

function mapSeedanceRatio(aspectRatio, hasImages) {
    if (aspectRatio && aspectRatio !== 'Auto' && SEEDANCE_RATIOS.has(aspectRatio)) {
        return aspectRatio;
    }
    return hasImages ? 'keep_ratio' : '16:9';
}

function getPublicBaseUrl() {
    return process.env.CUSTOM_SEEDANCE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.SERVER_PUBLIC_URL;
}

function toSeedanceImageUrl(input) {
    if (!input) return null;
    if (input.startsWith('http://') || input.startsWith('https://')) return input;
    if (input.startsWith('/library/')) {
        const publicBaseUrl = getPublicBaseUrl();
        if (!publicBaseUrl) {
            throw new Error('Seedance image inputs require PUBLIC_BASE_URL, SERVER_PUBLIC_URL, or CUSTOM_SEEDANCE_PUBLIC_BASE_URL for /library images');
        }
        return new URL(input, publicBaseUrl).toString();
    }
    if (input.startsWith('data:')) {
        throw new Error('Seedance requires image URLs. Save the input image to /library and configure PUBLIC_BASE_URL or CUSTOM_SEEDANCE_PUBLIC_BASE_URL.');
    }
    return input;
}

async function downloadToBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download Seedance output video: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function submitSeedanceTask({ prompt, images, duration, resolution, ratio, generateAudio, apiBaseUrl, apiKey }) {
    const { baseUrl, apiKey: effectiveApiKey, vendorModel, usingDedicatedSeedanceKey } = getSeedanceConfig(apiBaseUrl, apiKey);
    const endpoint = `${baseUrl}/v2/videos/generations`;
    const body = {
        prompt,
        model: vendorModel,
        duration,
        resolution,
        ratio,
        watermark: false,
        camerafixed: false,
        return_last_frame: false,
        generate_audio: Boolean(generateAudio)
    };

    if (images.length > 0) body.images = images;

    console.log('[Seedance][submit request]', {
        endpoint,
        baseUrl,
        projectModel: SEEDANCE_MODEL_ID,
        vendorModel,
        prompt,
        hasImages: images.length > 0,
        imageCount: images.length,
        images,
        duration,
        resolution,
        ratio,
        watermark: false,
        camerafixed: false,
        return_last_frame: false,
        generate_audio: Boolean(generateAudio),
        usingDedicatedSeedanceKey
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Seedance submit failed: ${response.status} ${response.statusText} ${text}`);
    }

    const data = await response.json();
    if (!data.task_id) {
        throw new Error(`Seedance submit returned no task_id: ${JSON.stringify(data).slice(0, 800)}`);
    }

    console.log('[Seedance][submit response]', { task_id: data.task_id });
    return { taskId: data.task_id, baseUrl, apiKey: effectiveApiKey };
}

async function pollSeedanceTask({ taskId, baseUrl, apiKey }) {
    const endpoint = `${baseUrl}/v2/videos/generations/${encodeURIComponent(taskId)}`;

    for (let attempt = 1; attempt <= 120; attempt += 1) {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` }
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Seedance poll failed: ${response.status} ${response.statusText} ${text}`);
        }

        const data = await response.json();
        const outputUrl = data?.data?.output;
        console.log('[Seedance][poll response]', {
            task_id: taskId,
            status: data.status,
            progress: data.progress,
            hasOutput: Boolean(outputUrl),
            outputUrl
        });

        if (data.status === 'SUCCESS') {
            if (!outputUrl) throw new Error(`Seedance task succeeded without data.output: ${JSON.stringify(data).slice(0, 800)}`);
            return outputUrl;
        }

        if (data.status === 'FAILURE') {
            console.log('[Seedance][failure]', { task_id: taskId, fail_reason: data.fail_reason });
            throw new Error(data.fail_reason || 'Seedance task failed');
        }

        await sleep(5000);
    }

    throw new Error(`Seedance task timed out after polling: ${taskId}`);
}

export async function generateSeedanceVideo({ prompt, imageUrl, lastFrameUrl, aspectRatio, resolution, duration, generateAudio, apiBaseUrl, apiKey }) {
    const images = [imageUrl, lastFrameUrl].filter(Boolean).slice(0, 2).map(toSeedanceImageUrl);
    const mappedDuration = mapSeedanceDuration(duration);
    const mappedResolution = mapSeedanceResolution(resolution);
    const mappedRatio = mapSeedanceRatio(aspectRatio, images.length > 0);
    const submitted = await submitSeedanceTask({
        prompt,
        images,
        duration: mappedDuration,
        resolution: mappedResolution,
        ratio: mappedRatio,
        generateAudio,
        apiBaseUrl,
        apiKey
    });

    const outputUrl = await pollSeedanceTask(submitted);
    const videoBuffer = await downloadToBuffer(outputUrl);
    console.log('[Seedance][success]', {
        task_id: submitted.taskId,
        outputUrl
    });
    return videoBuffer;
}
