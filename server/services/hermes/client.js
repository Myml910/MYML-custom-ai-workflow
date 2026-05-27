import crypto from 'crypto';

const DEFAULT_HERMES_BASE_URL = 'http://127.0.0.1:8642/v1';
const DEFAULT_HERMES_MODEL = 'hermes-agent';
const DEFAULT_HERMES_TIMEOUT_MS = 180000;

const MOCK_IMAGE_URLS = [
    '/workflow-sample-1.png',
    '/day-mode-with-chat-window.png'
];

const HERMES_API_SYSTEM_PROMPT = `You are the Hermes execution gateway for MYML Canvas P1 integration.

Return exactly one JSON object. Do not use markdown. Do not explain.
The JSON object must match this schema:
{
  "status": "completed",
  "project": {
    "code": "YXF...",
    "name": "...",
    "category": "...",
    "customer": "...",
    "developmentRequirement": "...",
    "craft": "...",
    "sizeRequirement": "...",
    "quantityRequirement": 1
  },
  "strategy": {
    "selectedModel": "...",
    "reason": "...",
    "imageCount": 1,
    "size": "2K",
    "mode": "mock-pattern-generation"
  },
  "designTask": {
    "task_type": "pattern_design",
    "theme": "...",
    "prompt": "...",
    "negative_prompt": "..."
  },
  "results": [
    {
      "imageId": "mock_img_xxx",
      "url": "/workflow-sample-1.png",
      "model": "hermes-api-mock-image-strategy-v1",
      "prompt": "..."
    }
  ]
}

P1 boundaries:
- Use mock company/project fields only.
- Do not query external company systems.
- Do not generate real images.
- Use a local public mock image URL such as "/workflow-sample-1.png".
- Do not return external image URLs.`;

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanBaseUrl(value) {
    const baseUrl = cleanString(value);
    return baseUrl ? baseUrl.replace(/\/+$/, '') : undefined;
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createHermesError(code, message, status = 502) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function normalizeClientMode(value) {
    const mode = cleanString(value)?.toLowerCase();
    return mode === 'api' ? 'api' : 'mock';
}

export function getHermesClientConfig(env = process.env) {
    const mode = normalizeClientMode(env.HERMES_CLIENT_MODE);
    return {
        mode,
        baseUrl: cleanBaseUrl(env.HERMES_BASE_URL) || DEFAULT_HERMES_BASE_URL,
        apiKey: cleanString(env.HERMES_API_KEY),
        model: cleanString(env.HERMES_MODEL) || DEFAULT_HERMES_MODEL,
        timeoutMs: parsePositiveInteger(env.HERMES_TIMEOUT_MS, DEFAULT_HERMES_TIMEOUT_MS),
    };
}

export function getHermesStartupSummary(env = process.env) {
    const config = getHermesClientConfig(env);
    return {
        hermesClientMode: config.mode,
        hermesBaseUrl: config.baseUrl,
        hermesModel: config.model,
        hermesConfigured: config.mode === 'mock' || Boolean(config.apiKey),
        hermesTimeoutMs: config.timeoutMs,
    };
}

function getMockImageUrl(projectCode) {
    const index = Math.abs(
        String(projectCode || '')
            .split('')
            .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    ) % MOCK_IMAGE_URLS.length;
    return MOCK_IMAGE_URLS[index];
}

function stripJsonFence(content) {
    const text = String(content || '').trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    return fenced ? fenced[1].trim() : text;
}

function parseHermesJsonContent(content) {
    const stripped = stripJsonFence(content);
    if (!stripped) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API returned an empty response.',
            502
        );
    }

    try {
        return JSON.parse(stripped);
    } catch {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API returned non-JSON content.',
            502
        );
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateHermesP1Response(payload) {
    if (!isPlainObject(payload)) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API response must be a JSON object.',
            502
        );
    }

    const missing = [];
    if (typeof payload.status !== 'string') missing.push('status');
    if (!isPlainObject(payload.project)) missing.push('project');
    if (!isPlainObject(payload.strategy)) missing.push('strategy');
    if (!isPlainObject(payload.designTask)) missing.push('designTask');
    if (!Array.isArray(payload.results)) missing.push('results');

    if (missing.length) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            `Hermes API response is missing required field(s): ${missing.join(', ')}.`,
            502
        );
    }

    if (!payload.results.every(item => isPlainObject(item))) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API response results must be objects.',
            502
        );
    }
}

