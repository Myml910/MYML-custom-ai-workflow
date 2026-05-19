import express from 'express';
import { getDatabaseLabel } from '../db/index.js';
import { LIBRARY_DIR } from '../config/paths.js';
import {
    checkLibraryDirStatus,
    getStartupEntry,
    normalizeDatabaseLabel,
    readGitCommit,
    readImageModelSummary,
    safeValue
} from '../utils/startupSummary.js';

const router = express.Router();

router.get('/', async (_req, res) => {
    const response = {
        ok: true,
        cwd: process.cwd(),
        nodeEnv: safeValue(process.env.NODE_ENV),
        gitCommit: 'unknown',
        entrypoint: 'unknown',
        workerEnabled: process.env.TASK_WORKER_ENABLED === 'true',
        libraryDir: LIBRARY_DIR,
        libraryWritable: false,
        providerGates: {
            atlas: process.env.ENABLE_ATLAS_PROVIDER === 'true',
            atlasNanoBanana2: process.env.ENABLE_ATLAS_NANO_BANANA_2 === 'true',
            requireTeamProviderCredentials: process.env.REQUIRE_TEAM_PROVIDER_CREDENTIALS === 'true'
        },
        imageModelCount: 'unknown',
        imageModelIds: [],
        database: 'unknown'
    };

    try {
        response.gitCommit = readGitCommit();
    } catch {
        response.gitCommit = 'unknown';
    }

    try {
        response.entrypoint = getStartupEntry();
    } catch {
        response.entrypoint = 'unknown';
    }

    try {
        response.database = normalizeDatabaseLabel(getDatabaseLabel());
    } catch {
        response.database = 'unknown';
    }

    try {
        const libraryStatus = await checkLibraryDirStatus(LIBRARY_DIR);
        response.libraryExists = libraryStatus.exists;
        response.libraryWritable = libraryStatus.writable;
    } catch {
        response.libraryExists = false;
        response.libraryWritable = false;
    }

    try {
        const imageModels = readImageModelSummary();
        response.imageModelCount = imageModels.count;
        response.imageModelIds = imageModels.ids;
    } catch {
        response.imageModelCount = 'unknown';
        response.imageModelIds = [];
    }

    res.json(response);
});

export default router;
