export const AI_ERROR_TYPES = Object.freeze({
    AUTH_ERROR: 'AUTH_ERROR',
    QUOTA_ERROR: 'QUOTA_ERROR',
    RATE_LIMIT: 'RATE_LIMIT',
    NO_CHANNEL: 'NO_CHANNEL',
    PARAM_ERROR: 'PARAM_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
    PENDING_TIMEOUT: 'PENDING_TIMEOUT',
    EMPTY_RESULT: 'EMPTY_RESULT',
    RESULT_DOWNLOAD_FAILED: 'RESULT_DOWNLOAD_FAILED',
    POLICY_BLOCKED: 'POLICY_BLOCKED',
    CONTENT_POLICY_BLOCKED: 'CONTENT_POLICY_BLOCKED',
    CREDENTIAL_REQUIRED: 'CREDENTIAL_REQUIRED',
    CREDENTIAL_DECRYPT_FAILED: 'CREDENTIAL_DECRYPT_FAILED',
    PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    WORKER_DISABLED: 'WORKER_DISABLED',
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

    if (text.includes('credential') && (text.includes('required') || text.includes('missing') || text.includes('no active'))) {
        return AI_ERROR_TYPES.CREDENTIAL_REQUIRED;
    }
    if (text.includes('decrypt') && text.includes('credential')) {
        return AI_ERROR_TYPES.CREDENTIAL_DECRYPT_FAILED;
    }
    if (text.includes('policy') || text.includes('moderation') || text.includes('safety') || text.includes('blocked')) {
        return AI_ERROR_TYPES.POLICY_BLOCKED;
    }
    if (text.includes('worker') && text.includes('disabled')) {
        return AI_ERROR_TYPES.WORKER_DISABLED;
    }
    if (text.includes('result') && (text.includes('download') || text.includes('saved locally') || text.includes('save failed'))) {
        return AI_ERROR_TYPES.RESULT_DOWNLOAD_FAILED;
    }
    if (text.includes('unavailable') || text.includes('service unavailable') || text.includes('503')) {
        return AI_ERROR_TYPES.PROVIDER_UNAVAILABLE;
    }
    if (text.includes('unauthorized') || text.includes('invalid api key') || text.includes('401')) {
        return AI_ERROR_TYPES.AUTH_ERROR;
    }
    if (text.includes('quota') || text.includes('insufficient balance') || text.includes('402')) {
        return AI_ERROR_TYPES.QUOTA_ERROR;
    }
    if (text.includes('rate limit') || text.includes('too many requests') || text.includes('429')) {
        return AI_ERROR_TYPES.RATE_LIMIT;
    }
    if (text.includes('no available channel')) {
        return AI_ERROR_TYPES.NO_CHANNEL;
    }
    if (text.includes('pending timeout') || text.includes('still processing')) {
        return AI_ERROR_TYPES.PENDING_TIMEOUT;
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

export function getUserFriendlyAiErrorMessage(type, fallbackMessage) {
    switch (type) {
        case AI_ERROR_TYPES.RESULT_DOWNLOAD_FAILED:
            return 'The provider returned an image, but the result could not be downloaded and saved. Please retry.';
        case AI_ERROR_TYPES.POLICY_BLOCKED:
        case AI_ERROR_TYPES.CONTENT_POLICY_BLOCKED:
            return 'The request was blocked by the provider content policy. Please adjust the prompt or input image.';
        case AI_ERROR_TYPES.CREDENTIAL_REQUIRED:
            return 'Provider credentials are not configured for this account. Please contact an administrator.';
        case AI_ERROR_TYPES.CREDENTIAL_DECRYPT_FAILED:
            return 'Provider credentials could not be decrypted. Please contact an administrator.';
        case AI_ERROR_TYPES.RATE_LIMIT:
            return 'The provider is rate limited or busy. Please wait and retry.';
        case AI_ERROR_TYPES.TIMEOUT:
        case AI_ERROR_TYPES.PENDING_TIMEOUT:
            return 'The image task is still processing or timed out. Please check history later or retry.';
        case AI_ERROR_TYPES.PROVIDER_UNAVAILABLE:
            return 'The selected provider is currently unavailable. Please retry later or choose another model.';
        case AI_ERROR_TYPES.WORKER_DISABLED:
            return 'Image worker is disabled. New generation tasks may stay queued.';
        case AI_ERROR_TYPES.QUOTA_ERROR:
            return 'The provider quota or balance is insufficient. Please contact an administrator.';
        case AI_ERROR_TYPES.AUTH_ERROR:
            return 'Provider authentication failed. Please check provider credentials.';
        default:
            return fallbackMessage || 'Image generation failed.';
    }
}

export function classifyProviderError(error, context = {}) {
    if (error instanceof AiProviderError) return error;

    const message = getErrorMessage(error) || context.message || 'AI provider request failed.';
    const type = context.type || pickErrorType(message);
    return new AiProviderError({
        type,
        provider: context.provider,
        model: context.model,
        message,
        cause: error,
        raw: context.raw
    });
}
