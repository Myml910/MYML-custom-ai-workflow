#!/usr/bin/env node

require('dotenv/config');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SUPPORTED_PROVIDERS = new Set(['t8', 'atlas']);
const DEFAULT_ROLE = 'designer';
const DEFAULT_STATUS = 'active';
const DEFAULT_CREDENTIAL_LABEL = 'primary';
const DEFAULT_PRIORITY = 1;
const PASSWORD_HASH_ROUNDS = 12;

function usage() {
    return [
        'Usage:',
        '  node scripts/seed-designer-user-credentials.cjs --input tmp/designer-accounts.example.json --dry-run',
        '  node scripts/seed-designer-user-credentials.cjs --input /secure/path/designer-accounts.json --apply',
        '',
        'Modes:',
        '  --dry-run   Validate input and print the users/credentials that would be ensured. Does not connect to DB.',
        '  --apply     Create missing users and upsert user-scoped provider credentials in PostgreSQL.'
    ].join('\n');
}

function parseArgs(argv) {
    const args = {
        input: null,
        dryRun: false,
        apply: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (arg === '--apply') {
            args.apply = true;
            continue;
        }
        if (arg === '--input') {
            args.input = argv[index + 1] || null;
            index += 1;
            continue;
        }
        if (arg.startsWith('--input=')) {
            args.input = arg.slice('--input='.length);
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            console.log(usage());
            process.exit(0);
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!args.input) {
        throw new Error('Missing required --input path.');
    }
    if (args.dryRun === args.apply) {
        throw new Error('Choose exactly one mode: --dry-run or --apply.');
    }

    return args;
}

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function readJsonFile(inputPath) {
    const resolvedPath = path.resolve(inputPath);
    const content = fs.readFileSync(resolvedPath, 'utf8');
    return {
        resolvedPath,
        data: JSON.parse(content)
    };
}

function last4(value) {
    const text = cleanString(value);
    return text.length >= 4 ? text.slice(-4) : text;
}

function normalizePriority(value, index) {
    if (value === undefined || value === null || value === '') return DEFAULT_PRIORITY;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Credential #${index + 1} priority must be a positive integer.`);
    }
    return parsed;
}

function normalizeStatus(value, label) {
    const status = cleanString(value) || DEFAULT_STATUS;
    if (!['active', 'disabled'].includes(status)) {
        throw new Error(`${label} status must be active or disabled.`);
    }
    return status;
}

function normalizeCredentials(rawAccount, accountIndex) {
    const rawCredentials = rawAccount.credentials ||
        rawAccount.providerCredentials ||
        rawAccount.provider_credentials ||
        (rawAccount.provider && (rawAccount.apiKey || rawAccount.api_key || rawAccount.key)
            ? [{
                provider: rawAccount.provider,
                apiKey: rawAccount.apiKey || rawAccount.api_key || rawAccount.key,
                label: rawAccount.label,
                baseUrl: rawAccount.baseUrl || rawAccount.base_url,
                status: rawAccount.credentialStatus || rawAccount.status,
                priority: rawAccount.priority
            }]
            : null);

    if (!Array.isArray(rawCredentials) || rawCredentials.length === 0) {
        throw new Error(`Account #${accountIndex + 1} must include at least one provider credential.`);
    }

    return rawCredentials.map((rawCredential, credentialIndex) => {
        const provider = cleanString(rawCredential.provider).toLowerCase();
        if (!SUPPORTED_PROVIDERS.has(provider)) {
            throw new Error(`Account #${accountIndex + 1} credential #${credentialIndex + 1} provider must be one of: ${Array.from(SUPPORTED_PROVIDERS).join(', ')}.`);
        }

        const apiKey = cleanString(rawCredential.apiKey || rawCredential.api_key || rawCredential.key);
        if (!apiKey) {
            throw new Error(`Account #${accountIndex + 1} credential #${credentialIndex + 1} is missing apiKey.`);
        }

        return {
            provider,
            apiKey,
            label: cleanString(rawCredential.label) || DEFAULT_CREDENTIAL_LABEL,
            baseUrl: cleanString(rawCredential.baseUrl || rawCredential.base_url) || null,
            status: normalizeStatus(rawCredential.status, `Account #${accountIndex + 1} credential #${credentialIndex + 1}`),
            priority: normalizePriority(rawCredential.priority, credentialIndex)
        };
    });
}

