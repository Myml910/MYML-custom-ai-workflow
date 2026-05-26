# MYML Canvas Deployment Guide

This guide covers the current deployment baseline for MYML Canvas: PostgreSQL for users/auth/tasks, local filesystem library storage, and an optional background image task worker.

## 1. Required Services

- Node.js 20 or newer
- PostgreSQL 14 or newer
- A persistent library directory for generated images, videos, workflows, assets, chats, and temp files
- Optional: MYML Matting Engine on a separate local service

## 2. Minimal Local Startup

Install dependencies:

```bash
npm install
```

Start the backend:

```bash
npm run server
```

Start the Vite frontend in a second terminal:

```bash
npx vite --host 0.0.0.0 --port 4246 --strictPort
```

`npm run dev` still starts backend and frontend together. Use it for simple UI development only. It now runs Vite with `--strictPort`, so startup fails if `4246` is already occupied instead of silently switching to `4247`. If you enable the background worker, prefer separate terminals so it is clear which process can submit paid provider tasks.

For production Node mode:

```bash
npm run build
NODE_ENV=production npm run check:production
NODE_ENV=production npm start
```

In production Node mode, the Node process on `PORT` (default `3001`) serves the built `dist`, `/api`, and `/library`. Production Node mode does not use the Vite `4246` port.

## 3. Worker-Enabled Development

When `TASK_WORKER_ENABLED=false`, image tasks are created and remain `queued`; no background provider calls are made.

Linux/macOS:

```bash
TASK_WORKER_ENABLED=true TASK_WORKER_CONCURRENCY=1 npm run server
npx vite --host 0.0.0.0 --port 4246 --strictPort
```

Windows cmd:

```bat
set TASK_WORKER_ENABLED=true
set TASK_WORKER_CONCURRENCY=1
npm run server
```

Then start Vite in another terminal:

```bat
npx vite --host 0.0.0.0 --port 4246 --strictPort
```

Recommended defaults:

- Development: `TASK_WORKER_ENABLED=false`, or `true` with `TASK_WORKER_CONCURRENCY=1` for controlled testing
- Staging: `TASK_WORKER_ENABLED=true`, low provider limits
- Production: `TASK_WORKER_ENABLED=true`, provider limits set to purchased quota

## 3.0 Local Environment Isolation

Do not debug Atlas or Nano Banana 2 from a local frontend/backend while pointing `DATABASE_URL` at the shared server database. That creates a split-brain setup:

```text
localhost:4246 frontend
localhost:3001 backend
local library directory
shared PostgreSQL task rows
server worker and server library directory
```

In that setup, a task can be marked `completed` in the shared database while the result file exists only on the server filesystem. The local browser then requests `localhost/library/...` and receives `404` even though the shared database row looks successful.

For local provider debugging, use an isolated local database, local worker, local library, and a local provider key:

```env
DATABASE_URL=postgres://postgres:<LOCAL_POSTGRES_PASSWORD>@127.0.0.1:5432/myml_canvas_local
REQUIRE_TEAM_PROVIDER_CREDENTIALS=false
ATLAS_API_KEY=<YOUR_MYML_LOCAL_DEV_ATLAS_KEY>
ENABLE_ATLAS_PROVIDER=true
ENABLE_ATLAS_NANO_BANANA_2=true
TASK_WORKER_ENABLED=true
```

Copy `.env.local.example` to `.env` for this mode, then adjust local secrets. Keep the shared test server running on its own `.env` and its own `library`.

Local PostgreSQL bootstrap example:

```bash
createdb myml_canvas_local
npm install
npm run check:env:safety
npm run server
```

Windows `psql` example:

```bat
createdb -h 127.0.0.1 -U postgres myml_canvas_local
npm run check:env:safety
npm run server
```

The first local server start runs migrations and seeds the admin user from:

```env
MYML_SEED_ADMIN_USERNAME=myml
MYML_SEED_ADMIN_PASSWORD=<LOCAL_DEV_ADMIN_PASSWORD>
```

The seed password is only guaranteed for first creation on an empty local database. If the `myml` user already exists, reset it intentionally in that local database before testing.

Use:

```bash
npm run check:env:safety
node scripts/check-env-safety.js --strict
```

`--strict` blocks known unsafe local-development combinations, such as using the shared `10.0.0.30/design_system_db`.

