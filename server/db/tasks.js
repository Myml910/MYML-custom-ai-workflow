import crypto from 'crypto';
import { getDb } from './index.js';

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

function requireUserContext(userContext) {
    if (!userContext?.id) {
        throw new Error('Authenticated user context is required');
    }

    return userContext;
}

export function serializeTask(row) {
    if (!row) return null;

    return {
        taskId: row.id,
        userId: row.user_id,
        username: row.username,
        workflowId: row.workflow_id,
        nodeId: row.node_id,
        taskType: row.task_type,
        provider: row.provider,
        model: row.model,
        status: row.status,
        prompt: row.prompt,
        input: row.input,
        output: row.output,
        resultUrl: row.result_url,
        providerTaskId: row.provider_task_id,
        progress: row.progress,
        errorType: row.error_type,
        errorMessage: row.error_message,
        submittedAt: row.submitted_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        failedAt: row.failed_at,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export async function addTaskEvent(taskId, eventType, message = null, payload = null) {
    const db = getDb();
    const eventId = crypto.randomUUID();

    await db.query(`
        INSERT INTO task_events (id, task_id, event_type, message, payload)
        VALUES ($1, $2, $3, $4, $5)
    `, [eventId, taskId, eventType, message, payload || null]);

    return {
        id: eventId,
        taskId,
        eventType,
        message,
        payload
    };
}

export async function createTask(input) {
    const user = requireUserContext(input?.user);
    const db = getDb();
    const client = await db.connect();
    const taskId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const status = 'queued';
    const progress = 0;

    const taskInput = {
        nodeId: input.nodeId,
        workflowId: input.workflowId || null,
        prompt: input.prompt,
        imageModel: input.imageModel,
        aspectRatio: input.aspectRatio || null,
        resolution: input.resolution || null,
        referenceImages: input.referenceImages || null
    };

    try {
        await client.query('BEGIN');

        const result = await client.query(`
            INSERT INTO generation_tasks (
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
                progress
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            taskId,
            user.id,
            user.username || null,
            input.workflowId || null,
            input.nodeId,
            input.taskType || 'image_generation',
            input.provider || 'apimart',
            input.imageModel,
            status,
            input.prompt,
            taskInput,
            progress
        ]);

        await client.query(`
            INSERT INTO task_events (id, task_id, event_type, message, payload)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            eventId,
            taskId,
            'task_created',
            'Image generation task created',
            {
                nodeId: input.nodeId,
                workflowId: input.workflowId || null,
                model: input.imageModel,
                provider: input.provider || 'apimart'
            }
        ]);

        await client.query('COMMIT');
        return serializeTask(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function getTaskById(taskId, userContext) {
    const user = requireUserContext(userContext);
    const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : '';
    if (!normalizedTaskId) {
        return null;
    }

    const db = getDb();
    const result = await db.query(`
        ${TASK_SELECT}
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
    `, [normalizedTaskId, user.id]);

    return serializeTask(result.rows[0]);
}

export async function cancelTask(taskId, userContext) {
    const user = requireUserContext(userContext);
    const normalizedTaskId = typeof taskId === 'string' ? taskId.trim() : '';
    if (!normalizedTaskId) {
        return null;
    }

    const db = getDb();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const existing = await client.query(`
            ${TASK_SELECT}
            WHERE id = $1
              AND user_id = $2
            FOR UPDATE
            LIMIT 1
        `, [normalizedTaskId, user.id]);

        const row = existing.rows[0];
        if (!row) {
            await client.query('COMMIT');
            return null;
        }

        if (row.status !== 'queued') {
            await client.query('COMMIT');
            return serializeTask(row);
        }

        const result = await client.query(`
            UPDATE generation_tasks
            SET status = 'cancelled',
                updated_at = now()
            WHERE id = $1
              AND user_id = $2
            RETURNING *
        `, [normalizedTaskId, user.id]);

        await client.query(`
            INSERT INTO task_events (id, task_id, event_type, message, payload)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            crypto.randomUUID(),
            normalizedTaskId,
            'task_cancelled',
            'Task cancelled by user',
            {
                previousStatus: 'queued',
                userId: user.id
            }
        ]);

        await client.query('COMMIT');
        return serializeTask(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function getLatestTaskByNodeId(nodeId, userContext, workflowId = null) {
    const user = requireUserContext(userContext);
    const db = getDb();
    const hasWorkflowId = typeof workflowId === 'string' && workflowId.trim().length > 0;

    const result = hasWorkflowId
        ? await db.query(`
            ${TASK_SELECT}
            WHERE user_id = $1
              AND workflow_id = $2
              AND node_id = $3
            ORDER BY created_at DESC
            LIMIT 1
        `, [user.id, workflowId.trim(), nodeId])
        : await db.query(`
            ${TASK_SELECT}
            WHERE user_id = $1
              AND node_id = $2
            ORDER BY created_at DESC
            LIMIT 1
        `, [user.id, nodeId]);

    return serializeTask(result.rows[0]);
}
