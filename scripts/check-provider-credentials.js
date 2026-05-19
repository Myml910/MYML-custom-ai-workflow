import dotenv from 'dotenv';
import { closeDb, getDb } from '../server/db/index.js';
import {
    decryptProviderApiKey,
    getProviderCredentialEncryptionStatus,
    isEncryptedProviderApiKey
} from '../server/utils/providerCredentialCrypto.js';

dotenv.config();

const strictTeamCredentials = process.env.REQUIRE_TEAM_PROVIDER_CREDENTIALS === 'true';

function maskLast4(value) {
    if (!value) return null;
    const text = String(value);
    return text.slice(-4);
}

function printCredentialSummary(row, verification) {
    console.log('[ProviderCredentials] credential', {
        id: row.id,
        provider: row.provider,
        scopeType: row.scope_type || null,
        scopeId: row.scope_id || null,
        status: row.status || null,
        priority: row.priority ?? null,
        hasApiKeyEncrypted: Boolean(row.api_key_encrypted),
        encryptedFormat: row.api_key_encrypted
            ? (isEncryptedProviderApiKey(row.api_key_encrypted) ? 'v1' : 'legacy-plaintext')
            : 'missing',
        apiKeyLast4: row.api_key_last4 || verification.last4 || null,
        decryptOk: verification.decryptOk,
        error: verification.error || null
    });
}

async function providerCredentialsTableExists(db) {
    const result = await db.query(`
        SELECT to_regclass('public.provider_credentials') AS table_name
    `);

    return Boolean(result.rows[0]?.table_name);
}

function verifyCredential(row, encryptionStatus) {
    const value = row.api_key_encrypted;
    const result = {
        decryptOk: false,
        last4: null,
        error: null
    };

    if (!value) {
        result.error = 'api_key_encrypted is missing';
        return result;
    }

    if (isEncryptedProviderApiKey(value) && !encryptionStatus.configured) {
        result.error = 'PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required to decrypt v1 provider credentials';
        return result;
    }

    try {
        const plainText = decryptProviderApiKey(value);
        result.decryptOk = Boolean(plainText);
        result.last4 = maskLast4(plainText);
        if (!result.decryptOk) {
            result.error = 'Decrypted provider credential is empty';
        }
    } catch (error) {
        result.error = error?.message || String(error);
    }

    return result;
}

async function main() {
    const db = getDb();
    let shouldFail = false;

    try {
        const tableExists = await providerCredentialsTableExists(db);
        if (!tableExists) {
            console.warn('[ProviderCredentials] provider_credentials table does not exist.');
            if (strictTeamCredentials) {
                console.error('[ProviderCredentials] Strict team provider credentials are required, but provider_credentials is missing.');
                shouldFail = true;
            }
            return shouldFail ? 1 : 0;
        }

        const encryptionStatus = getProviderCredentialEncryptionStatus();
        console.log('[ProviderCredentials] encryption', {
            algorithm: encryptionStatus.algorithm,
            format: encryptionStatus.format,
            configured: encryptionStatus.configured,
            keySource: encryptionStatus.keySource
        });

        const result = await db.query(`
            SELECT
                id,
                provider,
                scope_type,
                scope_id,
                label,
                status,
                priority,
                api_key_encrypted,
                api_key_last4,
                created_at,
                updated_at
            FROM provider_credentials
            ORDER BY provider ASC, scope_type ASC, scope_id ASC NULLS FIRST, priority ASC, created_at ASC
        `);

        const rows = result.rows;
        const activeUsableCount = rows.filter(row => row.status === 'active' && row.api_key_encrypted).length;
        let encryptedCount = 0;
        let legacyCount = 0;
        let missingKeyCount = 0;

        console.log('[ProviderCredentials] summary', {
            credentialCount: rows.length,
            activeUsableCount,
            strictTeamCredentials
        });

        for (const row of rows) {
            if (!row.api_key_encrypted) {
                missingKeyCount += 1;
            } else if (isEncryptedProviderApiKey(row.api_key_encrypted)) {
                encryptedCount += 1;
            } else {
                legacyCount += 1;
            }

            const verification = verifyCredential(row, encryptionStatus);
            if (!verification.decryptOk) {
                shouldFail = true;
            }
            printCredentialSummary(row, verification);
        }

        console.log('[ProviderCredentials] formats', {
            encryptedV1: encryptedCount,
            legacyPlaintext: legacyCount,
            missingApiKey: missingKeyCount
        });

        if (strictTeamCredentials && activeUsableCount === 0) {
            console.error('[ProviderCredentials] Strict team provider credentials are enabled, but no active credential with api_key_encrypted exists.');
            shouldFail = true;
        }

        return shouldFail ? 1 : 0;
    } finally {
        await closeDb();
    }
}

main()
    .then(code => {
        process.exitCode = code;
    })
    .catch(async error => {
        console.error('[ProviderCredentials] Check failed:', error?.message || error);
        await closeDb().catch(() => {});
        process.exitCode = 1;
    });
