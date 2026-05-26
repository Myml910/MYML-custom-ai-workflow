import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getAvailableImageModels } from '../services/ai/modelRegistry.js';
import { getAgentChatStartupSummary } from '../agent/config/chatConfig.js';
import { getImagePromptReverseStartupSummary } from '../agent/imagePromptReverse.js';

export function safeValue(value, fallback = 'unknown') {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
}

export function normalizeDatabaseLabel(label) {
    const text = String(label || '').toLowerCase();
    if (text.includes('postgres')) return 'postgres';
    if (text.includes('sqlite')) return 'sqlite';
    return 'unknown';
}

export function readGitCommit() {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: process.cwd(),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim() || 'unknown';
    } catch {
        return 'unknown';
    }
}

export function readImageModelSummary() {
    try {
        const models = getAvailableImageModels();
        return {
            count: models.length,
            ids: models.map(model => model.id)
        };
    } catch (error) {
        console.warn('[Startup Summary] Failed to read image model registry:', error?.message || error);
        return {
            count: 'unknown',
            ids: []
        };
    }
}

export function getStartupEntry() {
    if (process.env.MYML_DOTENV_BOOTSTRAPPED === 'true') return 'bootstrap';
    return 'direct';
}

export async function checkLibraryDirStatus(libraryDir) {
    const targetDir = safeValue(libraryDir, '');
    const result = {
        exists: false,
        writable: false,
        error: null
    };

    if (!targetDir) {
        result.error = 'LIBRARY_DIR is not configured';
        return result;
    }

    try {
        await fs.promises.mkdir(targetDir, { recursive: true });
        result.exists = true;
    } catch (error) {
        result.error = `Failed to create LIBRARY_DIR: ${error?.message || error}`;
        return result;
    }

    const probePath = path.join(targetDir, `.myml-write-check-${process.pid}-${Date.now()}`);
    try {
        await fs.promises.writeFile(probePath, 'ok');
        await fs.promises.unlink(probePath).catch(() => {});
        result.writable = true;
    } catch (error) {
        result.error = `LIBRARY_DIR is not writable: ${error?.message || error}`;
    }

    return result;
}

export function logStartupSummary(options = {}) {
    return (async () => {
        const imageModels = readImageModelSummary();
        const agentChat = getAgentChatStartupSummary(process.env);
        const imagePromptReverse = getImagePromptReverseStartupSummary(process.env);
        const libraryDir = safeValue(options.libraryDir || process.env.LIBRARY_DIR);
        const libraryStatus = await checkLibraryDirStatus(libraryDir);
        const summary = {
            cwd: process.cwd(),
            nodeEnv: safeValue(process.env.NODE_ENV),
            host: safeValue(options.host || process.env.HOST),
            port: safeValue(options.port || process.env.PORT),
            libraryDir,
            libraryExists: libraryStatus.exists,
            libraryWritable: libraryStatus.writable,
            database: normalizeDatabaseLabel(options.dbLabel),
            taskWorkerEnabled: safeValue(process.env.TASK_WORKER_ENABLED, 'false'),
            enableAtlasProvider: safeValue(process.env.ENABLE_ATLAS_PROVIDER, 'false'),
            enableAtlasNanoBanana2: safeValue(process.env.ENABLE_ATLAS_NANO_BANANA_2, 'false'),
            requireTeamProviderCredentials: safeValue(process.env.REQUIRE_TEAM_PROVIDER_CREDENTIALS, 'false'),
            imageModelCount: imageModels.count,
            imageModelIds: imageModels.ids,
            agentChatProvider: agentChat.agentChatProvider,
            agentChatModel: agentChat.agentChatModel,
            agentChatBaseUrl: agentChat.agentChatBaseUrl,
            agentChatConfigured: agentChat.agentChatConfigured,
            imagePromptReverseProvider: imagePromptReverse.imagePromptReverseProvider,
            imagePromptReverseModel: imagePromptReverse.imagePromptReverseModel,
            imagePromptReverseConfigured: imagePromptReverse.imagePromptReverseConfigured,
            imagePromptReverseTimeoutMs: imagePromptReverse.imagePromptReverseTimeoutMs,
            imagePromptReverseMaxTokens: imagePromptReverse.imagePromptReverseMaxTokens,
            imagePromptReverseFallbackModels: imagePromptReverse.imagePromptReverseFallbackModels,
            gitCommit: readGitCommit(),
            entrypoint: getStartupEntry()
        };

        console.log('[Startup Summary]', summary);
        if (!libraryStatus.writable) {
            console.warn('[Startup Summary] LIBRARY_DIR is not writable', {
                libraryDir,
                error: libraryStatus.error
            });
        }
    })().catch(error => {
        console.warn('[Startup Summary] Failed to print startup summary:', error?.message || error);
    });
}
