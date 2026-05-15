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

const USER_SELECT = `
    SELECT id, username, password_hash, role, status, created_at, updated_at
    FROM users
`;

export async function countUsers() {
    const db = getDb();
    const result = await db.query('SELECT COUNT(*)::int AS count FROM users');
    return result.rows[0]?.count || 0;
}

export async function findUserById(id) {
    const db = getDb();
    const result = await db.query(`
        ${USER_SELECT}
        WHERE id = $1
        LIMIT 1
    `, [id]);

    return result.rows[0] || null;
}

export async function findUserByUsername(username) {
    const db = getDb();
    const result = await db.query(`
        ${USER_SELECT}
        WHERE username = $1
        LIMIT 1
    `, [username]);

    return result.rows[0] || null;
}

export async function createUser({ username, password, role = 'designer', status = 'active' }) {
    const db = getDb();
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    const result = await db.query(`
        INSERT INTO users (id, username, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, password_hash, role, status, created_at, updated_at
    `, [id, username, passwordHash, role, status]);

    return toPublicUser(result.rows[0]);
}

export async function createUserIfMissing({ username, password, role = 'designer', status = 'active' }) {
    const existing = await findUserByUsername(username);
    if (existing) {
        return { created: false, user: toPublicUser(existing) };
    }

    try {
        const user = await createUser({ username, password, role, status });
        return { created: true, user };
    } catch (error) {
        if (error?.code === '23505') {
            const user = await findUserByUsername(username);
            return { created: false, user: toPublicUser(user) };
        }
        throw error;
    }
}

export async function getPublicUserById(id) {
    return toPublicUser(await findUserById(id));
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

    if (await countUsers() > 0) {
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

export async function seedInternalTestUsers(options = {}) {
    const shouldSeed = options.force === true || process.env.MYML_SEED_INTERNAL_USERS === 'true';
    if (!shouldSeed) {
        console.log('[Auth] Skipped internal group user seeding. Set MYML_SEED_INTERNAL_USERS=true to enable it during server startup.');
        return [];
    }

    const users = [
        {
            label: 'group1',
            username: process.env.MYML_GROUP1_USERNAME,
            password: process.env.MYML_GROUP1_PASSWORD,
            role: 'user',
            status: 'active'
        },
        {
            label: 'group2',
            username: process.env.MYML_GROUP2_USERNAME,
            password: process.env.MYML_GROUP2_PASSWORD,
            role: 'user',
            status: 'active'
        }
    ];

    const results = [];
    for (const user of users) {
        if (!user.username || !user.password) {
            throw new Error(`Internal group user seeding requested but ${user.label} username/password is not fully configured.`);
        }

        results.push(await createUserIfMissing(user));
    }

    return results;
}
