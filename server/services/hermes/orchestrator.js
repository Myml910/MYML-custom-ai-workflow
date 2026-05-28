import crypto from 'crypto';
import { getDb } from '../../db/index.js';
import { getUserPrimaryTeam } from '../../db/providerCredentials.js';
import { assertValidYxfProjectCode } from './projectCode.js';
import { getHermesClientConfig, runHermesProjectClient } from './client.js';

function requireUser(user) {
    if (!user?.id) {
        const error = new Error('Authenticated user context is required.');
        error.status = 401;
        error.code = 'HERMES_AUTH_REQUIRED';
        throw error;
    }
    return user;
}

function buildIdempotencyKey({ userId, projectCode, chatSessionId, message }) {
    return crypto
        .createHash('sha256')
        .update([userId, projectCode, chatSessionId || '', message || ''].join('\n'))
        .digest('hex');
}

function serializeHermesRun(row, assets = []) {
    return {
        id: row.id,
        status: row.status,
        userId: row.user_id,
        username: row.username,
        teamId: row.team_id,
        projectCode: row.project_code,
        chatSessionId: row.chat_session_id,
        workflowId: row.workflow_id,
        hermesRequestId: row.hermes_request_id,
        hermesRunId: row.hermes_run_id,
        project: row.project_fields || null,
        strategy: row.generation_strategy || null,
        designTask: row.design_task || null,
        assets,
        errorMessage: row.error_message || null,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        failedAt: row.failed_at
    };
}

function serializeHermesAsset(row) {
    return {
        id: row.id,
        runId: row.run_id,
        projectCode: row.project_code,
        imageId: row.hermes_asset_id,
        sourceUrl: row.source_url,
        localUrl: row.local_url,
        url: row.local_url || row.source_url,
        filename: row.filename,
        mimeType: row.mime_type,
        assetIndex: row.asset_index,
        model: row.model,
        prompt: row.prompt,
        metadata: row.metadata || null,
        createdAt: row.created_at
    };
}

function buildHermesWarning(code, scope, message) {
    return { code, scope, message };
}

function appendHermesWarning(response, warning) {
    return {
        ...response,
        warnings: [
            ...(Array.isArray(response?.warnings) ? response.warnings : []),
            warning
        ]
    };
}

async function insertHermesRun({
    client,
    runId,
    user,
    team,
    projectCode,
    chatSessionId,
    workflowId,
    message,
    idempotencyKey,
    hermesClientMode
}) {
    const result = await client.query(`
        INSERT INTO hermes_runs (
            id,
            user_id,
            username,
            team_id,
            project_code,
            chat_session_id,
            workflow_id,
            status,
            idempotency_key,
            request_payload,
            started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', $8, $9, now())
        RETURNING *
    `, [
        runId,
        user.id,
        user.username || null,
        team?.id || null,
        projectCode,
        chatSessionId || null,
        workflowId || null,
        idempotencyKey,
        {
            projectCode,
            message,
            userId: user.id,
            username: user.username || null,
            teamId: team?.id || null,
            hermesClientMode,
            mock: hermesClientMode === 'mock'
        }
    ]);
    return result.rows[0];
}

async function findRunByIdempotencyKey(client, idempotencyKey) {
    if (!idempotencyKey) return null;
    const result = await client.query(`
        SELECT *
        FROM hermes_runs
        WHERE idempotency_key = $1
        LIMIT 1
    `, [idempotencyKey]);
    return result.rows[0] || null;
}

async function listAssetsForRun(client, runId) {
    const result = await client.query(`
        SELECT *
        FROM hermes_assets
        WHERE run_id = $1
        ORDER BY asset_index ASC, created_at ASC
    `, [runId]);
    return result.rows.map(serializeHermesAsset);
}

async function completeHermesRun({ client, runId, response }) {
    const result = await client.query(`
        UPDATE hermes_runs
        SET status = 'completed',
            hermes_request_id = $2,
            hermes_run_id = $3,
            project_fields = $4,
            generation_strategy = $5,
            design_task = $6,
            response_payload = $7,
            completed_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [
        runId,
        response.hermesRequestId || null,
        response.hermesRunId || null,
        response.project || null,
        response.strategy || null,
        response.designTask || null,
        response
    ]);
    return result.rows[0];
}

async function updateHermesRunResponsePayload({ client, runId, response }) {
    const result = await client.query(`
        UPDATE hermes_runs
        SET response_payload = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [
        runId,
        response
    ]);
    return result.rows[0];
}

async function failHermesRun({ client, runId, error }) {
    const result = await client.query(`
        UPDATE hermes_runs
        SET status = 'failed',
            error_type = $2,
            error_message = $3,
            failed_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING *
    `, [
        runId,
        error?.code || 'HERMES_RUN_FAILED',
        error?.message || 'Hermes run failed.'
    ]);
    return result.rows[0];
}

