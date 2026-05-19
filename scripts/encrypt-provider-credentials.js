import 'dotenv/config';
import {
    encryptProviderApiKey,
    getProviderCredentialEncryptionStatus,
    isEncryptedProviderApiKey
} from '../server/utils/providerCredentialCrypto.js';
import { closeDb, getDb } from '../server/db/index.js';

const dryRun = process.argv.includes('--dry-run');

function last4(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length >= 4 ? text.slice(-4) : '';
}

function describeCredential(row, effectiveLast4) {
    return {
        id: row.id,
        provider: row.provider,
        scope: `${row.scope_type}:${row.scope_id || 'global'}`,
        status: row.status,
        last4: effectiveLast4 || row.api_key_last4 || null
    };
}

async function main() {
    const status = getProviderCredentialEncryptionStatus();
    if (!dryRun && !status.configured) {
        throw new Error('PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required to encrypt provider credentials');
    }

    const db = getDb();
    const result = await db.query(`
        SELECT id, scope_type, scope_id, provider, label, api_key_encrypted, api_key_last4, status
        FROM provider_credentials
        ORDER BY provider, scope_type, scope_id, priority, created_at
    `);

    let encryptedCount = 0;
    let skippedAlreadyEncryptedCount = 0;
    let skippedEmptyCount = 0;

    console.log(`[ProviderCredentialEncryption] mode=${dryRun ? 'dry-run' : 'write'} scanned=${result.rows.length}`);

    for (const row of result.rows) {
        const currentValue = typeof row.api_key_encrypted === 'string' ? row.api_key_encrypted : '';
        if (!currentValue) {
            skippedEmptyCount += 1;
            console.log('[ProviderCredentialEncryption] skipped empty credential', describeCredential(row, null));
            continue;
        }

        if (isEncryptedProviderApiKey(currentValue)) {
            skippedAlreadyEncryptedCount += 1;
            console.log('[ProviderCredentialEncryption] skipped already encrypted credential', describeCredential(row, row.api_key_last4));
            continue;
        }

        const effectiveLast4 = row.api_key_last4 || last4(currentValue);
        console.log(`[ProviderCredentialEncryption] ${dryRun ? 'would encrypt' : 'encrypting'} credential`, describeCredential(row, effectiveLast4));

        if (!dryRun) {
            const encryptedValue = encryptProviderApiKey(currentValue);
            await db.query(`
                UPDATE provider_credentials
                SET api_key_encrypted = $2,
                    api_key_last4 = COALESCE(NULLIF(api_key_last4, ''), $3),
                    updated_at = now()
                WHERE id = $1
            `, [row.id, encryptedValue, effectiveLast4 || null]);
        }

        encryptedCount += 1;
    }

    console.log('[ProviderCredentialEncryption] summary', {
        scanned: result.rows.length,
        encrypted: dryRun ? 0 : encryptedCount,
        wouldEncrypt: dryRun ? encryptedCount : 0,
        skippedAlreadyEncrypted: skippedAlreadyEncryptedCount,
        skippedEmpty: skippedEmptyCount
    });
}

try {
    await main();
} finally {
    await closeDb();
}
