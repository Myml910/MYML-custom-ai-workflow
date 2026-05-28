import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

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
    console.log('[HermesDB] Troubleshooting checklist:');
    console.log('1. Is DATABASE_URL configured on the MYML Canvas server?');
    console.log('2. Has the MYML Canvas PostgreSQL database been migrated?');
    console.log('3. Can the server reach PostgreSQL from this host?');
    console.log('4. Does the database user have read access to hermes_runs?');
}

const databaseUrl = cleanString(process.env.DATABASE_URL);

if (!databaseUrl) {
    console.log('[HermesDB] DATABASE_URL is missing. The value was not printed.');
    process.exitCode = 1;
} else {
    const pool = new Pool({
        connectionString: databaseUrl,
        application_name: 'myml-hermes-readonly-check',
        max: 1,
    });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN READ ONLY');
        const result = await client.query(`
            SELECT
                id,
                project_code,
                status,
                project_fields->>'source' AS project_source,
                project_fields->>'mock' AS project_mock,
                created_at
            FROM hermes_runs
            ORDER BY created_at DESC
            LIMIT 5
        `);
        await client.query('COMMIT');

        if (result.rows.length === 0) {
            console.log('[HermesDB] hermes_runs exists, but no rows were found.');
        } else {
            console.log('[HermesDB] Recent hermes_runs rows (safe fields only):');
            console.table(result.rows.map(row => ({
                id: row.id,
                project_code: row.project_code,
                status: row.status,
                source: row.project_source,
                mock: row.project_mock,
                created_at: formatDate(row.created_at),
            })));
        }
    } catch (error) {
        try {
            if (client) await client.query('ROLLBACK');
        } catch {
            // Ignore rollback errors in a read-only check.
        }

        if (error?.code === '42P01') {
            console.log('[HermesDB] hermes_runs table does not exist yet.');
            console.log('[HermesDB] Confirm migrations have run on the MYML Canvas PostgreSQL database.');
        } else {
            console.log('[HermesDB] Read-only check failed.');
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
