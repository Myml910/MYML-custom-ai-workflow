import { callOneShotAgentChat } from './graph/chatGraph.js';
import { createAgentChatError, getAgentChatStartupSummary } from './config/chatConfig.js';
import { resolveImageToBase64 } from '../utils/imageHelpers.js';

export const IMAGE_PROMPT_REVERSE_TEMPLATE_VERSION = 'image-prompt-description-v1';

const IMAGE_PROMPT_REVERSE_CONFIG_KEYS = [
    'IMAGE_PROMPT_REVERSE_PROVIDER',
    'IMAGE_PROMPT_REVERSE_MODEL',
    'IMAGE_PROMPT_REVERSE_BASE_URL',
    'IMAGE_PROMPT_REVERSE_API_KEY',
    'IMAGE_PROMPT_REVERSE_TIMEOUT_MS',
    'IMAGE_PROMPT_REVERSE_MAX_TOKENS',
    'IMAGE_PROMPT_REVERSE_FALLBACK_MODELS',
];
const DEFAULT_IMAGE_PROMPT_REVERSE_TIMEOUT_MS = 180000;
const DEFAULT_IMAGE_PROMPT_REVERSE_MAX_TOKENS = 1600;
const IMAGE_PROMPT_REVERSE_FALLBACK_KEYWORDS = [
    'high demand',
    'overloaded',
    'rate limit',
    '429',
    'temporarily unavailable',
    'temporary',
    'busy',
    'capacity',
    'timeout',
    'timed out',
];

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

function hasImagePromptReverseOverrides(env = process.env) {
    return IMAGE_PROMPT_REVERSE_CONFIG_KEYS.some(key => cleanString(env[key]));
}

function getImagePromptReverseTimeoutMs(env = process.env) {
    return parsePositiveInteger(
        env.IMAGE_PROMPT_REVERSE_TIMEOUT_MS,
        parsePositiveInteger(env.AGENT_CHAT_TIMEOUT_MS, DEFAULT_IMAGE_PROMPT_REVERSE_TIMEOUT_MS)
    );
}

function getImagePromptReverseMaxTokens(env = process.env) {
    return parsePositiveInteger(
        env.IMAGE_PROMPT_REVERSE_MAX_TOKENS,
        DEFAULT_IMAGE_PROMPT_REVERSE_MAX_TOKENS
    );
}

function parseFallbackModels(value) {
    return String(value || '')
        .split(',')
        .map(model => model.trim())
        .filter(Boolean);
}

function uniqueModels(models) {
    const seen = new Set();
    const unique = [];

    for (const model of models) {
        const key = model || '__agent_fallback__';
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(model);
    }

    return unique;
}

function isFallbackEligibleError(error) {
    const status = Number(error?.status);
    if (status === 429) return true;
    if ([400, 401, 403].includes(status)) return false;

    const text = [
        error?.message,
        error?.code,
        status ? String(status) : '',
    ].filter(Boolean).join(' ').toLowerCase();

    return IMAGE_PROMPT_REVERSE_FALLBACK_KEYWORDS.some(keyword => text.includes(keyword));
}

function createImagePromptReverseFailure({ lastError, attemptedModels }) {
    const error = createAgentChatError(
        'IMAGE_PROMPT_REVERSE_FAILED',
        lastError?.message || 'Image prompt reverse failed.',
        Number.isInteger(lastError?.status) ? lastError.status : 502
    );
    error.attemptedModels = attemptedModels;
    return error;
}

export function getImagePromptReverseRuntimeConfig(env = process.env) {
    const hasOverrides = hasImagePromptReverseOverrides(env);
    const timeoutMs = getImagePromptReverseTimeoutMs(env);
    const maxTokens = getImagePromptReverseMaxTokens(env);

    if (!hasOverrides) {
        return {
            hasOverrides: false,
            provider: undefined,
            model: undefined,
            baseUrl: undefined,
        apiKey: undefined,
        timeoutMs,
        maxTokens,
        fallbackModels: parseFallbackModels(env.IMAGE_PROMPT_REVERSE_FALLBACK_MODELS),
    };
    }

    return {
        hasOverrides: true,
        provider: cleanString(env.IMAGE_PROMPT_REVERSE_PROVIDER) || cleanString(env.AGENT_CHAT_PROVIDER),
        model: cleanString(env.IMAGE_PROMPT_REVERSE_MODEL) || cleanString(env.AGENT_CHAT_MODEL),
        baseUrl: cleanBaseUrl(env.IMAGE_PROMPT_REVERSE_BASE_URL) || cleanBaseUrl(env.AGENT_CHAT_BASE_URL),
        apiKey: cleanString(env.IMAGE_PROMPT_REVERSE_API_KEY) || cleanString(env.AGENT_CHAT_API_KEY),
        timeoutMs,
        maxTokens,
        fallbackModels: parseFallbackModels(env.IMAGE_PROMPT_REVERSE_FALLBACK_MODELS),
    };
}

