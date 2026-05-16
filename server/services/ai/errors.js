export const AI_ERROR_TYPES = Object.freeze({
    AUTH_ERROR: 'AUTH_ERROR',
    QUOTA_ERROR: 'QUOTA_ERROR',
    RATE_LIMIT: 'RATE_LIMIT',
    NO_CHANNEL: 'NO_CHANNEL',
    PARAM_ERROR: 'PARAM_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
    EMPTY_RESULT: 'EMPTY_RESULT',
    PROVIDER_ERROR: 'PROVIDER_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

export class AiProviderError extends Error {
    constructor({ type = AI_ERROR_TYPES.UNKNOWN_ERROR, provider, model, message, cause, raw } = {}) {
        super(message || 'AI provider request failed.');
        this.name = 'AiProviderError';
        this.type = type;
        this.provider = provider;
        this.model = model;
        this.cause = cause;
        this.raw = raw;
    }
}

function getErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || error.error || '';
}

function pickErrorType(message) {
    const text = String(message || '').toLowerCase();

    if (text.includes('unauthorized') || text.includes('invalid api key') || text.includes('401')) {
        return AI_ERROR_TYPES.AUTH_ERROR;
    }
    if (text.includes('quota') || text.includes('insufficient balance') || text.includes('402')) {
        return AI_ERROR_TYPES.QUOTA_ERROR;
    }
    if (text.includes('rate limit') || text.includes('429')) {
        return AI_ERROR_TYPES.RATE_LIMIT;
    }
    if (text.includes('no available channel') || text.includes('无可用渠道')) {
        return AI_ERROR_TYPES.NO_CHANNEL;
    }
    if (text.includes('timeout') || text.includes('timed out')) {
        return AI_ERROR_TYPES.TIMEOUT;
    }
    if (text.includes('empty') || text.includes('no image')) {
        return AI_ERROR_TYPES.EMPTY_RESULT;
    }
    if (text.includes('param') || text.includes('invalid request') || text.includes('400')) {
        return AI_ERROR_TYPES.PARAM_ERROR;
    }
    if (text.includes('fetch failed') || text.includes('network')) {
        return AI_ERROR_TYPES.NETWORK_ERROR;
    }

    return AI_ERROR_TYPES.PROVIDER_ERROR;
}

export function classifyProviderError(error, context = {}) {
    if (error instanceof AiProviderError) return error;

    const message = getErrorMessage(error) || context.message || 'AI provider request failed.';
    return new AiProviderError({
        type: pickErrorType(message),
        provider: context.provider,
        model: context.model,
        message,
        cause: error,
        raw: context.raw
    });
}