function normalizeAccounts(input) {
    const rawAccounts = Array.isArray(input)
        ? input
        : input.designers || input.accounts || input.users;

    if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) {
        throw new Error('Input JSON must be an array or an object with designers/accounts/users array.');
    }

    const seenUsers = new Set();
    const seenCredentialKeys = new Set();

    return rawAccounts.map((rawAccount, accountIndex) => {
        const username = cleanString(rawAccount.username);
        const password = cleanString(rawAccount.password);
        if (!username) {
            throw new Error(`Account #${accountIndex + 1} is missing username.`);
        }
        if (!password) {
            throw new Error(`Account #${accountIndex + 1} is missing password.`);
        }
        if (seenUsers.has(username.toLowerCase())) {
            throw new Error(`Duplicate username in input: ${username}`);
        }
        seenUsers.add(username.toLowerCase());

        const account = {
            username,
            password,
            role: cleanString(rawAccount.role) || DEFAULT_ROLE,
            status: normalizeStatus(rawAccount.status, `Account #${accountIndex + 1}`),
            credentials: normalizeCredentials(rawAccount, accountIndex)
        };

        for (const credential of account.credentials) {
            const key = `${account.username.toLowerCase()}:${credential.provider}:${credential.label.toLowerCase()}`;
            if (seenCredentialKeys.has(key)) {
                throw new Error(`Duplicate credential in input for ${account.username}: ${credential.provider}/${credential.label}`);
            }
            seenCredentialKeys.add(key);
        }

        return account;
    });
}

function publicCredentialSummary(username, credential) {
    return {
        username,
        scopeType: 'user',
        provider: credential.provider,
        label: credential.label,
        baseUrl: credential.baseUrl ? '(custom)' : null,
        status: credential.status,
        priority: credential.priority,
        apiKeyLast4: last4(credential.apiKey)
    };
}

async function loadCryptoHelpers() {
    return import('../server/utils/providerCredentialCrypto.js');
}

async function printDryRun(accounts, inputPath) {
    const { getProviderCredentialEncryptionStatus } = await loadCryptoHelpers();
    const encryptionStatus = getProviderCredentialEncryptionStatus();

    console.log('[DesignerCredentialSeed] mode=dry-run');
    console.log('[DesignerCredentialSeed] input', inputPath);
    console.log('[DesignerCredentialSeed] database', 'not connected in dry-run');
    console.log('[DesignerCredentialSeed] providerCredentialEncryption', {
        configured: encryptionStatus.configured,
        format: encryptionStatus.format,
        note: encryptionStatus.configured
            ? 'ready for --apply'
            : 'missing; --apply will fail until PROVIDER_CREDENTIAL_ENCRYPTION_KEY is configured'
    });

    for (const account of accounts) {
        console.log('[DesignerCredentialSeed] would ensure user', {
            username: account.username,
            role: account.role,
            status: account.status,
            password: '(will bcrypt hash on --apply)'
        });

        for (const credential of account.credentials) {
            console.log('[DesignerCredentialSeed] would upsert credential', publicCredentialSummary(account.username, credential));
        }
    }

    console.log('[DesignerCredentialSeed] summary', {
        usersToEnsure: accounts.length,
        credentialsToUpsert: accounts.reduce((count, account) => count + account.credentials.length, 0),
        written: false
    });
}

