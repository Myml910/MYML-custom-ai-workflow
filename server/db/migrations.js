export function runMigrations(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'designer'
                CHECK (role IN ('admin', 'designer', 'viewer', 'user')),
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disabled')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `);

    const usersTable = db.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'users'
    `).get();

    if (usersTable?.sql && !usersTable.sql.includes("'user'")) {
        db.exec(`
            PRAGMA foreign_keys = OFF;

            CREATE TABLE users_next (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'designer'
                    CHECK (role IN ('admin', 'designer', 'viewer', 'user')),
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disabled')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO users_next (id, username, password_hash, role, status, created_at, updated_at)
            SELECT id, username, password_hash, role, status, created_at, updated_at
            FROM users;

            DROP TABLE users;
            ALTER TABLE users_next RENAME TO users;

            PRAGMA foreign_keys = ON;

            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        `);
    }
}
