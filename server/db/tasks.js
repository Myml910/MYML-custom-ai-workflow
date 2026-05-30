import crypto from 'crypto';
import { getDb } from './index.js';

const TASK_SELECT = `
    SELECT
        id,
        user_id,
        username,
        team_id,
        credential_id,
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

const DEFAULT_IMAGE_TASK_MAX_ATTEMPTS = 2;
const MAX_IMAGE_TASK_MAX_ATTEMPTS = 100;

function parsePositiveInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getImageTaskMaxAttempts(env = process.env) {
    const explicitAttempts = parsePositiveInteger(env.IMAGE_TASK_MAX_ATTEMPTS);
    if (explicitAttempts !== null) {
        return Math.min(explicitAttempts, MAX_IMAGE_TASK_MAX_ATTEMPTS);
    }

    const retries = parseNonNegativeInteger(env.IMAGE_TASK_MAX_RETRIES);
    if (retries !== null) {
        return Math.min(retries + 1, MAX_IMAGE_TASK_MAX_ATTEMPTS);
    }

    return DEFAULT_IMAGE_TASK_MAX_ATTEMPTS;
}

function requireUserContext(userContext) {
    if (!userContext?.id) {
        throw new Error('Authenticated user context is required');
    }

    return userContext;
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function redactTaskErrorMessage(value) {
    const raw = normalizeString(value);
    if (!raw) return null;
    if (/(402|payment required|insufficient balance|quota|billing|balance)/i.test(raw)) {
        return 'Generation failed: provider balance or quota issue.';
    }
    if (/(403|401|unauthorized|forbidden|permission|credential|api[_ -]?key)/i.test(raw)) {
        return 'Generation failed: provider credential or permission issue.';
    }
    if (/(sk-[a-z0-9_*.-]+|bearer|authorization|token|key|password|database_url|postgres|mysql|connection string)/i.test(raw)) {
        return 'Generation failed. Please retry later.';
    }
    return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

function getOutputResultUrl(row) {
    if (normalizeString(row?.result_url)) {
        return normalizeString(row.result_url);
    }

    const output = row?.output && typeof row.output === 'object' && !Array.isArray(row.output)
        ? row.output
        : null;
    if (!output) return null;

    const directUrl = output.resultUrl || output.url || output.imageUrl || output.assetUrl || output.outputUrl;
    if (normalizeString(directUrl)) {
        return normalizeString(directUrl);
    }

    const images = Array.isArray(output.images) ? output.images : [];
    for (const image of images) {
        if (normalizeString(image)) return normalizeString(image);
        if (image && typeof image === 'object' && !Array.isArray(image)) {
            const imageUrl = image.url || image.resultUrl || image.imageUrl || image.assetUrl || image.outputUrl;
            if (normalizeString(imageUrl)) return normalizeString(imageUrl);
        }
    }

    return null;
}

function serializeHermesGenerationTask(row) {
    const input = row?.input && typeof row.input === 'object' && !Array.isArray(row.input)
        ? row.input
        : {};

    return {
        generationTaskId: row.id,
        status: row.status,
        model: row.model,
        provider: row.provider,
        designTaskId: normalizeString(input.designTaskId) || null,
        projectCode: normalizeString(input.projectCode) || null,
        hermesRunId: normalizeString(input.hermesRunId) || null,
        resultUrl: getOutputResultUrl(row),
        progress: row.progress,
        errorMessageSafe: redactTaskErrorMessage(row.error_message || row.last_error),
        originalModelRecommendation: normalizeString(input.originalModelRecommendation) || null,
        normalizedModelRecommendation: normalizeString(input.normalizedModelRecommendation) || null,
        finalPrompt: normalizeString(input.finalPrompt) || null,
        generationPrompt: normalizeString(input.generationPrompt) || null,
        referenceIds: Array.isArray(input.referenceIds) ? input.referenceIds.filter(item => normalizeString(item)) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function serializeTask(row) {
    if (!row) return null;

    return {
        taskId: row.id,
        userId: row.user_id,
        username: row.username,
        teamId: row.team_id,
        credentialId: row.credential_id,
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
        lockedBy: row.locked_by,
        lockedAt: row.locked_at,
        leaseExpiresAt: row.lease_expires_at,
        heartbeatAt: row.heartbeat_at,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export async function getHermesGenerationTasksForRun({ userId, hermesRunId, projectCode = null }) {
    const normalizedUserId = normalizeString(userId);
    const normalizedHermesRunId = normalizeString(hermesRunId);
    const normalizedProjectCode = normalizeString(projectCode);

    if (!normalizedUserId) {
        throw new Error('Authenticated user context is required');
    }
    if (!normalizedHermesRunId) {
        return [];
    }

    const db = getDb();
    const params = [normalizedUserId, normalizedHermesRunId];
    let projectFilter = '';
    if (normalizedProjectCode) {
        params.push(normalizedProjectCode);
        projectFilter = `AND input->>'projectCode' = $${params.length}`;
    }

    const result = await db.query(`
        ${TASK_SELECT}
        WHERE user_id = $1
          AND input->>'source' = 'hermes_design_task'
          AND input->>'hermesRunId' = $2
          ${projectFilter}
        ORDER BY created_at ASC
        LIMIT 100
    `, params);

    return result.rows.map(serializeHermesGenerationTask);
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
    const maxAttempts = getImageTaskMaxAttempts();

    const taskInput = {
        nodeId: input.nodeId,
        workflowId: input.workflowId || null,
        prompt: input.prompt,
        imageModel: input.imageModel,
        aspectRatio: input.aspectRatio || null,
        resolution: input.resolution || null,
        quality: input.quality || null,
        source: input.source || null,
        legacySource: input.legacySource || null,
        capability: input.capability || null,
        referenceImages: input.referenceImages || null,
        negativePrompt: input.negativePrompt || null,
        finalPrompt: input.finalPrompt || null,
        generationPrompt: input.generationPrompt || null,
        projectCode: input.projectCode || null,
        hermesRunId: input.hermesRunId || null,
        designTaskId: input.designTaskId || null,
        title: input.title || null,
        targetSize: input.targetSize || null,
        referenceIds: Array.isArray(input.referenceIds) && input.referenceIds.length > 0 ? input.referenceIds : null,
        referenceUsage: input.referenceUsage || null,
        originalModelRecommendation: input.originalModelRecommendation || null,
        normalizedModelRecommendation: input.normalizedModelRecommendation || null
    };
    const credentialContext = {
        teamId: input.teamId || null,
        credentialId: input.credentialId || null,
        credentialSource: input.credentialSource || 'env',
        apiKeyLast4: input.apiKeyLast4 || null
    };

    try {
        await client.query('BEGIN');

        const result = await client.query(`
            INSERT INTO generation_tasks (
                id,
                user_id,
                username,
                team_id,
                credential_id,
                workflow_id,
                node_id,
                task_type,
                provider,
                model,
                status,
                prompt,
                input,
                progress,
                max_attempts
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            taskId,
            user.id,
            user.username || null,
            credentialContext.teamId,
            credentialContext.credentialId,
            input.workflowId || null,
            input.nodeId,
            input.taskType || 'image_generation',
            input.provider || 'apimart',
            input.imageModel,
            status,
            input.prompt,
            taskInput,
            progress,
            maxAttempts
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
                provider: input.provider || 'apimart',
                maxAttempts,
                teamId: credentialContext.teamId,
                credentialId: credentialContext.credentialId,
                credentialSource: credentialContext.credentialSource,
                apiKeyLast4: credentialContext.apiKeyLast4,
                source: input.source || null,
                hermesRunId: input.hermesRunId || null,
                designTaskId: input.designTaskId || null,
                projectCode: input.projectCode || null,
                originalModelRecommendation: input.originalModelRecommendation || null,
                normalizedModelRecommendation: input.normalizedModelRecommendation || null,
                hasGenerationPrompt: Boolean(input.generationPrompt)
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
