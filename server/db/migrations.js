export async function runMigrations(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'designer'
                CHECK (role IN ('admin', 'designer', 'viewer', 'user')),
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'disabled')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);');
}
