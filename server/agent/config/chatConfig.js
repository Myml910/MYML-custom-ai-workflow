import {
    getAiProviderConfig,
    getLegacyChatConfig,
    isApimartTextConfigured
} from '../../services/ai/aiProviderConfig.js';

const DEFAULT_AGENT_CHAT_BASE_URL = 'https://ai.t8star.org/v1';
const DEFAULT_AGENT_CHAT_MODEL = 'gemini-3.1-flash-lite-preview-thinking-high';
const DEFAULT_AGENT_CHAT_TIMEOUT_MS = 60000;

export const AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE =
    'Agent text model is not configured. Configure AGENT_CHAT_PROVIDER=t8 with AGENT_CHAT_API_KEY, or configure APIMART_API_KEY or CHAT_API_KEY/OPENAI_API_KEY.';

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

export default {
    AGENT_TEXT_MODEL_NOT_CONFIGURED_MESSAGE,
    createAgentChatError,
    getAgentChatConfig,
    getAgentChatStartupSummary,
};
