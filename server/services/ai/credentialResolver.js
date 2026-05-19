import {
    decryptProviderApiKey,
    getProviderCredentialById,
    getProviderCredentialForUser,
    getUserPrimaryTeam
} from '../../db/providerCredentials.js';

function last4(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length >= 4 ? text.slice(-4) : '';
}

function sanitizeBaseConfig(baseConfig = {}) {
    return baseConfig && typeof baseConfig === 'object' ? baseConfig : {};
}

export const PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE = 'CREDENTIAL_REQUIRED';

export function isTeamProviderCredentialRequired() {
    return process.env.REQUIRE_TEAM_PROVIDER_CREDENTIALS === 'true';
}

export class ProviderCredentialRequiredError extends Error {
    constructor({ provider, userId, username, teamId, credentialId, reason, message } = {}) {
        super(message || `Provider credential is required for provider ${provider || 'unknown'}.`);
        this.name = 'ProviderCredentialRequiredError';
        this.type = PROVIDER_CREDENTIAL_REQUIRED_ERROR_TYPE;
        this.provider = provider || null;
        this.userId = userId || null;
        this.username = username || null;
        this.teamId = teamId || null;
        this.credentialId = credentialId || null;
        this.reason = reason || 'required_missing';
        this.credentialContext = {
            source: 'required_missing',
            credentialId: null,
            teamId: teamId || null,
            provider: provider || null,
            label: null,
            apiKeyLast4: null
        };
    }
}

function createEnvCredentialContext({ primaryTeam, provider, baseConfig }) {
    return {
        source: 'env',
        credentialId: null,
        teamId: primaryTeam?.id || null,
        provider,
        label: null,
        apiKeyLast4: last4(baseConfig.apiKey)
    };
}

function createCredentialContext({ credential, primaryTeam, provider, apiKey }) {
    return {
        source: credential.scopeType,
        credentialId: credential.id,
        teamId: credential.team?.id || primaryTeam?.id || null,
        provider,
        label: credential.label || null,
        apiKeyLast4: credential.apiKeyLast4 || last4(apiKey)
    };
}

function createResolvedConfig({ baseConfig, credential, apiKey }) {
    return {
        ...baseConfig,
        apiKey,
        baseUrl: credential.baseUrl || baseConfig.baseUrl
    };
}

function buildRequiredCredentialMessage({ provider, username, teamId, reason }) {
    const userText = username ? ` and user ${username}` : '';
    const teamText = teamId ? ` in team ${teamId}` : '';
    const reasonText = reason ? ` (${reason})` : '';
    return `No active provider credential found for provider ${provider}${userText}${teamText}${reasonText}.`;
}

function throwRequiredCredential({ provider, userId, username, teamId, credentialId, reason }) {
    throw new ProviderCredentialRequiredError({
        provider,
        userId,
        username,
        teamId,
        credentialId,
        reason,
        message: buildRequiredCredentialMessage({ provider, username, teamId, reason })
    });
}

export async function resolveProviderRuntimeConfig({ userId, username, provider, baseConfig, credentialId }) {
    const cleanBaseConfig = sanitizeBaseConfig(baseConfig);
    const primaryTeam = await getUserPrimaryTeam(userId);
    const requireDbCredential = isTeamProviderCredentialRequired();

    if (credentialId) {
        const lockedCredential = await getProviderCredentialById(credentialId, { includeInactive: true });

        if (!lockedCredential) {
            if (requireDbCredential) {
                throwRequiredCredential({
                    provider,
                    userId,
                    username,
                    teamId: primaryTeam?.id || null,
                    credentialId,
                    reason: 'task_credential_not_found'
                });
            }

            console.warn('[CredentialResolver] Task credential was not found; falling back to user/provider resolution.', {
                credentialId,
                provider
            });
        } else if (lockedCredential.provider !== provider) {
            if (requireDbCredential) {
                throwRequiredCredential({
                    provider,
                    userId,
                    username,
                    teamId: lockedCredential.team?.id || primaryTeam?.id || null,
                    credentialId,
                    reason: 'task_credential_provider_mismatch'
                });
            }

            console.warn('[CredentialResolver] Task credential provider mismatch; falling back to user/provider resolution.', {
                credentialId,
                credentialProvider: lockedCredential.provider,
                provider
            });
        } else {
            const apiKey = decryptProviderApiKey(lockedCredential.apiKeyEncrypted);
            if (apiKey) {
                return {
                    config: createResolvedConfig({
                        baseConfig: cleanBaseConfig,
                        credential: lockedCredential,
                        apiKey
                    }),
                    credentialContext: createCredentialContext({
                        credential: lockedCredential,
                        primaryTeam,
                        provider,
                        apiKey
                    })
                };
            }

            if (requireDbCredential) {
                throwRequiredCredential({
                    provider,
                    userId,
                    username,
                    teamId: lockedCredential.team?.id || primaryTeam?.id || null,
                    credentialId,
                    reason: 'task_credential_missing_api_key'
                });
            }

            console.warn('[CredentialResolver] Task credential has no usable API key; falling back to user/provider resolution.', {
                credentialId,
                provider,
                scopeType: lockedCredential.scopeType,
                scopeId: lockedCredential.scopeId
            });
        }
    }

    const credential = await getProviderCredentialForUser({ userId, provider });
    const effectiveTeam = credential?.team || primaryTeam;

    if (!credential) {
        if (requireDbCredential) {
            throwRequiredCredential({
                provider,
                userId,
                username,
                teamId: effectiveTeam?.id || null,
                reason: 'no_active_provider_credential'
            });
        }

        return {
            config: cleanBaseConfig,
            credentialContext: createEnvCredentialContext({
                primaryTeam: effectiveTeam,
                provider,
                baseConfig: cleanBaseConfig
            })
        };
    }

    const apiKey = decryptProviderApiKey(credential.apiKeyEncrypted);
    if (!apiKey) {
        if (requireDbCredential) {
            throwRequiredCredential({
                provider,
                userId,
                username,
                teamId: effectiveTeam?.id || null,
                credentialId: credential.id,
                reason: 'provider_credential_missing_api_key'
            });
        }

        console.warn('[CredentialResolver] Provider credential has no usable API key; falling back to env config.', {
            credentialId: credential.id,
            provider,
            scopeType: credential.scopeType,
            scopeId: credential.scopeId
        });

        return {
            config: cleanBaseConfig,
            credentialContext: createEnvCredentialContext({
                primaryTeam: effectiveTeam,
                provider,
                baseConfig: cleanBaseConfig
            })
        };
    }

    return {
        config: createResolvedConfig({
            baseConfig: cleanBaseConfig,
            credential,
            apiKey
        }),
        credentialContext: createCredentialContext({
            credential,
            primaryTeam: effectiveTeam,
            provider,
            apiKey
        })
    };
}
