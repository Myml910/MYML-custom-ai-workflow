import { execFileSync } from 'child_process';
import { getAvailableImageModels } from '../services/ai/modelRegistry.js';

function safeValue(value, fallback = 'unknown') {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
}

function normalizeDatabaseLabel(label) {
    const text = String(label || '').toLowerCase();
    if (text.includes('postgres')) return 'postgres';
    if (text.includes('sqlite')) return 'sqlite';
    return 'unknown';
}

function readGitCommit() {
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

function readImageModelSummary() {
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

function getStartupEntry() {
    if (process.env.MYML_DOTENV_BOOTSTRAPPED === 'true') return 'bootstrap';
    return 'direct';
}

export function logStartupSummary(options = {}) {
    try {
        const imageModels = readImageModelSummary();
        const summary = {
            cwd: process.cwd(),
            nodeEnv: safeValue(process.env.NODE_ENV),
            host: safeValue(options.host || process.env.HOST),
            port: safeValue(options.port || process.env.PORT),
            libraryDir: safeValue(options.libraryDir || process.env.LIBRARY_DIR),
            database: normalizeDatabaseLabel(options.dbLabel),
            taskWorkerEnabled: safeValue(process.env.TASK_WORKER_ENABLED, 'false'),
            enableAtlasProvider: safeValue(process.env.ENABLE_ATLAS_PROVIDER, 'false'),
            enableAtlasNanoBanana2: safeValue(process.env.ENABLE_ATLAS_NANO_BANANA_2, 'false'),
            requireTeamProviderCredentials: safeValue(process.env.REQUIRE_TEAM_PROVIDER_CREDENTIALS, 'false'),
            imageModelCount: imageModels.count,
            imageModelIds: imageModels.ids,
            gitCommit: readGitCommit(),
            entrypoint: getStartupEntry()
        };

        console.log('[Startup Summary]', summary);
    } catch (error) {
        console.warn('[Startup Summary] Failed to print startup summary:', error?.message || error);
    }
}
