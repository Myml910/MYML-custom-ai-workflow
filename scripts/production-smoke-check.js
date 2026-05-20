import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const [
    startupSummary,
    paths,
    dbModule
] = await Promise.all([
    import('../server/utils/startupSummary.js'),
    import('../server/config/paths.js'),
    import('../server/db/index.js')
]);

const {
    checkLibraryDirStatus,
    normalizeDatabaseLabel,
    readGitCommit,
    readImageModelSummary,
    safeValue
} = startupSummary;

const { LIBRARY_DIR, PROJECT_ROOT } = paths;
const { getDatabaseLabel } = dbModule;

function readEnv(name, fallback = 'unset') {
    return safeValue(process.env[name], fallback);
}

async function main() {
    const failures = [];
    const warnings = [];

    const nodeEnv = readEnv('NODE_ENV', 'development');
    if (nodeEnv !== 'production') {
        warnings.push('NODE_ENV is not production; this is allowed for local checks but should be production for deployment.');
    }

    const distIndexPath = path.join(PROJECT_ROOT, 'dist', 'index.html');
    const distIndexExists = fs.existsSync(distIndexPath);
    if (!distIndexExists) {
        failures.push('dist/index.html is missing. Run npm run build before production startup.');
    }

    const libraryStatus = await checkLibraryDirStatus(LIBRARY_DIR);
    if (!libraryStatus.writable) {
        failures.push(`LIBRARY_DIR is not writable: ${libraryStatus.error || 'unknown error'}`);
    }

    const imageModels = readImageModelSummary();
    if (typeof imageModels.count !== 'number' || imageModels.count <= 0) {
        failures.push('No available image models were found.');
    }

    const summary = {
        cwd: process.cwd(),
        nodeEnv,
        host: readEnv('HOST', '0.0.0.0'),
        port: readEnv('PORT', '3001'),
        gitCommit: readGitCommit(),
        database: normalizeDatabaseLabel(getDatabaseLabel()),
        taskWorkerEnabled: readEnv('TASK_WORKER_ENABLED', 'false'),
        taskWorkerConcurrency: readEnv('TASK_WORKER_CONCURRENCY', 'unset'),
        systemMaxRunningImageTasks: readEnv('SYSTEM_MAX_RUNNING_IMAGE_TASKS', 'unset'),
        userMaxRunningImageTasks: readEnv('USER_MAX_RUNNING_IMAGE_TASKS', 'unset'),
        providerMaxRunningAtlas: readEnv('PROVIDER_MAX_RUNNING_ATLAS', 'unset'),
        enableAtlasProvider: readEnv('ENABLE_ATLAS_PROVIDER', 'false'),
        enableAtlasNanoBanana2: readEnv('ENABLE_ATLAS_NANO_BANANA_2', 'false'),
        requireTeamProviderCredentials: readEnv('REQUIRE_TEAM_PROVIDER_CREDENTIALS', 'false'),
        imageModelCount: imageModels.count,
        imageModelIds: imageModels.ids,
        libraryDir: LIBRARY_DIR,
        libraryExists: libraryStatus.exists,
        libraryWritable: libraryStatus.writable,
        distIndexExists
    };

    console.log('[Production Smoke] Summary:', summary);

    for (const warning of warnings) {
        console.warn('[Production Smoke] Warning:', warning);
    }

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error('[Production Smoke] Failed:', failure);
        }
        process.exitCode = 1;
        return;
    }

    console.log('[Production Smoke] OK');
}

main().catch(error => {
    console.error('[Production Smoke] Unexpected failure:', error?.message || error);
    process.exitCode = 1;
});
