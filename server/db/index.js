import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../config/paths.js';

let db = null;

export function getDatabasePath() {
    const configuredPath = process.env.MYML_DB_PATH || 'library/database/myml.db';
    return path.isAbsolute(configuredPath)
        ? configuredPath
        : path.join(PROJECT_ROOT, configuredPath);
}

export function getDb() {
    if (db) return db;

    const dbPath = getDatabasePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    return db;
}

export function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
