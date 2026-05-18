import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { serializeTask } from '../db/tasks.js';

const ACTIVE_TASK_STATUSES = ['running', 'polling'];
const DEFAULT_SYSTEM_MAX_RUNNING_IMAGE_TASKS = 8;
const DEFAULT_USER_MAX_RUNNING_IMAGE_TASKS = 2;
const DEFAULT_APIMART_MAX_RUNNING_IMAGE_TASKS = 4;
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
            env.APIMART_MAX_RUNNING_IMAGE_TASKS,
            DEFAULT_APIMART_MAX_RUNNING_IMAGE_TASKS
        )
    };
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

    if (task.provider === 'apimart') {
        const providerCount = await countActiveTasks(client, 'AND provider = $2', [task.provider]);
        if (providerCount >= options.apimartMaxRunningImageTasks) {
            return false;
        }
    }

    return true;
}

export async function claimNextImageTask(options = {}) {
    const db = getDb();
    const concurrencyOptions = {
        ...getImageTaskConcurrencyOptions(),
        ...options
    };
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const candidates = await client.query(`
            SELECT *
            FROM generation_tasks
            WHERE task_type = 'image_generation'
              AND status = 'queued'
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
                    started_at = COALESCE(started_at, now()),
                    updated_at = now()
                WHERE id = $1
                RETURNING *
            `, [candidate.id]);

            await client.query(`
                INSERT INTO task_events (id, task_id, event_type, message, payload)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                crypto.randomUUID(),
                candidate.id,
                'task_claimed',
                'Image generation task claimed by worker',
                {
                    provider: candidate.provider,
                    model: candidate.model
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
