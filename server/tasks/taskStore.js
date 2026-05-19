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
        locked_by,
        locked_at,
        lease_expires_at,
        heartbeat_at,
        attempt_count,
        max_attempts,
        last_error,
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
                heartbeat_at = now(),
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
    return updateTerminalTaskWithBestEffortEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'completed',
                result_url = $2,
                output = $3,
                progress = 100,
                completed_at = now(),
                locked_by = NULL,
                locked_at = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
                last_error = NULL,
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
    return updateTerminalTaskWithBestEffortEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'failed',
                error_type = $2,
                error_message = $3,
                last_error = $3,
                failed_at = now(),
                locked_by = NULL,
                locked_at = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
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
    return updateTerminalTaskWithBestEffortEvent({
        taskId,
        updateSql: `
            UPDATE generation_tasks
            SET status = 'timeout',
                error_type = 'TIMEOUT',
                error_message = 'Image generation task timed out',
                last_error = 'Image generation task timed out',
                failed_at = now(),
                locked_by = NULL,
                locked_at = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
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

export async function heartbeatTask(taskId, workerId, leaseMs, payload = null) {
    const db = getDb();
    const leaseIntervalMs = Math.max(1000, Number(leaseMs) || 120000);
    const result = await db.query(`
        UPDATE generation_tasks
        SET heartbeat_at = now(),
            lease_expires_at = now() + ($3::int * interval '1 millisecond'),
            updated_at = now()
        WHERE id = $1
          AND locked_by = $2
          AND status IN ('running', 'polling')
        RETURNING *
    `, [taskId, workerId, leaseIntervalMs]);

    const task = serializeTask(result.rows[0]);
    if (!task) return null;

    await addDbTaskEvent(taskId, 'task_heartbeat', 'Task worker heartbeat', {
        workerId,
        attemptCount: task.attemptCount,
        provider: task.provider,
        leaseExpiresAt: task.leaseExpiresAt,
        ...(payload && typeof payload === 'object' ? payload : {})
    });

    return task;
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

export async function claimPollingImageTasks(options = {}) {
    const db = getDb();
    const workerId = options.workerId;
    const limit = Math.max(1, Number(options.limit) || 1);
    const leaseMs = Math.max(1000, Number(options.leaseMs) || 120000);
    if (!workerId) {
        throw new Error('workerId is required to claim polling image tasks');
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            WITH candidates AS (
                SELECT id
                FROM generation_tasks
                WHERE task_type = 'image_generation'
                  AND status = 'polling'
                  AND provider_task_id IS NOT NULL
                  AND (
                    locked_by IS NULL
                    OR locked_by = $1
                    OR lease_expires_at IS NULL
                    OR lease_expires_at < now()
                  )
                ORDER BY updated_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT $2
            )
            UPDATE generation_tasks task
            SET locked_by = $1,
                locked_at = COALESCE(task.locked_at, now()),
                lease_expires_at = now() + ($3::int * interval '1 millisecond'),
                heartbeat_at = now(),
                updated_at = now()
            FROM candidates
            WHERE task.id = candidates.id
            RETURNING task.*
        `, [workerId, limit, leaseMs]);

        for (const row of result.rows) {
            await client.query(`
                INSERT INTO task_events (id, task_id, event_type, message, payload)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                crypto.randomUUID(),
                row.id,
                'task_claimed',
                'Polling image generation task claimed by worker',
                {
                    workerId,
                    attemptCount: row.attempt_count,
                    provider: row.provider,
                    leaseExpiresAt: row.lease_expires_at
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

async function addTaskEventBestEffort(taskId, eventType, message = null, payload = null) {
    try {
        await addDbTaskEvent(taskId, eventType, message, jsonOrNull(payload));
    } catch (error) {
        console.warn('[TaskStore] Failed to write task event:', {
            taskId,
            eventType,
            error: error?.message || error
        });
    }
}

async function updateTerminalTaskWithBestEffortEvent({ taskId, updateSql, updateParams, eventType, message, payload }) {
    const db = getDb();
    const result = await db.query(updateSql, updateParams);
    const task = serializeTask(result.rows[0]);

    if (task) {
        await addTaskEventBestEffort(taskId, eventType, message, payload);
    }

    return task;
}

export async function sweepExpiredRunningLeases(options = {}) {
    const db = getDb();
    const workerId = options.workerId || null;
    const client = await db.connect();

    try {
        await client.query('BEGIN');
        const expired = await client.query(`
            SELECT *
            FROM generation_tasks
            WHERE task_type = 'image_generation'
              AND status = 'running'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at < now()
            FOR UPDATE SKIP LOCKED
        `);

        const resumedPolling = [];
        const requeued = [];
        const timedOut = [];

        for (const row of expired.rows) {
            const attempts = Number(row.attempt_count || 0);
            const maxAttempts = Number(row.max_attempts || 2);
            if (row.provider_task_id) {
                const result = await client.query(`
                    UPDATE generation_tasks
                    SET status = 'polling',
                        locked_by = NULL,
                        locked_at = NULL,
                        lease_expires_at = NULL,
                        heartbeat_at = NULL,
                        last_error = 'Lease expired after provider submission; resumed polling',
                        updated_at = now()
                    WHERE id = $1
                    RETURNING *
                `, [row.id]);

                await client.query(`
                    INSERT INTO task_events (id, task_id, event_type, message, payload)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    crypto.randomUUID(),
                    row.id,
                    'lease_expired_resume_polling',
                    'Worker lease expired after provider submission; task resumed polling',
                    {
                        workerId,
                        previousWorkerId: row.locked_by,
                        attemptCount: attempts,
                        maxAttempts,
                        provider: row.provider,
                        providerTaskId: row.provider_task_id,
                        leaseExpiresAt: row.lease_expires_at,
                        error: 'Lease expired after provider submission; resumed polling'
                    }
                ]);

                resumedPolling.push(serializeTask(result.rows[0]));
                continue;
            }

            if (attempts < maxAttempts) {
                const result = await client.query(`
                    UPDATE generation_tasks
                    SET status = 'queued',
                        locked_by = NULL,
                        locked_at = NULL,
                        lease_expires_at = NULL,
                        heartbeat_at = NULL,
                        last_error = 'Worker lease expired before task completed',
                        updated_at = now()
                    WHERE id = $1
                    RETURNING *
                `, [row.id]);

                const payload = {
                    workerId,
                    previousWorkerId: row.locked_by,
                    attemptCount: attempts,
                    maxAttempts,
                    provider: row.provider,
                    leaseExpiresAt: row.lease_expires_at,
                    error: 'Worker lease expired before task completed'
                };

                await client.query(`
                    INSERT INTO task_events (id, task_id, event_type, message, payload)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    crypto.randomUUID(),
                    row.id,
                    'lease_expired_requeued',
                    'Worker lease expired; task returned to queued',
                    payload
                ]);

                await client.query(`
                    INSERT INTO task_events (id, task_id, event_type, message, payload)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    crypto.randomUUID(),
                    row.id,
                    'task_retry_scheduled',
                    'Task retry scheduled after worker lease expired',
                    payload
                ]);

                requeued.push(serializeTask(result.rows[0]));
            } else {
                const result = await client.query(`
                    UPDATE generation_tasks
                    SET status = 'timeout',
                        error_type = 'LEASE_EXPIRED',
                        error_message = 'Worker lease expired and max attempts were reached',
                        last_error = 'Worker lease expired and max attempts were reached',
                        failed_at = now(),
                        locked_by = NULL,
                        locked_at = NULL,
                        lease_expires_at = NULL,
                        heartbeat_at = NULL,
                        updated_at = now()
                    WHERE id = $1
                    RETURNING *
                `, [row.id]);

                await client.query(`
                    INSERT INTO task_events (id, task_id, event_type, message, payload)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    crypto.randomUUID(),
                    row.id,
                    'lease_expired_timeout',
                    'Worker lease expired; task timed out after max attempts',
                    {
                        workerId,
                        previousWorkerId: row.locked_by,
                        attemptCount: attempts,
                        maxAttempts,
                        provider: row.provider,
                        leaseExpiresAt: row.lease_expires_at,
                        error: 'Worker lease expired and max attempts were reached'
                    }
                ]);

                timedOut.push(serializeTask(result.rows[0]));
            }
        }

        await client.query('COMMIT');
        return { resumedPolling, requeued, timedOut };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
                last_error = 'Polling task is missing provider_task_id',
                failed_at = now(),
                locked_by = NULL,
                locked_at = NULL,
                lease_expires_at = NULL,
                heartbeat_at = NULL,
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
