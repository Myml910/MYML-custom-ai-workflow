import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { addTaskEvent as addDbTaskEvent, serializeTask } from '../db/tasks.js';
import { claimNextImageTask as claimNextImageTaskFromQueue } from './taskQueue.js';

const TASK_SELECT = `
    SELECT
        id,
        user_id,
        username,
        workflow_id,
        node_id,
        task_type,
        provider,
        model,
        status,
        prompt,
        input,
        output,
        result_url,
        provider_task_id,
        progress,
        error_type,
        error_message,
        submitted_at,
        started_at,
        completed_at,
        failed_at,
        duration_ms,
        created_at,
        updated_at
    FROM generation_tasks
`;

function jsonOrNull(value) {
    return value === undefined ? null : value;
}

async function updateTaskWithEvent({ taskId, updateSql, updateParams, eventType, message, payload }) {
    const db = getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');
        const result = await client.query(updateSql, updateParams);

        if (result.rows[0]) {
            await client.query(`
                INSERT INTO task_events (id, task_id, event_type, message, payload)
                VALUES ($1, $2, $3, $4, $5)
            `, [crypto.randomUUID(), taskId, eventType, message, jsonOrNull(payload)]);
        }

        await client.query('COMMIT');
        return serializeTask(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function claimNextImageTask(options = {}) {
    return claimNextImageTaskFromQueue(options);
}

export async function markTaskRunning(taskId) {
    return updateTaskWithEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                updated_at = now()
            WHERE id = $1
            RETURNING *
        `,
        updateParams: [taskId],
        eventType: 'task_running',
        message: 'Image generation task marked running',
        payload: null
    });
}

export async function markTaskPolling(taskId, providerTaskId, payload = null) {
    return updateTaskWithEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'polling',
                provider_task_id = $2,
                submitted_at = COALESCE(submitted_at, now()),
                updated_at = now()
            WHERE id = $1
            RETURNING *
        `,
        updateParams: [taskId, providerTaskId],
        eventType: 'provider_submitted',
        message: 'Image generation task submitted to provider',
        payload
    });
}

export async function updateTaskProgress(taskId, progress, payload = null) {
    const normalizedProgress = Number.isFinite(Number(progress))
        ? Math.max(0, Math.min(100, Math.round(Number(progress))))
        : null;

    return updateTaskWithEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET progress = COALESCE($2, progress),
                updated_at = now()
            WHERE id = $1
            RETURNING *
        `,
        updateParams: [taskId, normalizedProgress],
        eventType: 'task_progress',
        message: 'Image generation task progress updated',
        payload
    });
}

export async function recordProviderPolling(taskId, payload = null) {
    return addDbTaskEvent(taskId, 'provider_polling', 'Provider task polled', payload);
}

export async function recordProviderPollError(taskId, payload = null) {
    return addDbTaskEvent(taskId, 'provider_poll_error', 'Provider poll failed; will retry on next worker tick', payload);
}

export async function markTaskCompleted(taskId, resultUrl, output = null) {
    return updateTaskWithEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'completed',
                result_url = $2,
                output = $3,
                progress = 100,
                completed_at = now(),
                duration_ms = CASE
                    WHEN started_at IS NOT NULL THEN FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int
                    ELSE duration_ms
                END,
                updated_at = now()
            WHERE id = $1
            RETURNING *
        `,
        updateParams: [taskId, resultUrl, jsonOrNull(output)],
        eventType: 'task_completed',
        message: 'Image generation task completed',
        payload: {
            resultUrl
        }
    });
}

export async function markTaskFailed(taskId, errorType, errorMessage, payload = null) {
    return updateTaskWithEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'failed',
                error_type = $2,
                error_message = $3,
                failed_at = now(),
                duration_ms = CASE
                    WHEN started_at IS NOT NULL THEN FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int
                    ELSE duration_ms
                END,
                updated_at = now()
            WHERE id = $1
            RETURNING *
        `,
        updateParams: [taskId, errorType, errorMessage],
        eventType: 'task_failed',
        message: errorMessage || 'Image generation task failed',
        payload
    });
}

export async function markTaskTimeout(taskId, payload = null) {
    return updateTaskWithEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'timeout',
                error_type = 'TIMEOUT',
                error_message = 'Image generation task timed out',
                failed_at = now(),
                duration_ms = CASE
                    WHEN started_at IS NOT NULL THEN FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int
                    ELSE duration_ms
                END,
                updated_at = now()
            WHERE id = $1
            RETURNING *
        `,
        updateParams: [taskId],
        eventType: 'task_timeout',
        message: 'Image generation task timed out',
        payload
    });
}

export async function addTaskEvent(taskId, eventType, message = null, payload = null) {
    return addDbTaskEvent(taskId, eventType, message, payload);
}

export async function getPollingTasks() {
    const db = getDb();
    const result = await db.query(`
        ${TASK_SELECT}
        WHERE task_type = 'image_generation'
          AND status = 'polling'
          AND provider_task_id IS NOT NULL
        ORDER BY updated_at ASC
    `);

    return result.rows.map(serializeTask);
}

export async function resetStuckRunningTasks() {
    const db = getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE generation_tasks
            SET status = 'queued',
                started_at = NULL,
                updated_at = now()
            WHERE task_type = 'image_generation'
              AND status = 'running'
              AND provider_task_id IS NULL
            RETURNING *
        `);

        for (const row of result.rows) {
            await client.query(`
                INSERT INTO task_events (id, task_id, event_type, message, payload)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                crypto.randomUUID(),
                row.id,
                'task_requeued',
                'Stuck running task without provider task id was reset to queued',
                {
                    previousStatus: 'running'
                }
            ]);
        }

        await client.query('COMMIT');
        return result.rows.map(serializeTask);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function failPollingTasksMissingProviderTaskId() {
    const db = getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE generation_tasks
            SET status = 'failed',
                error_type = 'INVALID_TASK_STATE',
                error_message = 'Polling task is missing provider_task_id',
                failed_at = now(),
                updated_at = now()
            WHERE task_type = 'image_generation'
              AND status = 'polling'
              AND provider_task_id IS NULL
            RETURNING *
        `);

        for (const row of result.rows) {
            await client.query(`
                INSERT INTO task_events (id, task_id, event_type, message, payload)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                crypto.randomUUID(),
                row.id,
                'task_failed',
                'Polling task is missing provider_task_id',
                {
                    errorType: 'INVALID_TASK_STATE',
                    previousStatus: 'polling'
                }
            ]);
        }

        await client.query('COMMIT');
        return result.rows.map(serializeTask);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
