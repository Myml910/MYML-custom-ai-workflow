import dotenv from 'dotenv';

dotenv.config();

const strict = process.argv.includes('--strict');
const KNOWN_SHARED_DB_TARGETS = new Set([
    '10.0.0.30:15432/design_system_db'
]);
const KNOWN_LOCAL_ISOLATED_DB_TARGETS = new Set([
    '10.0.0.30:15433/design_system_db'
]);

function readEnv(name, fallback = '') {
    return process.env[name] || fallback;
}

function parseDatabaseTarget() {
    const databaseUrl = readEnv('DATABASE_URL');
    if (databaseUrl) {
        try {
            const parsed = new URL(databaseUrl);
            return {
                source: 'DATABASE_URL',
                host: parsed.hostname || 'unknown',
                port: parsed.port || '5432',
                database: decodeURIComponent(parsed.pathname || '').replace(/^\//, '') || 'unknown'
            };
        } catch {
            return {
                source: 'DATABASE_URL',
                host: 'invalid',
                port: 'unknown',
                database: 'unknown'
            };
        }
    }

    return {
        source: 'PG*',
        host: readEnv('PGHOST', readEnv('POSTGRES_HOST', '127.0.0.1')),
        port: readEnv('PGPORT', readEnv('POSTGRES_PORT', '5432')),
        database: readEnv('PGDATABASE', readEnv('POSTGRES_DB', 'unknown'))
    };
}

function hasValue(name) {
    return Boolean(readEnv(name));
}

function boolEnv(name) {
    return readEnv(name, 'false') === 'true';
}

function getDatabaseTargetKey(db) {
    return `${db.host}:${db.port}/${db.database}`;
}

function main() {
    const warnings = [];
    const failures = [];
    const db = parseDatabaseTarget();
    const dbTargetKey = getDatabaseTargetKey(db);
    const nodeEnv = readEnv('NODE_ENV', 'development');
    const isDevelopment = nodeEnv === 'development' || !nodeEnv;
    const pointsAtKnownSharedDb = KNOWN_SHARED_DB_TARGETS.has(dbTargetKey);
    const pointsAtKnownLocalIsolatedDb = KNOWN_LOCAL_ISOLATED_DB_TARGETS.has(dbTargetKey);
    const workerEnabled = boolEnv('TASK_WORKER_ENABLED');
    const atlasNanoBanana2Enabled = boolEnv('ENABLE_ATLAS_NANO_BANANA_2');
    const splitBrainRisk = isDevelopment && pointsAtKnownSharedDb;

    if (isDevelopment && pointsAtKnownLocalIsolatedDb) {
        warnings.push('Local development is using the known isolated dev database target. This is expected for local provider tests.');
    }

    if (splitBrainRisk) {
        warnings.push('HIGH RISK: Local development is using a known shared/test database. This can split task records from local /library files and create false /library 404 failures.');
        warnings.push('Recommended local isolation: use DATABASE_URL=postgres://...@127.0.0.1:5432/myml_canvas_local, REQUIRE_TEAM_PROVIDER_CREDENTIALS=false, and a local ATLAS_API_KEY.');
    }

    if (splitBrainRisk && workerEnabled) {
        warnings.push('HIGH RISK: TASK_WORKER_ENABLED=true while connected to a shared/test database. Local and server workers may race to claim paid provider tasks.');
    }

    if (splitBrainRisk && atlasNanoBanana2Enabled) {
        warnings.push('HIGH RISK: ENABLE_ATLAS_NANO_BANANA_2=true while connected to a shared/test database. Keep experimental model testing on an isolated local DB.');
    }

    if (strict && splitBrainRisk) {
        failures.push('Strict mode blocks local development against the known shared/test database.');
    }

    if (boolEnv('REQUIRE_TEAM_PROVIDER_CREDENTIALS') && !hasValue('PROVIDER_CREDENTIAL_ENCRYPTION_KEY')) {
        warnings.push('Strict team provider credentials are enabled, but PROVIDER_CREDENTIAL_ENCRYPTION_KEY is not configured.');
        if (strict) {
            failures.push('Strict mode requires PROVIDER_CREDENTIAL_ENCRYPTION_KEY when team provider credentials are required.');
        }
    }

    if (hasValue('ATLAS_API_KEY') && boolEnv('REQUIRE_TEAM_PROVIDER_CREDENTIALS')) {
        warnings.push('ATLAS_API_KEY is configured while strict team credentials are enabled. User tasks should use DB credentials, not env fallback.');
    }

    const seedInternalUsers = boolEnv('MYML_SEED_INTERNAL_USERS');
    if (seedInternalUsers && (hasValue('MYML_GROUP1_USERNAME') || hasValue('MYML_GROUP2_USERNAME'))) {
        warnings.push('group1/group2 seed variables are present. Confirm this environment is intended to manage design test users.');
    }

    const summary = {
        nodeEnv,
        strict,
        splitBrainRisk,
        isolatedDevDatabase: pointsAtKnownLocalIsolatedDb,
        database: {
            source: db.source,
            host: db.host,
            port: db.port,
            database: db.database
        },
        requireTeamProviderCredentials: boolEnv('REQUIRE_TEAM_PROVIDER_CREDENTIALS'),
        taskWorkerEnabled: workerEnabled,
        atlasProviderEnabled: boolEnv('ENABLE_ATLAS_PROVIDER'),
        atlasNanoBanana2Enabled,
        atlasApiKeyConfigured: hasValue('ATLAS_API_KEY'),
        providerCredentialEncryptionKeyConfigured: hasValue('PROVIDER_CREDENTIAL_ENCRYPTION_KEY'),
        seedInternalUsers,
        groupSeedConfigured: {
            group1: hasValue('MYML_GROUP1_USERNAME') || hasValue('MYML_GROUP1_PASSWORD'),
            group2: hasValue('MYML_GROUP2_USERNAME') || hasValue('MYML_GROUP2_PASSWORD')
        }
    };

    console.log('[EnvSafety] Summary:', summary);

    for (const warning of warnings) {
        console.warn('[EnvSafety] Warning:', warning);
    }

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error('[EnvSafety] Failed:', failure);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[EnvSafety] OK');
}

main();
