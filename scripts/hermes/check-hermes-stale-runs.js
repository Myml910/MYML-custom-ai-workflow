import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const STALE_MINUTES = 15;
const STALE_LIMIT = 20;

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function formatDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function getSafeDbErrorType(error) {
    if (error?.code === '28P01') return 'authentication_failed';
    if (error?.code === '3D000') return 'database_not_found';
    if (error?.code === '42P01') return 'table_not_found';
    if (error?.code === 'ECONNREFUSED') return 'connection_refused';
    if (error?.code === 'ENOTFOUND') return 'host_not_found';
    if (error?.code === 'ETIMEDOUT' || error?.code === 'ETIMEOUT') return 'connection_timeout';
    if (error?.name === 'AggregateError') return 'connection_failed';
    return 'read_check_failed';
}

function printDbTroubleshooting() {
    console.log('[HermesStale] Troubleshooting checklist:');
    console.log('1. Is DATABASE_URL configured on the MYML Canvas server?');
    console.log('2. Has the MYML Canvas PostgreSQL database been migrated?');
    console.log('3. Can the server reach PostgreSQL from this host?');
    console.log('4. Does the database user have read access to hermes_runs?');
}

async function hasColumn(client, tableName, columnName) {
    const result = await client.query(`
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
        ) AS exists
    `, [tableName, columnName]);
    return Boolean(result.rows[0]?.exists);
}

const databaseUrl = cleanString(process.env.DATABASE_URL);

if (!databaseUrl) {
    console.log('[HermesStale] DATABASE_URL is missing. The value was not printed.');
    process.exitCode = 1;
} else {
    const pool = new Pool({
        connectionString: databaseUrl,
        application_name: 'myml-hermes-stale-readonly-check',
        max: 1,
    });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN READ ONLY');

        const hasUpdatedAt = await hasColumn(client, 'hermes_runs', 'updated_at');
        const staleColumn = hasUpdatedAt ? 'updated_at' : 'created_at';

        const result = await client.query(`
            SELECT id, project_code, status, created_at, updated_at
            FROM hermes_runs
            WHERE status = 'running'
              AND ${staleColumn} < now() - ($1::text)::interval
            ORDER BY ${staleColumn} ASC
            LIMIT $2
        `, [`${STALE_MINUTES} minutes`, STALE_LIMIT]);
        await client.query('COMMIT');

        if (!hasUpdatedAt) {
            console.log('[HermesStale] updated_at column not found; checked stale runs using created_at.');
        }

        if (result.rows.length === 0) {
            console.log(`[HermesStale] OK: no running Hermes runs older than ${STALE_MINUTES} minutes.`);
        } else {
            console.log(`[HermesStale] Found ${result.rows.length} running Hermes run(s) older than ${STALE_MINUTES} minutes.`);
            console.table(result.rows.map(row => ({
                id: row.id,
                project_code: row.project_code,
                status: row.status,
                created_at: formatDate(row.created_at),
                updated_at: formatDate(row.updated_at),
            })));
            console.log('[HermesStale] These rows require manual confirmation. This script did not update the database.');
            process.exitCode = 1;
        }
    } catch (error) {
        try {
            if (client) await client.query('ROLLBACK');
        } catch {
            // Ignore rollback errors in a read-only check.
        }

        if (error?.code === '42P01') {
            console.log('[HermesStale] hermes_runs table does not exist yet.');
            console.log('[HermesStale] Confirm migrations have run on the MYML Canvas PostgreSQL database.');
        } else {
            console.log('[HermesStale] Read-only stale run check failed.');
            console.log(`errorType: ${getSafeDbErrorType(error)}`);
            console.log(`errorCode: ${error?.code || 'unknown'}`);
            printDbTroubleshooting();
        }
        process.exitCode = 1;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