function normalizeHermesApiPayload(payload, { projectCode, envelope }) {
    validateHermesP1Response(payload);

    return {
        status: payload.status,
        hermesRequestId: payload.hermesRequestId || envelope?.id || null,
        hermesRunId: payload.hermesRunId || payload.runId || null,
        project: {
            ...payload.project,
            code: payload.project?.code || projectCode,
        },
        strategy: payload.strategy,
        designTask: payload.designTask,
        results: payload.results.map((item, index) => ({
            imageId: item.imageId || `hermes_api_mock_img_${index + 1}`,
            url: typeof item.url === 'string' && item.url.startsWith('/')
                ? item.url
                : '/workflow-sample-1.png',
            model: item.model || payload.strategy?.selectedModel || 'hermes-api-mock-image-strategy-v1',
            prompt: item.prompt || payload.designTask?.prompt || '',
        })),
    };
}

async function callHermesApi({ user, projectCode, message, config }) {
    if (!config.apiKey) {
        throw createHermesError(
            'HERMES_NOT_CONFIGURED',
            'Hermes API key is not configured.',
            503
        );
    }

    const url = `${config.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();

    const body = {
        model: config.model,
        stream: false,
        messages: [
            {
                role: 'system',
                content: HERMES_API_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: JSON.stringify({
                    projectCode,
                    message: message || '',
                    user: {
                        id: user?.id || null,
                        username: user?.username || null,
                    },
                    boundaries: {
                        p1MockCompanyFieldsOnly: true,
                        noRealImageGeneration: true,
                        noExternalImageDownload: true,
                    },
                }),
            },
        ],
    };

    console.log('[HermesClient] Calling Hermes API', {
        url,
        model: config.model,
        timeoutMs: config.timeoutMs,
        projectCode,
    });

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw createHermesError(
                'HERMES_TIMEOUT',
                `Hermes API timed out after ${config.timeoutMs}ms.`,
                504
            );
        }
        throw createHermesError(
            'HERMES_API_REQUEST_FAILED',
            `Hermes API request failed: ${error?.message || error}`,
            502
        );
    } finally {
        clearTimeout(timeout);
    }

    const rawText = await response.text();
    let envelope;
    try {
        envelope = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API returned a non-JSON envelope.',
            502
        );
    }

    if (!response.ok) {
        const messageText =
            envelope?.error?.message ||
            envelope?.message ||
            response.statusText ||
            'Hermes API request failed.';
        throw createHermesError(
            response.status === 401 || response.status === 403
                ? 'HERMES_AUTH_ERROR'
                : 'HERMES_API_ERROR',
            `Hermes API failed: ${String(messageText).slice(0, 240)}`,
            response.status
        );
    }

    const content = envelope?.choices?.[0]?.message?.content;
    const parsedPayload = parseHermesJsonContent(content);
    const normalized = normalizeHermesApiPayload(parsedPayload, { projectCode, envelope });

    console.log('[HermesClient] Hermes API completed', {
        projectCode,
        model: config.model,
        elapsedMs: Date.now() - startedAt,
        resultCount: normalized.results.length,
    });

    return normalized;
}

export async function runHermesProjectMock({ user, projectCode, message }) {
    const requestId = `mock_req_${crypto.randomUUID()}`;
    const runId = `mock_run_${crypto.randomUUID()}`;
    const prompt = [
        `Create a production-ready textile pattern concept for project ${projectCode}.`,
        'Use the available company fields to infer a restrained but distinctive visual direction.',
        'Prioritize repeatability, craft compatibility, and brand-safe color strategy.'
    ].join(' ');

    return {
        status: 'completed',
        hermesRequestId: requestId,
        hermesRunId: runId,
        project: {
            code: projectCode,
            name: `Mock ${projectCode} Pattern Development`,
            category: 'Textile pattern',
            customer: user?.username || 'MYML internal designer',
            developmentRequirement: message || `Develop initial pattern concepts for ${projectCode}.`,
            craft: 'Digital print mock',
            sizeRequirement: 'Repeat tile, 2048 x 2048 preview',
            quantityRequirement: '1 initial direction'
        },
        strategy: {
            selectedModel: 'hermes-mock-image-strategy-v1',
            reason: 'Mock Hermes selected a fast visual exploration path for P0 integration validation.',
            imageCount: 1,
            size: '2048x2048',
            mode: 'mock-pattern-generation'
        },
        designTask: {
            task_type: 'pattern_generation',
            theme: `${projectCode} visual concept`,
            prompt,
            negative_prompt: 'low quality, blurry, off-brand typography, messy repeat seams'
        },
        results: [
            {
                imageId: `mock_img_${crypto.randomUUID()}`,
                url: getMockImageUrl(projectCode),
                model: 'hermes-mock-image-strategy-v1',
                prompt
            }
        ]
    };
}

export async function runHermesProjectClient({ user, projectCode, message, env = process.env } = {}) {
    const config = getHermesClientConfig(env);
    if (config.mode === 'api') {
        return await callHermesApi({
            user,
            projectCode,
            message,
            config,
        });
    }

    return await runHermesProjectMock({ user, projectCode, message });
}

export default {
    getHermesClientConfig,
    getHermesStartupSummary,
    runHermesProjectMock,
    runHermesProjectClient
};