## 3.1 Migration / Prelaunch Instance Checks

Before switching traffic, verify that the browser is talking to the intended directory, process, and ports. This is especially important when an older checkout is still running.

```bash
ss -lntp | grep -E '3001|4246|4247'
ps aux | grep -E "node|vite|npm|concurrently" | grep -v grep
pwdx <PID>
readlink -f /proc/<PID>/cwd
tr '\0' '\n' < /proc/<PID>/environ | grep -E 'NODE_ENV|PORT|TASK_WORKER|ENABLE_ATLAS|LIBRARY_DIR|DATABASE_URL'
```

Deployment modes:

- Dev mode: Vite runs on `4246`, backend runs on `3001`.
- Production Node mode: Node on `3001` serves `dist`, `/api`, and `/library`.
- Nginx dist mode: Nginx serves `dist` and must reverse proxy both `/api` and `/library` to the backend.

Operational notes:

- `/api/models/image` requires the login cookie; a bare `curl` returning `401` is expected.
- If the model dropdown shows the old fallback list, inspect the browser Network request for `/api/models/image` before judging the UI.
- Vite is configured with `--strictPort`; if `4246` is occupied, fix the old process instead of allowing Vite to switch to `4247`.
- Prefer separate backend and Vite terminals for worker tests; avoid multiple old `npm run dev` processes.

## 3.2 Production Node and systemd

For a production-style Node deployment, build the frontend first, run the non-sensitive checks, then start the bootstrap entrypoint:

```bash
git pull origin test
npm install
npm run build
npm run check:provider-credentials
NODE_ENV=production npm run check:production
NODE_ENV=production npm start
```

The production smoke check verifies `dist/index.html`, `LIBRARY_DIR` writability, image model visibility, provider gates, worker environment, git commit, and a safe database label. It never prints API keys, cookies, passwords, the full `DATABASE_URL`, provider credentials, or `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`.

Short-term test environments may use:

```bash
nohup npm run dev > app.log 2>&1 &
```

This is convenient for internal testing, but it runs Vite plus the backend and is not the preferred long-running production mode. In dev mode the browser uses `4246`; in production Node mode the browser uses `PORT` (default `3001`).

If `MYML_COOKIE_SECURE=true`, the browser must reach the app over HTTPS. For plain HTTP internal tests, keep `MYML_COOKIE_SECURE=false`.

A systemd example is provided at:

```text
deploy/systemd/myml-canvas.service.example
```

Install it manually only after reviewing paths, the Linux user, and the npm executable:

```bash
sudo cp deploy/systemd/myml-canvas.service.example /etc/systemd/system/myml-canvas.service
sudo systemctl daemon-reload
sudo systemctl enable myml-canvas
sudo systemctl start myml-canvas
sudo systemctl status myml-canvas
sudo journalctl -u myml-canvas -f
```

The example uses `ExecStart=/usr/bin/env npm start` for portability. On a real server, run `which npm` and replace it with the absolute path if systemd cannot find npm. Do not put provider API keys, database passwords, or encryption keys in the unit file; keep them in the project `.env` or a protected `EnvironmentFile`.

If you serve `dist` through Nginx instead of Node, Nginx must reverse proxy both `/api` and `/library` to the Node backend. Serving `dist` alone is not enough.

## 4. Core Environment

Use `.env.example` as the template. At minimum configure:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
LIBRARY_DIR=/data/myml/library

MYML_AUTH_SECRET=change_this_to_a_long_random_value
MYML_COOKIE_SECURE=true

DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
# Or PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE

MYML_SEED_ADMIN_USERNAME=admin@example.com
MYML_SEED_ADMIN_PASSWORD=change_this_before_first_start

T8_BASE_URL=https://ai.t8star.org/v1
T8_API_KEY=your_t8_key
T8_REQUEST_TIMEOUT_MS=300000
T8_GPT_IMAGE_MODEL=gpt-image-2
T8_NANO_BANANA_MODEL=gemini-3.1-flash-image-preview
T8_REFERENCE_IMAGE_MAX_BYTES=15728640

