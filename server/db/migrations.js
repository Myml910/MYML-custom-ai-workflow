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

    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS locked_by TEXT;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 2;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS last_error TEXT;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS team_id TEXT;');
    await db.query('ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS credential_id TEXT;');

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

    await db.query(`
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS user_team_memberships (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(user_id, team_id)
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS provider_credentials (
            id TEXT PRIMARY KEY,
            scope_type TEXT NOT NULL CHECK (scope_type IN ('team', 'user', 'global')),
            scope_id TEXT,
            provider TEXT NOT NULL,
            label TEXT,
            base_url TEXT,
            api_key_encrypted TEXT NOT NULL,
            api_key_last4 TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            priority INTEGER NOT NULL DEFAULT 1,
            created_by TEXT REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(scope_type, scope_id, provider, label)
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS provider_usage_logs (
            id TEXT PRIMARY KEY,
            task_id TEXT REFERENCES generation_tasks(id),
            user_id TEXT REFERENCES users(id),
            team_id TEXT REFERENCES teams(id),
            credential_id TEXT REFERENCES provider_credentials(id),
            provider TEXT NOT NULL,
            upstream_model TEXT,
            provider_task_id TEXT,
            request_id TEXT,
            status TEXT NOT NULL,
            error_type TEXT,
            error_message TEXT,
            image_count INTEGER,
            duration_ms INTEGER,
            provider_cost NUMERIC(12, 6),
            currency TEXT DEFAULT 'USD',
            raw_usage JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id ON generation_tasks(user_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_node_id ON generation_tasks(node_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_workflow_id ON generation_tasks(workflow_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_provider_task_id ON generation_tasks(provider_task_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at ON generation_tasks(created_at);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_lease_expires_at ON generation_tasks(lease_expires_at);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_locked_by ON generation_tasks(locked_by);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_status_lease ON generation_tasks(status, lease_expires_at);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_team_id ON generation_tasks(team_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_generation_tasks_credential_id ON generation_tasks(credential_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events(created_at);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_team_memberships_user_id ON user_team_memberships(user_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_user_team_memberships_team_id ON user_team_memberships(team_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_provider_credentials_scope_provider ON provider_credentials(scope_type, scope_id, provider, status, priority);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_provider_usage_logs_task ON provider_usage_logs(task_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_provider_usage_logs_user_id ON provider_usage_logs(user_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_provider_usage_logs_team_id ON provider_usage_logs(team_id);');
}
