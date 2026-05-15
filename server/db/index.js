import { Pool } from 'pg';

let db = null;

function parseBoolean(value) {
    return ['1', 'true', 'yes', 'require'].includes(String(value || '').toLowerCase());
}

function getSslConfig() {
    if (!parseBoolean(process.env.PGSSL)) {
        return undefined;
    }

    return { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' };
}

function readEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }

    return undefined;
}

function requirePostgresConfig(config) {
    const missing = [];

    if (!config.user) missing.push('PGUSER or POSTGRES_USER');
    if (typeof config.password !== 'string') missing.push('PGPASSWORD or POSTGRES_PASSWORD');
    if (!config.database) missing.push('PGDATABASE or POSTGRES_DB');

    if (missing.length > 0) {
        throw new Error(`PostgreSQL users/auth database is not configured. Missing: ${missing.join(', ')}. Set DATABASE_URL or the PG*/POSTGRES_* variables.`);
    }
}

function getPoolConfig() {
    const ssl = getSslConfig();

    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            ssl
        };
    }

    const config = {
        host: readEnv('PGHOST', 'POSTGRES_HOST') || '127.0.0.1',
        port: Number(readEnv('PGPORT', 'POSTGRES_PORT') || 5432),
        user: readEnv('PGUSER', 'POSTGRES_USER'),
        password: readEnv('PGPASSWORD', 'POSTGRES_PASSWORD'),
        database: readEnv('PGDATABASE', 'POSTGRES_DB'),
        ssl
    };

    requirePostgresConfig(config);
    return config;
}

export function getDatabaseLabel() {
    if (process.env.DATABASE_URL) {
        return 'PostgreSQL DATABASE_URL';
    }

    const host = readEnv('PGHOST', 'POSTGRES_HOST') || '127.0.0.1';
    const port = readEnv('PGPORT', 'POSTGRES_PORT') || 5432;
    const database = readEnv('PGDATABASE', 'POSTGRES_DB') || '(unset)';
    return `PostgreSQL ${host}:${port}/${database}`;
}

export function getDb() {
    if (db) return db;

    db = new Pool(getPoolConfig());
    return db;
}

export async function closeDb() {
    if (db) {
        await db.end();
        db = null;
    }
}
