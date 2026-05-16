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

    await db.query(`
        CREATE TABLE IF NOT EXISTS generation_tasks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT,
            workflow_id TEXT,
            node_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            status TEXT NOT NULL,
            prompt TEXT,
            input JSONB,
            output JSONB,
            result_url TEXT,
            provider_task_id TEXT,
            progress INTEGER DEFAULT 0,
            error_type TEXT,
            error_message TEXT,
            submitted_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            failed_at TIMESTAMPTZ,
            duration_ms INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS task_events (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            message TEXT,
            payload JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id ON generation_tasks(user_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_node_id ON generation_tasks(node_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_workflow_id ON generation_tasks(workflow_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_provider_task_id ON generation_tasks(provider_task_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at ON generation_tasks(created_at);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events(created_at);');
}
