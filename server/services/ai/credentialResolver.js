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

export async function resolveProviderRuntimeConfig({ userId, provider, baseConfig, credentialId }) {
    const cleanBaseConfig = sanitizeBaseConfig(baseConfig);
    const primaryTeam = await getUserPrimaryTeam(userId);

    if (credentialId) {
        const lockedCredential = await getProviderCredentialById(credentialId, { includeInactive: true });

        if (!lockedCredential) {
            console.warn('[CredentialResolver] Task credential was not found; falling back to user/provider resolution.', {
                credentialId,
                provider
            });
        } else if (lockedCredential.provider !== provider) {
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