async function insertHermesAssets({ client, run, response }) {
    const assets = [];
    const results = Array.isArray(response.results) ? response.results : [];

    for (const [index, item] of results.entries()) {
        const assetId = crypto.randomUUID();
        const imageUrl = typeof item.url === 'string' ? item.url : null;
        const result = await client.query(`
            INSERT INTO hermes_assets (
                id,
                run_id,
                user_id,
                team_id,
                project_code,
                hermes_asset_id,
                source_url,
                local_url,
                filename,
                mime_type,
                asset_index,
                model,
                prompt,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'image/png', $10, $11, $12, $13)
            RETURNING *
        `, [
            assetId,
            run.id,
            run.user_id,
            run.team_id,
            run.project_code,
            item.imageId || null,
            imageUrl,
            imageUrl,
            imageUrl ? imageUrl.split('/').pop() : null,
            index,
            item.model || response.strategy?.selectedModel || null,
            item.prompt || response.designTask?.prompt || null,
            {
                mock: true,
                hermesClientMode: response.hermesClientMode || null,
                remoteDownloadSkipped: true
            }
        ]);
        assets.push(serializeHermesAsset(result.rows[0]));
    }

    return assets;
}

async function markHermesRunFailed({ db, runId, error }) {
    const failClient = await db.connect();
    try {
        await failClient.query('BEGIN');
        const failedRun = await failHermesRun({
            client: failClient,
            runId,
            error
        });
        await failClient.query('COMMIT');
        const hermesRun = serializeHermesRun(failedRun, []);
        return {
            hermesRun,
            responseText: `Hermes 执行失败：${error?.message || '未知错误'}`,
            reused: false
        };
    } catch (failError) {
        await failClient.query('ROLLBACK');
        throw failError;
    } finally {
        failClient.release();
    }
}

export function buildHermesAssistantText(hermesRun) {
    const project = hermesRun.project || {};
    const strategy = hermesRun.strategy || {};
    const assetCount = Array.isArray(hermesRun.assets) ? hermesRun.assets.length : 0;
    const clientMode = hermesRun.strategy?.mode || 'mock-pattern-generation';

    if (hermesRun.status === 'failed') {
        return `Hermes 执行失败：${hermesRun.errorMessage || '请稍后重试'}`;
    }

    return [
        `已为 ${hermesRun.projectCode} 创建 Hermes 执行记录。`,
        `项目：${project.name || hermesRun.projectCode}`,
        `策略：${clientMode}，模型 ${strategy.selectedModel || 'hermes-mock-image-strategy-v1'}，图片 ${assetCount} 张。`,
        '当前是 P1 Hermes API 闭环：已记录项目字段、生成策略、设计任务和 mock 图片资产。'
    ].join('\n');
}

export async function runHermesProject({ user, projectCode, message, chatSessionId, workflowId }) {
    const currentUser = requireUser(user);
    const normalizedProjectCode = assertValidYxfProjectCode(projectCode);
    const team = await getUserPrimaryTeam(currentUser.id);
    const idempotencyKey = buildIdempotencyKey({
        userId: currentUser.id,
        projectCode: normalizedProjectCode,
        chatSessionId,
        message
    });
    const db = getDb();
    const hermesClientConfig = getHermesClientConfig();
    const client = await db.connect();
    const runId = crypto.randomUUID();
    let insertedRun = null;

    try {
        await client.query('BEGIN');
        const existingRun = await findRunByIdempotencyKey(client, idempotencyKey);
        if (existingRun) {
            const assets = await listAssetsForRun(client, existingRun.id);
            await client.query('COMMIT');
            const hermesRun = serializeHermesRun(existingRun, assets);
            return {
                hermesRun,
                responseText: buildHermesAssistantText(hermesRun),
                reused: true
            };
        }

        insertedRun = await insertHermesRun({
            client,
            runId,
            user: currentUser,
            team,
            projectCode: normalizedProjectCode,
            chatSessionId,
            workflowId,
            message,
            idempotencyKey,
            hermesClientMode: hermesClientConfig.mode
        });
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    let response;
    try {
        response = await runHermesProjectClient({
            user: currentUser,
            projectCode: normalizedProjectCode,
            message
        });
        response.hermesClientMode = hermesClientConfig.mode;
    } catch (error) {
        return await markHermesRunFailed({
            db,
            runId: insertedRun.id,
            error
        });
    }

    const completeClient = await db.connect();
    try {
        await completeClient.query('BEGIN');
        let completedRun = await completeHermesRun({
            client: completeClient,
            runId: insertedRun.id,
            response
        });

        let assets = [];
        await completeClient.query('SAVEPOINT hermes_assets_insert');
        try {
            assets = await insertHermesAssets({
                client: completeClient,
                run: completedRun,
                response
            });
            await completeClient.query('RELEASE SAVEPOINT hermes_assets_insert');
        } catch {
            await completeClient.query('ROLLBACK TO SAVEPOINT hermes_assets_insert');
            const warning = buildHermesWarning(
                'HERMES_ASSET_WRITE_FAILED',
                'hermes_assets',
                'Hermes project fields were returned, but asset placeholder creation failed.'
            );
            response = appendHermesWarning(response, warning);
            completedRun = await updateHermesRunResponsePayload({
                client: completeClient,
                runId: insertedRun.id,
                response
            });
            console.warn('[Hermes] Asset placeholder creation failed after project fields were returned.', {
                runId: insertedRun.id,
                projectCode: normalizedProjectCode,
                warningCode: warning.code
            });
        }

        await completeClient.query('COMMIT');
        const hermesRun = serializeHermesRun(completedRun, assets);
        return {
            hermesRun,
            responseText: buildHermesAssistantText(hermesRun),
            reused: false
        };
    } catch (error) {
        await completeClient.query('ROLLBACK');
        return await markHermesRunFailed({
            db,
            runId: insertedRun.id,
            error
        });
    } finally {
        completeClient.release();
    }
}

export default {
    runHermesProject,
    buildHermesAssistantText
};
