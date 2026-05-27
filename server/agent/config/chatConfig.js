import {
    getAiProviderConfig,
    getLegacyChatConfig,
    isApimartTextConfigured
} from '../../services/ai/aiProviderConfig.js';

const DEFAULT_AGENT_CHAT_BASE_URL = 'https://ai.t8star.org/v1';
const DEFAULT_AGENT_CHAT_MODEL = 'gpt-5.4';
const DEFAULT_AGENT_CHAT_TIMEOUT_MS = 60000;
const DEFAULT_AGENT_TEXT_BASE_URL = DEFAULT_AGENT_CHAT_BASE_URL;
const DEFAULT_AGENT_TEXT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_AGENT_TEXT_TIMEOUT_MS = 60000;

export const AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE =
    'Agent text model is not configured. Configure AGENT_TEXT_PROVIDER=t8 with AGENT_TEXT_API_KEY, or configure AGENT_CHAT_API_KEY for compatibility, APIMART_API_KEY, or CHAT_API_KEY/OPENAI_API_KEY.';

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

export function createAgentChatError(code, message, status = 500) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function getAgentChatProvider(env) {
    return cleanString(env.AGENT_CHAT_PROVIDER)?.toLowerCase();
}

function getAgentTextProvider(env) {
    return (
        cleanString(env.AGENT_TEXT_PROVIDER) ||
        cleanString(env.AGENT_CHAT_PROVIDER)
    )?.toLowerCase();
}

function getT8AgentChatConfig(env) {
    const apiKey = cleanString(env.AGENT_CHAT_API_KEY);
    if (!apiKey) {
        throw createAgentChatError(
            'AGENT_TEXT_MODEL_NOT_CONFIGURED',
            AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE,
            503
        );
    }

    return {
        provider: 't8',
        baseUrl: cleanBaseUrl(env.AGENT_CHAT_BASE_URL) || DEFAULT_AGENT_CHAT_BASE_URL,
        apiKey,
        model: cleanString(env.AGENT_CHAT_MODEL) || DEFAULT_AGENT_CHAT_MODEL,
        timeoutMs: parsePositiveInteger(env.AGENT_CHAT_TIMEOUT_MS, DEFAULT_AGENT_CHAT_TIMEOUT_MS),
    };
}

function getT8AgentTextConfig(env) {
    const apiKey = cleanString(env.AGENT_TEXT_API_KEY) || cleanString(env.AGENT_CHAT_API_KEY);
    if (!apiKey) {
        throw createAgentChatError(
            'AGENT_TEXT_MODEL_NOT_CONFIGURED',
            AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE,
            503
        );
    }

    return {
        provider: 't8',
        baseUrl: cleanBaseUrl(env.AGENT_TEXT_BASE_URL) ||
            cleanBaseUrl(env.AGENT_CHAT_BASE_URL) ||
            DEFAULT_AGENT_TEXT_BASE_URL,
        apiKey,
        model: cleanString(env.AGENT_TEXT_MODEL) || DEFAULT_AGENT_TEXT_MODEL,
        timeoutMs: parsePositiveInteger(
            env.AGENT_TEXT_TIMEOUT_MS,
            parsePositiveInteger(env.AGENT_CHAT_TIMEOUT_MS, DEFAULT_AGENT_TEXT_TIMEOUT_MS)
        ),
    };
}

export function getAgentChatConfig({
    env = process.env,
    runtimeApiKey,
    aiConfig = getAiProviderConfig(env),
} = {}) {
    const requestedProvider = getAgentChatProvider(env);

    if (requestedProvider === 't8') {
        return getT8AgentChatConfig(env);
    }

    if (requestedProvider) {
        throw createAgentChatError(
            'AGENT_TEXT_MODEL_NOT_CONFIGURED',
            `Unsupported Agent chat provider "${requestedProvider}". Set AGENT_CHAT_PROVIDER=t8 or remove it to use the legacy fallback chain.`,
            503
        );
    }

    if (isApimartTextConfigured(aiConfig)) {
        return {
            provider: 'apimart',
            aiConfig,
            model: aiConfig.apimart.textModel,
        };
    }

    const legacyChatConfig = getLegacyChatConfig(runtimeApiKey, aiConfig);
    if (!legacyChatConfig.apiKey) {
        throw createAgentChatError(
            'AGENT_TEXT_MODEL_NOT_CONFIGURED',
            AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE,
            503
        );
    }

    return {
        provider: 'legacy',
        ...legacyChatConfig,
    };
}

