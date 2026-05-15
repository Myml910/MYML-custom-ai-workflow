import dotenv from 'dotenv';
dotenv.config();

import { getDatabaseLabel, getDb, closeDb } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { findUserByUsername, seedInternalTestUsers } from './db/users.js';
import { ensureUserLibraryDirs } from './utils/userLibrary.js';

try {
    const db = getDb();
    await runMigrations(db);

    const results = await seedInternalTestUsers();
    for (const result of results) {
        ensureUserLibraryDirs(result.user);
        const action = result.created ? 'created' : 'exists';
        console.log(`[Auth] ${action}: ${result.user.username} (${result.user.role}, ${result.user.status})`);
    }

    const mymlUser = await findUserByUsername('myml');
    if (mymlUser) {
        ensureUserLibraryDirs(mymlUser);
    }

    console.log(`[DB] Seed complete: ${getDatabaseLabel()}`);
} catch (error) {
    console.error('[Auth] Failed to seed internal users:', error);
    process.exitCode = 1;
} finally {
    await closeDb();
}
