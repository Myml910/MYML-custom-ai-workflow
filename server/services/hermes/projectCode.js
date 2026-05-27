const PROJECT_CODE_PATTERN = /\bYXF[A-Za-z0-9_-]{4,48}\b/i;
const VALID_PROJECT_CODE_PATTERN = /^YXF[A-Z0-9_-]{4,48}$/;
const START_INTENT_PATTERN = /(\u5f00\u59cb.*(\u505a|\u9879\u76ee)|\u505a.*\u9879\u76ee|\u542f\u52a8.*\u9879\u76ee|start.*project|begin.*project|work\s+on.*project)/i;

export function extractYxfProjectCode(message) {
    if (typeof message !== 'string') return null;
    const match = message.match(PROJECT_CODE_PATTERN);
    return match ? match[0].toUpperCase() : null;
}

export function isHermesProjectStartIntent(message) {
    if (typeof message !== 'string') return false;
    return Boolean(extractYxfProjectCode(message) && START_INTENT_PATTERN.test(message));
}

export function assertValidYxfProjectCode(projectCode) {
    const normalized = typeof projectCode === 'string' ? projectCode.trim().toUpperCase() : '';
    if (!VALID_PROJECT_CODE_PATTERN.test(normalized)) {
        const error = new Error('Invalid YXF project code.');
        error.status = 400;
        error.code = 'HERMES_INVALID_PROJECT_CODE';
        throw error;
    }
    return normalized;
}