export function getAgentTextConfig({
    env = process.env,
    runtimeApiKey,
    aiConfig = getAiProviderConfig(env),
} = {}) {
    const requestedProvider = getAgentTextProvider(env);

    if (requestedProvider === 't8') {
        return getT8AgentTextConfig(env);
    }

    if (requestedProvider) {
        throw createAgentChatError(
            'AGENT_TEXT_MODEL_NOT_CONFIGURED',
            `Unsupported Agent text provider "${requestedProvider}". Set AGENT_TEXT_PROVIDER=t8 or remove AGENT_TEXT_PROVIDER/AGENT_CHAT_PROVIDER to use the legacy fallback chain.`,
            503
        );
    }

    if (isApimartTextConfigured(aiConfig)) {
        return {
            provider: 'apimart',
            aiConfig,
            model: aiConfig.apimart.textModel,
        };
    }

    const legacyChatConfig = getLegacyChatConfig(runtimeApiKey, aiConfig);
    if (!legacyChatConfig.apiKey) {
        throw createAgentChatError(
            'AGENT_TEXT_MODEL_NOT_CONFIGURED',
            AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE,
            503
        );
    }

    return {
        provider: 'legacy',
        ...legacyChatConfig,
    };
}

export function getAgentChatStartupSummary(env = process.env) {
    const requestedProvider = getAgentChatProvider(env);

    if (requestedProvider === 't8') {
        return {
            agentChatProvider: 't8',
            agentChatModel: cleanString(env.AGENT_CHAT_MODEL) || DEFAULT_AGENT_CHAT_MODEL,
            agentChatBaseUrl: cleanBaseUrl(env.AGENT_CHAT_BASE_URL) || DEFAULT_AGENT_CHAT_BASE_URL,
            agentChatConfigured: Boolean(cleanString(env.AGENT_CHAT_API_KEY)),
        };
    }

    if (requestedProvider) {
        return {
            agentChatProvider: requestedProvider,
            agentChatModel: 'unsupported',
            agentChatBaseUrl: 'unsupported',
            agentChatConfigured: false,
        };
    }

    const aiConfig = getAiProviderConfig(env);
    if (isApimartTextConfigured(aiConfig)) {
        return {
            agentChatProvider: 'apimart',
            agentChatModel: aiConfig.apimart.textModel,
            agentChatBaseUrl: aiConfig.apimart.baseUrl,
            agentChatConfigured: true,
        };
    }

    return {
        agentChatProvider: 'legacy',
        agentChatModel: aiConfig.legacy.chatModel,
        agentChatBaseUrl: aiConfig.legacy.chatBaseUrl,
        agentChatConfigured: Boolean(aiConfig.legacy.chatApiKey),
    };
}

export function getAgentTextStartupSummary(env = process.env) {
    const requestedProvider = getAgentTextProvider(env);

    if (requestedProvider === 't8') {
        return {
            agentTextProvider: 't8',
            agentTextModel: cleanString(env.AGENT_TEXT_MODEL) || DEFAULT_AGENT_TEXT_MODEL,
            agentTextBaseUrl: cleanBaseUrl(env.AGENT_TEXT_BASE_URL) ||
                cleanBaseUrl(env.AGENT_CHAT_BASE_URL) ||
                DEFAULT_AGENT_TEXT_BASE_URL,
            agentTextTimeoutMs: parsePositiveInteger(
                env.AGENT_TEXT_TIMEOUT_MS,
                parsePositiveInteger(env.AGENT_CHAT_TIMEOUT_MS, DEFAULT_AGENT_TEXT_TIMEOUT_MS)
            ),
            agentTextConfigured: Boolean(cleanString(env.AGENT_TEXT_API_KEY) || cleanString(env.AGENT_CHAT_API_KEY)),
        };
    }

    if (requestedProvider) {
        return {
            agentTextProvider: requestedProvider,
            agentTextModel: 'unsupported',
            agentTextBaseUrl: 'unsupported',
            agentTextTimeoutMs: parsePositiveInteger(env.AGENT_TEXT_TIMEOUT_MS, DEFAULT_AGENT_TEXT_TIMEOUT_MS),
            agentTextConfigured: false,
        };
    }

    const aiConfig = getAiProviderConfig(env);
    if (isApimartTextConfigured(aiConfig)) {
        return {
            agentTextProvider: 'apimart',
            agentTextModel: aiConfig.apimart.textModel,
            agentTextBaseUrl: aiConfig.apimart.baseUrl,
            agentTextTimeoutMs: DEFAULT_AGENT_TEXT_TIMEOUT_MS,
            agentTextConfigured: true,
        };
    }

    return {
        agentTextProvider: 'legacy',
        agentTextModel: aiConfig.legacy.chatModel,
        agentTextBaseUrl: aiConfig.legacy.chatBaseUrl,
        agentTextTimeoutMs: DEFAULT_AGENT_TEXT_TIMEOUT_MS,
        agentTextConfigured: Boolean(aiConfig.legacy.chatApiKey),
    };
}

export default {
    AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE,
    createAgentChatError,
    getAgentChatConfig,
    getAgentChatStartupSummary,
    getAgentTextConfig,
    getAgentTextStartupSummary,
};