async function ensureUser(client, account) {
    const existing = await client.query(`
        SELECT id, username, role, status
        FROM users
        WHERE username = $1
        LIMIT 1
    `, [account.username]);

    if (existing.rows[0]) {
        return {
            id: existing.rows[0].id,
            created: false,
            username: existing.rows[0].username
        };
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(account.password, PASSWORD_HASH_ROUNDS);
    await client.query(`
        INSERT INTO users (id, username, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5)
    `, [userId, account.username, passwordHash, account.role, account.status]);

    return {
        id: userId,
        created: true,
        username: account.username
    };
}

async function upsertUserCredential(client, userId, credential, encryptProviderApiKey) {
    const encryptedApiKey = encryptProviderApiKey(credential.apiKey);
    const apiKeyLast4 = last4(credential.apiKey);

    const existing = await client.query(`
        SELECT id
        FROM provider_credentials
        WHERE scope_type = 'user'
          AND scope_id = $1
          AND provider = $2
          AND COALESCE(label, '') = COALESCE($3::text, '')
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
    `, [userId, credential.provider, credential.label]);

    if (existing.rows[0]) {
        await client.query(`
            UPDATE provider_credentials
            SET base_url = $2,
                api_key_encrypted = $3,
                api_key_last4 = $4,
                status = $5,
                priority = $6,
                updated_at = now()
            WHERE id = $1
        `, [
            existing.rows[0].id,
            credential.baseUrl,
            encryptedApiKey,
            apiKeyLast4 || null,
            credential.status,
            credential.priority
        ]);

        return {
            id: existing.rows[0].id,
            action: 'updated',
            apiKeyLast4
        };
    }

    const credentialId = crypto.randomUUID();
    await client.query(`
        INSERT INTO provider_credentials (
            id,
            scope_type,
            scope_id,
            provider,
            label,
            base_url,
            api_key_encrypted,
            api_key_last4,
            status,
            priority,
            created_by
        )
        VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, $8, $9, NULL)
    `, [
        credentialId,
        userId,
        credential.provider,
        credential.label,
        credential.baseUrl,
        encryptedApiKey,
        apiKeyLast4 || null,
        credential.status,
        credential.priority
    ]);

    return {
        id: credentialId,
        action: 'inserted',
        apiKeyLast4
    };
}

async function applySeed(accounts, inputPath) {
    const {
        encryptProviderApiKey,
        getProviderCredentialEncryptionStatus
    } = await loadCryptoHelpers();
    const encryptionStatus = getProviderCredentialEncryptionStatus();
    if (!encryptionStatus.configured) {
        throw new Error('PROVIDER_CREDENTIAL_ENCRYPTION_KEY is required for --apply.');
    }

    const { getDb, closeDb } = await import('../server/db/index.js');
    const db = getDb();
    const client = await db.connect();

    let createdUsers = 0;
    let existingUsers = 0;
    let insertedCredentials = 0;
    let updatedCredentials = 0;

    console.log('[DesignerCredentialSeed] mode=apply');
    console.log('[DesignerCredentialSeed] input', inputPath);
    console.log('[DesignerCredentialSeed] providerCredentialEncryption', {
        configured: true,
        format: encryptionStatus.format
    });

    try {
        await client.query('BEGIN');

        for (const account of accounts) {
            const user = await ensureUser(client, account);
            if (user.created) {
                createdUsers += 1;
            } else {
                existingUsers += 1;
            }

            console.log('[DesignerCredentialSeed] user', {
                action: user.created ? 'created' : 'exists',
                username: user.username,
                userId: user.id
            });

            for (const credential of account.credentials) {
                const result = await upsertUserCredential(client, user.id, credential, encryptProviderApiKey);
                if (result.action === 'inserted') {
                    insertedCredentials += 1;
                } else {
                    updatedCredentials += 1;
                }

                console.log('[DesignerCredentialSeed] credential', {
                    action: result.action,
                    username: user.username,
                    credentialId: result.id,
                    scopeType: 'user',
                    provider: credential.provider,
                    label: credential.label,
                    status: credential.status,
                    priority: credential.priority,
                    apiKeyLast4: result.apiKeyLast4
                });
            }
        }

        await client.query('COMMIT');
        console.log('[DesignerCredentialSeed] summary', {
            createdUsers,
            existingUsers,
            insertedCredentials,
            updatedCredentials,
            written: true
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await closeDb();
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { resolvedPath, data } = readJsonFile(args.input);
    const accounts = normalizeAccounts(data);

    if (args.dryRun) {
        await printDryRun(accounts, resolvedPath);
        return;
    }

    await applySeed(accounts, resolvedPath);
}

main().catch(error => {
    console.error('[DesignerCredentialSeed] failed:', error.message || error);
    process.exitCode = 1;
});