export function getImagePromptReverseStartupSummary(env = process.env) {
    const config = getImagePromptReverseRuntimeConfig(env);
    const agentFallback = getAgentChatStartupSummary(env);

    return {
        imagePromptReverseProvider: config.provider || agentFallback.agentChatProvider,
        imagePromptReverseModel: config.model || agentFallback.agentChatModel,
        imagePromptReverseConfigured: config.hasOverrides
            ? Boolean(config.apiKey)
            : Boolean(agentFallback.agentChatConfigured),
        imagePromptReverseTimeoutMs: config.timeoutMs,
        imagePromptReverseMaxTokens: config.maxTokens,
        imagePromptReverseFallbackModels: config.fallbackModels,
    };
}

function getImageDataUrlSummary(dataUrl) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
    const mimeType = match?.[1] || 'unknown';
    const base64 = (match?.[2] || '').replace(/\s/g, '');
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const approximateBytes = base64
        ? Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
        : 0;

    return {
        sourceImageType: mimeType,
        base64Length: base64.length,
        approximateBytes,
    };
}

export const IMAGE_PROMPT_REVERSE_PROMPT = `Analyze the provided image and generate a detailed visual description by filling out the following template strictly. 

Instructions:
1. Output strictly in the requested Markdown format.
2. Keep the bold headers and English/Chinese labels exactly as shown.
3. Provide detailed, high-quality English descriptions for each section based on the visual analysis of the image.

Template:
## Image Prompt Description

**1. Core Subject & Theme (核心主体与主题):**
[Summarize the main content in one sentence]

**2. Art Style & Medium (艺术风格与媒介):**
[Describe the art style, medium, lines, and aesthetic]

**3. Color Palette & Lighting (配色与光影):**
[Describe colors, lighting quality, and atmosphere]

**4. Composition & Perspective (构图与视角):**
[Describe layout, balance, and view angle]

**5. Detailed Visual Elements (分层细节描述):**

*   **Main Focus (Center/Midground):** [Describe the core elements]
*   **Background & Atmosphere:** [Describe the setting and environment]
*   **Foreground & Framing:** [Describe foreground elements]
*   **Specific Details/Props:** [Describe specific objects, patterns]

**6. Text & Typography (If any):**
[Describe text content and font style if applicable. If none, write "None".]`;

export async function analyzeImagePromptReverse({ imageUrl, user, sourceNodeId, sourceImageIndex } = {}) {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
        throw createAgentChatError(
            'IMAGE_PROMPT_REVERSE_IMAGE_REQUIRED',
            'imageUrl is required.',
            400
        );
    }

    const resolvedImage = resolveImageToBase64(imageUrl, user);
    if (!resolvedImage || !resolvedImage.startsWith('data:image/')) {
        throw createAgentChatError(
            'IMAGE_PROMPT_REVERSE_IMAGE_UNREADABLE',
            'Image could not be read for prompt reverse analysis.',
            400
        );
    }

    const runtimeConfig = getImagePromptReverseRuntimeConfig();
    const imageSummary = getImageDataUrlSummary(resolvedImage);
    const attemptedModels = uniqueModels([
        runtimeConfig.model,
        ...runtimeConfig.fallbackModels,
    ]);
    const candidateModels = attemptedModels.length > 0 ? attemptedModels : [undefined];
    let lastError = null;

    for (const [index, attemptedModel] of candidateModels.entries()) {
        const startedAt = Date.now();
        console.log('[ImagePromptReverse] attempt', {
            provider: runtimeConfig.provider || 'agent-fallback',
            attemptedModel: attemptedModel || 'agent-fallback',
            timeoutMs: runtimeConfig.timeoutMs,
            maxTokens: runtimeConfig.maxTokens,
            sourceNodeId,
            sourceImageIndex,
            ...imageSummary,
        });

        try {
            const text = await callOneShotAgentChat({
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: IMAGE_PROMPT_REVERSE_PROMPT,
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: resolvedImage,
                                },
                            },
                        ],
                    },
                ],
                provider: runtimeConfig.provider,
                model: attemptedModel,
                baseUrl: runtimeConfig.baseUrl,
                apiKey: runtimeConfig.apiKey,
                timeoutMs: runtimeConfig.timeoutMs,
                temperature: 0.2,
                maxTokens: runtimeConfig.maxTokens,
                includeProviderParams: true,
            });

            const trimmedText = typeof text === 'string' ? text.trim() : '';
            if (!trimmedText) {
                throw createAgentChatError(
                    'IMAGE_PROMPT_REVERSE_EMPTY_RESPONSE',
                    'Image analysis returned empty text.',
                    502
                );
            }

            console.log('[ImagePromptReverse] success', {
                usedModel: attemptedModel || 'agent-fallback',
                elapsedMs: Date.now() - startedAt,
            });

            return {
                text: trimmedText,
                model: attemptedModel,
                promptTemplateVersion: IMAGE_PROMPT_REVERSE_TEMPLATE_VERSION,
            };
        } catch (error) {
            lastError = error;
            const nextModel = candidateModels[index + 1];
            const canFallback = nextModel && isFallbackEligibleError(error);

            if (!canFallback) {
                break;
            }

            console.warn('[ImagePromptReverse] fallback', {
                attemptedModel: attemptedModel || 'agent-fallback',
                fallbackModel: nextModel,
                reason: error?.message || error,
            });
        }
    }

    throw createImagePromptReverseFailure({
        lastError,
        attemptedModels: candidateModels.map(model => model || 'agent-fallback'),
    });
}
