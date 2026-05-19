import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

function getRawEncryptionKey() {
    return process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY || '';
}

function deriveEncryptionKey(rawKey) {
    const value = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!value) return null;

    try {
        const decoded = Buffer.from(value, 'base64');
        if (decoded.length === KEY_LENGTH_BYTES) {
            return decoded;
        }
    } catch {
        // Fall through to sha256 derivation for deployment-friendly string keys.
    }

    return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function requireEncryptionKey(operation) {
    const key = deriveEncryptionKey(getRawEncryptionKey());
    if (!key) {
        throw new Error(`PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required to ${operation} provider credentials`);
    }
    return key;
}

export function isEncryptedProviderApiKey(value) {
    return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

export function encryptProviderApiKey(plainText) {
    const value = typeof plainText === 'string' ? plainText : '';
    if (!value) {
        throw new Error('Provider API key is required to encrypt provider credentials');
    }

    const key = requireEncryptionKey('encrypt');
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return [
        'v1',
        iv.toString('base64'),
        tag.toString('base64'),
        ciphertext.toString('base64')
    ].join(':');
}

export function decryptProviderApiKey(encryptedValue) {
    const value = typeof encryptedValue === 'string' ? encryptedValue : '';
    if (!value) return '';

    if (!isEncryptedProviderApiKey(value)) {
        console.warn('[ProviderCredentialCrypto] Reading legacy plaintext provider credential. Run scripts/encrypt-provider-credentials.js before production use.');
        return value;
    }

    const [, ivBase64, tagBase64, ciphertextBase64] = value.split(':');
    if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
        throw new Error('Invalid encrypted provider credential format');
    }

    const key = requireEncryptionKey('decrypt');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextBase64, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

export function getProviderCredentialEncryptionStatus() {
    const rawKey = getRawEncryptionKey();
    const derivedKey = deriveEncryptionKey(rawKey);

    return {
        algorithm: ALGORITHM,
        format: 'v1:<iv_base64>:<tag_base64>:<ciphertext_base64>',
        configured: Boolean(derivedKey),
        keySource: rawKey ? (Buffer.from(rawKey, 'base64').length === KEY_LENGTH_BYTES ? 'base64-32-byte-or-derived' : 'sha256-derived') : 'missing'
    };
}
