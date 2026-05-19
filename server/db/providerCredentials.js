import crypto from 'crypto';
import { getDb } from './index.js';

function serializeTeam(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        role: row.membership_role || row.role || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function serializeCredential(row, team = null) {
    if (!row) return null;
    return {
        id: row.id,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        provider: row.provider,
        label: row.label,
        baseUrl: row.base_url,
        apiKeyEncrypted: row.api_key_encrypted,
        apiKeyLast4: row.api_key_last4,
        status: row.status,
        priority: row.priority,
        createdBy: row.created_by,
        team,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function getTeamById(teamId) {
    if (!teamId) return null;

    const db = getDb();
    const result = await db.query(`
        SELECT *
        FROM teams
        WHERE id = $1
        LIMIT 1
    `, [teamId]);

    return serializeTeam(result.rows[0]);
}

export function decryptProviderApiKey(value) {
    // Centralized passthrough placeholder. Replace with KMS/crypto before storing real encrypted values.
    return typeof value === 'string' ? value : '';
}

export async function getUserPrimaryTeam(userId) {
    if (!userId) return null;

    const db = getDb();
    const result = await db.query(`
        SELECT
            teams.*,
            user_team_memberships.role AS membership_role
        FROM user_team_memberships
        JOIN teams ON teams.id = user_team_memberships.team_id
        WHERE user_team_memberships.user_id = $1
          AND teams.status = 'active'
        ORDER BY user_team_memberships.created_at ASC
        LIMIT 1
    `, [userId]);

    return serializeTeam(result.rows[0]);
}

async function findActiveCredential({ provider, scopeType, scopeId = null }) {
    const db = getDb();
    const params = [provider, scopeType];
    let scopeSql = 'scope_id IS NULL';

    if (scopeId) {
        params.push(scopeId);
        scopeSql = `scope_id = $${params.length}`;
    }

    const result = await db.query(`
        SELECT *
        FROM provider_credentials
        WHERE provider = $1
          AND scope_type = $2
          AND ${scopeSql}
          AND status = 'active'
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
    `, params);

    return result.rows[0] || null;
}

export async function getProviderCredentialById(credentialId, options = {}) {
    if (!credentialId) return null;

    const db = getDb();
    const statusSql = options.includeInactive === true ? '' : "AND status = 'active'";
    const result = await db.query(`
        SELECT *
        FROM provider_credentials
        WHERE id = $1
          ${statusSql}
        LIMIT 1
    `, [credentialId]);

    const credential = result.rows[0];
    if (!credential) return null;

    // A task that already submitted to a provider should keep polling with the
    // submitted credential. Disabling a credential prevents future selection,
    // but existing provider tasks may still need it to avoid switching keys.
    const team = credential.scope_type === 'team'
        ? await getTeamById(credential.scope_id)
        : null;

    return serializeCredential(credential, team);
}

export async function getProviderCredentialForUser({ userId, provider }) {
    if (!provider) return null;

    const team = await getUserPrimaryTeam(userId);
    if (team?.id) {
        const teamCredential = await findActiveCredential({
            provider,
            scopeType: 'team',
            scopeId: team.id
        });

        if (teamCredential) {
            return serializeCredential(teamCredential, team);
        }
    }

    if (userId) {
        const userCredential = await findActiveCredential({
            provider,
            scopeType: 'user',
            scopeId: userId
        });

        if (userCredential) {
            return serializeCredential(userCredential, team);
        }
    }

    const globalCredential = await findActiveCredential({
        provider,
        scopeType: 'global'
    });

    return globalCredential ? serializeCredential(globalCredential, team) : null;
}

export async function recordProviderUsageLog(payload = {}) {
    try {
        const db = getDb();
        await db.query(`
            INSERT INTO provider_usage_logs (
                id,
                task_id,
                user_id,
                team_id,
                credential_id,
                provider,
                upstream_model,
                provider_task_id,
                request_id,
                status,
                error_type,
                error_message,
                image_count,
                duration_ms,
                provider_cost,
                currency,
                raw_usage
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
            crypto.randomUUID(),
            payload.taskId || null,
            payload.userId || null,
            payload.teamId || null,
            payload.credentialId || null,
            payload.provider,
            payload.upstreamModel || null,
            payload.providerTaskId || null,
            payload.requestId || null,
            payload.status || 'unknown',
            payload.errorType || null,
            payload.errorMessage || null,
            Number.isFinite(Number(payload.imageCount)) ? Number(payload.imageCount) : null,
            Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null,
            Number.isFinite(Number(payload.providerCost)) ? Number(payload.providerCost) : null,
            payload.currency || 'USD',
            payload.rawUsage || null
        ]);
    } catch (error) {
        console.warn('[ProviderUsage] Failed to record provider usage log:', {
            taskId: payload.taskId,
            provider: payload.provider,
            credentialId: payload.credentialId,
            error: error?.message || error
        });
    }
}
