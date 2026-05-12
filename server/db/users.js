import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb } from './index.js';

const PASSWORD_HASH_ROUNDS = 12;

function toPublicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function countUsers() {
    const db = getDb();
    return db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

export function findUserById(id) {
    const db = getDb();
    const row = db.prepare(`
        SELECT id, username, password_hash, role, status, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    `).get(id);

    return row || null;
}

export function findUserByUsername(username) {
    const db = getDb();
    const row = db.prepare(`
        SELECT id, username, password_hash, role, status, created_at, updated_at
        FROM users
        WHERE username = ?
        LIMIT 1
    `).get(username);

    return row || null;
}

export async function createUser({ username, password, role = 'designer', status = 'active' }) {
    const db = getDb();
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    db.prepare(`
        INSERT INTO users (id, username, password_hash, role, status)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, username, passwordHash, role, status);

    return getPublicUserById(id);
}

export async function createUserIfMissing({ username, password, role = 'designer', status = 'active' }) {
    const existing = findUserByUsername(username);
    if (existing) {
        return { created: false, user: toPublicUser(existing) };
    }

    const user = await createUser({ username, password, role, status });
    return { created: true, user };
}

export function getPublicUserById(id) {
    return toPublicUser(findUserById(id));
}

export function getPublicUserFromRow(row) {
    return toPublicUser(row);
}

export async function verifyUserPassword(user, password) {
    if (!user?.password_hash || !password) {
        return false;
    }

    return bcrypt.compare(password, user.password_hash);
}

export async function seedInitialAdmin() {
    if (process.env.MYML_ADMIN_USERNAME || process.env.MYML_ADMIN_PASSWORD) {
        console.warn('[Auth] MYML_ADMIN_USERNAME/MYML_ADMIN_PASSWORD are deprecated. Use MYML_SEED_ADMIN_USERNAME/MYML_SEED_ADMIN_PASSWORD for initial user seeding.');
    }

    if (countUsers() > 0) {
        return { seeded: false, reason: 'users_exist' };
    }

    const username = process.env.MYML_SEED_ADMIN_USERNAME;
    const password = process.env.MYML_SEED_ADMIN_PASSWORD;

    if (!username || !password) {
        throw new Error('Users table is empty. Set MYML_SEED_ADMIN_USERNAME and MYML_SEED_ADMIN_PASSWORD to seed the first admin user.');
    }

    const user = await createUser({
        username,
        password,
        role: 'admin',
        status: 'active'
    });

    console.log(`[Auth] Seeded initial admin user: ${user.username}`);
    return { seeded: true, user };
}

export async function seedInternalTestUsers() {
    const users = [
        {
            username: process.env.MYML_GROUP1_USERNAME || 'group1.design@yxfa.cn',
            password: process.env.MYML_GROUP1_PASSWORD || 'MymlGroup1@2026',
            role: 'user',
            status: 'active'
        },
        {
            username: process.env.MYML_GROUP2_USERNAME || 'group2.design@yxfa.cn',
            password: process.env.MYML_GROUP2_PASSWORD || 'MymlGroup2@2026',
            role: 'user',
            status: 'active'
        }
    ];

    const results = [];
    for (const user of users) {
        results.push(await createUserIfMissing(user));
    }

    return results;
}