AGENT_CHAT_PROVIDER=t8
AGENT_CHAT_API_KEY=your_t8_agent_chat_key
AGENT_CHAT_BASE_URL=https://ai.t8star.org/v1
AGENT_CHAT_MODEL=gemini-3.1-flash-lite-preview-thinking-high
AGENT_CHAT_TIMEOUT_MS=60000

TASK_WORKER_ENABLED=true
TASK_WORKER_CONCURRENCY=1
SYSTEM_MAX_RUNNING_IMAGE_TASKS=1
USER_MAX_RUNNING_IMAGE_TASKS=1
PROVIDER_MAX_RUNNING_IMAGE_TASKS=1

REQUIRE_TEAM_PROVIDER_CREDENTIALS=false
PROVIDER_CREDENTIAL_ENCRYPTION_KEY=
NEWAPI_MODELS_ENABLED=false
ENABLE_DATALER_PROVIDER=false
ENABLE_PIKACHU_PROVIDER=false
ENABLE_ATLAS_PROVIDER=false
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false
```

Do not commit real secrets. The current default image models are T8:

- Text-to-image: `custom-image-t8-gpt-image-2`
- Image-to-image / reference fallback: `custom-image-t8-gpt-image-2-edit`

Until team-scoped provider credentials and data isolation are rolled out, T8 uses the global `.env` key. Keep `REQUIRE_TEAM_PROVIDER_CREDENTIALS=false` for this deployment mode. The NewAPI scaffold is retained for later work but should stay disabled with `NEWAPI_MODELS_ENABLED=false`.

### Agent Chat Text Model

The right-bottom Agent chat is separate from T8 image generation. `T8_API_KEY` is for image generation; `AGENT_CHAT_API_KEY` is for text chat. Configure one of these before expecting Agent replies:

Recommended T8 Agent chat route:

```env
AGENT_CHAT_PROVIDER=t8
AGENT_CHAT_API_KEY=your_t8_agent_chat_key
AGENT_CHAT_BASE_URL=https://ai.t8star.org/v1
AGENT_CHAT_MODEL=gemini-3.1-flash-lite-preview-thinking-high
AGENT_CHAT_TIMEOUT_MS=60000
```

Fallback chain when `AGENT_CHAT_PROVIDER` is unset:

- APIMart text route: `APIMART_BASE_URL`, `APIMART_API_KEY`, and optionally `APIMART_TEXT_MODEL`
- Legacy OpenAI-compatible route: `CHAT_API_KEY` or `OPENAI_API_KEY`, plus optional `CHAT_API_BASE_URL`, `CHAT_MODEL`, and `CHAT_REASONING_EFFORT`

Health check:

1. Open the right-bottom Agent.
2. Send a short text-only message.
3. If no text key is configured, the expected response is a clear `AGENT_TEXT_MODEL_NOT_CONFIGURED` message, not a blank panel or generic server error.

## 5. Team Provider Credentials

MYML Canvas can resolve provider credentials from PostgreSQL before falling back to `.env`.

Resolution order:

1. Active team credential for the user's primary team
2. Active user credential
3. Active global credential
4. `.env` fallback such as `APIMART_API_KEY`

Set `REQUIRE_TEAM_PROVIDER_CREDENTIALS=true` for internal launches that require strong team isolation. In this mode, user tasks must resolve an active database credential from `provider_credentials`; `.env` provider keys are not used as fallback. Each team that uses a provider must have its own credential row, for example group1 and group2 should each have their own `atlas` credential before using Atlas.

For local development, keep `REQUIRE_TEAM_PROVIDER_CREDENTIALS=false` so `.env` provider keys can still be used as fallback.

The current seed maps existing internal users to teams when present:

- `group1.design@yxfa.cn` -> `team_group1_design`
- `group2.design@yxfa.cn` -> `team_group2_design`

### Provider Credential Encryption

`provider_credentials.api_key_encrypted` stores AES-256-GCM ciphertext in this format:

```text
v1:<iv_base64>:<tag_base64>:<ciphertext_base64>
```

Set `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` to a long random value or a base64-encoded 32-byte key. Back it up securely; if this key is lost, `v1:` provider credentials in the database cannot be decrypted.

Legacy plaintext credentials that do not start with `v1:` remain readable for migration, but the server will warn. Before production launch, run:

```bash
node scripts/encrypt-provider-credentials.js --dry-run
node scripts/encrypt-provider-credentials.js
```

Do not commit `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` or provider API keys to git. Normal users must never be able to read plaintext provider keys.

Example manual SQL for group 1 APIMart:

```sql
INSERT INTO provider_credentials (
  id,
  scope_type,
  scope_id,
  provider,
  label,
  base_url,
  api_key_encrypted,
  api_key_last4,
  status,
  priority
) VALUES (
  'cred_group1_apimart_primary',
  'team',
  'team_group1_design',
  'apimart',
  'Group 1 APIMart Primary',
  'https://api.apimart.ai/v1',
  '<ENCRYPTED_OR_PLACEHOLDER_API_KEY>',
  'abcd',
  'active',
  1
)
ON CONFLICT DO NOTHING;
```

Example manual SQL for group 2 APIMart:

```sql
INSERT INTO provider_credentials (
  id,
  scope_type,
  scope_id,
  provider,
  label,
  base_url,
  api_key_encrypted,
  api_key_last4,
  status,
  priority
) VALUES (
  'cred_group2_apimart_primary',
  'team',
  'team_group2_design',
  'apimart',
  'Group 2 APIMart Primary',
  'https://api.apimart.ai/v1',
  '<ENCRYPTED_OR_PLACEHOLDER_API_KEY>',
  'wxyz',
  'active',
  1
)
ON CONFLICT DO NOTHING;
```

If a SQL example inserts a temporary plaintext key, run `scripts/encrypt-provider-credentials.js` immediately after. Prefer inserting a pre-encrypted `v1:` value for long-lived environments.

Provider usage is recorded best-effort in `provider_usage_logs` with `task_id`, `user_id`, `team_id`, `credential_id`, provider, model, status, and provider task id. API keys are not written to usage logs.

## 6. Docker Compose

The included `docker-compose.yml` starts:

- `postgres`: PostgreSQL with a persistent Docker volume
- `twitcanva`: MYML Canvas backend serving the built app and API

Run:

```bash
docker compose up -d --build
```

Validate the rendered configuration:

```bash
docker compose config
```

Set real passwords and API keys through your shell environment or a local `.env` file before starting Compose.

For Atlas and team credential deployments, confirm these values render in `docker compose config` before starting the app:

- `ENABLE_ATLAS_PROVIDER`
- `ENABLE_ATLAS_NANO_BANANA_2`
- `ATLAS_BASE_URL`
- `ATLAS_API_KEY` or team-scoped `provider_credentials`
- `ATLAS_TEXT_TO_IMAGE_MODEL`
- `ATLAS_EDIT_MODEL`
- `ATLAS_REQUEST_TIMEOUT_MS`
- `PROVIDER_MAX_RUNNING_ATLAS`
- `REQUIRE_TEAM_PROVIDER_CREDENTIALS`
- `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`

Do not hard-code real provider secrets in `docker-compose.yml`; pass them from the host environment or deployment secret store.

## 7. Legacy Generation Endpoint

`/api/generate-image` is a legacy compatibility endpoint only. New image generation should use:

```text
POST /api/tasks/image
GET /api/tasks/:taskId
GET /api/tasks/by-node/:nodeId
```

Keep `VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false` unless you are intentionally testing old behavior.

The legacy endpoint rejects unscoped calls. Requests must include `legacySource=camera-angle` for Camera Angle or `legacySource=explicit-fallback` for an intentionally enabled fallback path.

## 8. Experimental Providers

Dataler, Pikachu, and Atlas are disabled by default:

```env
ENABLE_DATALER_PROVIDER=false
ENABLE_PIKACHU_PROVIDER=false
ENABLE_ATLAS_PROVIDER=false
ENABLE_ATLAS_NANO_BANANA_2=false
```

They do not enter the visible model/provider chain unless explicitly enabled. Use them only for controlled tests.

Atlas Cloud configuration:

```env
ENABLE_ATLAS_PROVIDER=true
# Keep false unless the account/route is confirmed for Nano Banana 2.
ENABLE_ATLAS_NANO_BANANA_2=false
ATLAS_BASE_URL=https://api.atlascloud.ai
ATLAS_API_KEY=
ATLAS_TEXT_TO_IMAGE_MODEL=openai/gpt-image-2/text-to-image
ATLAS_EDIT_MODEL=openai/gpt-image-2/edit
ATLAS_NANO_BANANA_2_TEXT_MODEL=google/nano-banana-2/text-to-image
ATLAS_NANO_BANANA_2_EDIT_MODEL=google/nano-banana-2/edit
ATLAS_NANO_BANANA_2_OUTPUT_FORMAT=default
ATLAS_NANO_BANANA_2_MEDIA_RESOLUTION=default
ATLAS_NANO_BANANA_2_THINKING_LEVEL=default
ATLAS_REQUEST_TIMEOUT_MS=300000
PROVIDER_MAX_RUNNING_ATLAS=1
```

Atlas currently registers these GPT Image 2 experimental image models when `ENABLE_ATLAS_PROVIDER=true`:

- `openai/gpt-image-2/text-to-image`
- `openai/gpt-image-2/edit`

Atlas Nano Banana 2 is additionally gated by `ENABLE_ATLAS_NANO_BANANA_2=true`:

- `google/nano-banana-2/text-to-image`
- `google/nano-banana-2/edit`

Atlas Nano Banana 2 requests follow the logged-in Atlas API example: they send `aspect_ratio`, `resolution`, `output_format=default`, `media_resolution=default`, and `thinking_level=default`; they do not send GPT Image style `size` or `quality`.
If Atlas returns `404 Not Found`, the current account, route, or model id is likely not open yet; keep `ENABLE_ATLAS_NANO_BANANA_2=false`.

Nano Banana 2 uses the same `provider = atlas` team credential. It does not need a separate key. For internal strong-isolation tests, use:

```env
ENABLE_ATLAS_PROVIDER=true
ENABLE_ATLAS_NANO_BANANA_2=false
REQUIRE_TEAM_PROVIDER_CREDENTIALS=true
PROVIDER_CREDENTIAL_ENCRYPTION_KEY=<long-random-secret>
```

### Team Atlas Credential Example

If team provider credentials are enabled in PostgreSQL, a team credential overrides the `.env` fallback for that provider. Example for group1:

```sql
INSERT INTO provider_credentials (
  id,
  scope_type,
  scope_id,
  provider,
  label,
  base_url,
  api_key_encrypted,
  api_key_last4,
  status,
  priority
) VALUES (
  'cred_group1_atlas_primary',
  'team',
  'team_group1_design',
  'atlas',
  'Group 1 Atlas Primary',
  'https://api.atlascloud.ai',
  '<ATLAS_API_KEY_PLACEHOLDER>',
  '7611',
  'active',
  1
)
ON CONFLICT DO NOTHING;
```

`api_key_encrypted` should contain a `v1:` encrypted value for long-lived environments. If this example is inserted as temporary plaintext, run the encryption script before production use.

## 9. Troubleshooting

### APIMart 402 Payment Required / Insufficient balance

This is a provider balance or quota issue. It is not a frontend, worker, or database error. Recharge or adjust the APIMart account and retry.

### Tasks stay queued

Check:

```env
TASK_WORKER_ENABLED=false
```

When this is false, tasks are intentionally queued and are not submitted to providers.

### Worker starts but no task runs

Check:

- Database connection and migrations
- `SYSTEM_MAX_RUNNING_IMAGE_TASKS`
- `USER_MAX_RUNNING_IMAGE_TASKS`
- `PROVIDER_MAX_RUNNING_APIMART`
- Existing tasks stuck in terminal states

### Dataler / Pikachu / Atlas do not appear

They are experimental and disabled by default. Enable the provider explicitly and provide its API key:

```env
ENABLE_DATALER_PROVIDER=true
DATALER_API_BASE_URL=
DATALER_API_KEY=
```

or:

```env
ENABLE_PIKACHU_PROVIDER=true
PIKACHU_API_KEY=
```

or:

```env
ENABLE_ATLAS_PROVIDER=true
ATLAS_API_KEY=
```

### Legacy generation unexpectedly runs

Ensure:

```env
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false
```

New generation should go through `/api/tasks/image`.

### Local library files are missing

Check `LIBRARY_DIR`, file permissions, and mounted volumes. In Docker Compose, `./library` is mounted to `/app/library`.

### Matting fails

Check:

```env
MYML_MATTING_BASE_URL=http://127.0.0.1:8000
```

and verify the matting service health endpoint separately.
