import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { serializeTask } from '../db/tasks.js';

const ACTIVE_TASK_STATUSES = ['running', 'polling'];
const DEFAULT_SYSTEM_MAX_RUNNING_IMAGE_TASKS = 8;
const DEFAULT_USER_MAX_RUNNING_IMAGE_TASKS = 2;
const DEFAULT_APIMART_MAX_RUNNING_IMAGE_TASKS = 4;
const DEFAULT_DATALER_MAX_RUNNING_IMAGE_TASKS = 1;
const DEFAULT_PIKACHU_MAX_RUNNING_IMAGE_TASKS = 1;
const DEFAULT_PROVIDER_MAX_RUNNING_IMAGE_TASKS = 2;
const DEFAULT_TASK_LEASE_MS = 120000;
const IMAGE_TASK_CLAIM_LOCK_KEY = 9104246;
const CLAIM_BATCH_SIZE = 25;

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getImageTaskConcurrencyOptions(env = process.env) {
    return {
        systemMaxRunningImageTasks: parsePositiveInteger(
            env.SYSTEM_MAX_RUNNING_IMAGE_TASKS,
            DEFAULT_SYSTEM_MAX_RUNNING_IMAGE_TASKS
        ),
        userMaxRunningImageTasks: parsePositiveInteger(
            env.USER_MAX_RUNNING_IMAGE_TASKS,
            DEFAULT_USER_MAX_RUNNING_IMAGE_TASKS
        ),
        apimartMaxRunningImageTasks: parsePositiveInteger(
            env.PROVIDER_MAX_RUNNING_APIMART || env.APIMART_MAX_RUNNING_IMAGE_TASKS,
            DEFAULT_APIMART_MAX_RUNNING_IMAGE_TASKS
        ),
        datalerMaxRunningImageTasks: parsePositiveInteger(
            env.PROVIDER_MAX_RUNNING_DATALER,
            DEFAULT_DATALER_MAX_RUNNING_IMAGE_TASKS
        ),
        pikachuMaxRunningImageTasks: parsePositiveInteger(
            env.PROVIDER_MAX_RUNNING_PIKACHU,
            DEFAULT_PIKACHU_MAX_RUNNING_IMAGE_TASKS
        ),
        providerDefaultMaxRunningImageTasks: parsePositiveInteger(
            env.PROVIDER_MAX_RUNNING_IMAGE_TASKS,
            DEFAULT_PROVIDER_MAX_RUNNING_IMAGE_TASKS
        )
    };
}

export function getTaskLeaseOptions(env = process.env) {
    return {
        leaseMs: parsePositiveInteger(env.TASK_LEASE_MS, DEFAULT_TASK_LEASE_MS)
    };
}

function getProviderMaxRunning(provider, options) {
    if (provider === 'apimart') return options.apimartMaxRunningImageTasks;
    if (provider === 'dataler') return options.datalerMaxRunningImageTasks;
    if (provider === 'pikachu') return options.pikachuMaxRunningImageTasks;
    return options.providerDefaultMaxRunningImageTasks;
}

async function countActiveTasks(client, whereSql = '', params = []) {
    const result = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM generation_tasks
        WHERE task_type = 'image_generation'
          AND status = ANY($1)
          ${whereSql}
    `, [ACTIVE_TASK_STATUSES, ...params]);

    return result.rows[0]?.count || 0;
}

async function hasCapacityForTask(client, task, options) {
    const systemCount = await countActiveTasks(client);
    if (systemCount >= options.systemMaxRunningImageTasks) {
        return false;
    }

    const userCount = await countActiveTasks(client, 'AND user_id = $2', [task.user_id]);
    if (userCount >= options.userMaxRunningImageTasks) {
        return false;
    }

    const providerCount = await countActiveTasks(client, 'AND provider = $2', [task.provider]);
    if (providerCount >= getProviderMaxRunning(task.provider, options)) {
        return false;
    }

    return true;
}

export async function claimNextImageTask(options = {}) {
    const db = getDb();
    const concurrencyOptions = {
        ...getImageTaskConcurrencyOptions(),
        ...options
    };
    const leaseOptions = {
        ...getTaskLeaseOptions(),
        ...options
    };
    const workerId = options.workerId || `worker-${process.pid}-${Date.now()}`;
    const client = await db.connect();

    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [IMAGE_TASK_CLAIM_LOCK_KEY]);

        const candidates = await client.query(`
            SELECT *
            FROM generation_tasks
            WHERE task_type = 'image_generation'
              AND status = 'queued'
              AND COALESCE(attempt_count, 0) < COALESCE(max_attempts, 2)
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $1
        `, [CLAIM_BATCH_SIZE]);

        let claimedTask = null;
        for (const candidate of candidates.rows) {
            if (!await hasCapacityForTask(client, candidate, concurrencyOptions)) {
                continue;
            }

            const result = await client.query(`
                UPDATE generation_tasks
                SET status = 'running',
                    locked_by = $2,
                    locked_at = now(),
                    lease_expires_at = now() + ($3::int * interval '1 millisecond'),
                    heartbeat_at = now(),
                    attempt_count = COALESCE(attempt_count, 0) + 1,
                    started_at = COALESCE(started_at, now()),
                    updated_at = now()
                WHERE id = $1
                RETURNING *
            `, [candidate.id, workerId, leaseOptions.leaseMs]);

            await client.query(`
                INSERT INTO task_events (id, task_id, event_type, message, payload)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                crypto.randomUUID(),
                candidate.id,
                'task_claimed',
                'Image generation task claimed by worker',
                {
                    workerId,
                    provider: candidate.provider,
                    model: candidate.model,
                    attemptCount: result.rows[0]?.attempt_count,
                    leaseExpiresAt: result.rows[0]?.lease_expires_at
                }
            ]);

            claimedTask = serializeTask(result.rows[0]);
            break;
        }

        await client.query('COMMIT');
        return claimedTask;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
