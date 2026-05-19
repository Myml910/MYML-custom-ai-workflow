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
npx vite --host 0.0.0.0 --port 4246
```

`npm run dev` still starts backend and frontend together. Use it for simple UI development only. If you enable the background worker, prefer separate terminals so it is clear which process can submit paid provider tasks.

## 3. Worker-Enabled Development

When `TASK_WORKER_ENABLED=false`, image tasks are created and remain `queued`; no background provider calls are made.

Linux/macOS:

```bash
TASK_WORKER_ENABLED=true TASK_WORKER_CONCURRENCY=1 npm run server
npx vite --host 0.0.0.0 --port 4246
```

Windows cmd:

```bat
set TASK_WORKER_ENABLED=true
set TASK_WORKER_CONCURRENCY=1
npm run server
```

Then start Vite in another terminal:

```bat
npx vite --host 0.0.0.0 --port 4246
```

Recommended defaults:

- Development: `TASK_WORKER_ENABLED=false`, or `true` with `TASK_WORKER_CONCURRENCY=1` for controlled testing
- Staging: `TASK_WORKER_ENABLED=true`, low provider limits
- Production: `TASK_WORKER_ENABLED=true`, provider limits set to purchased quota

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

APIMART_BASE_URL=https://api.apimart.ai/v1
APIMART_API_KEY=your_apimart_key

TASK_WORKER_ENABLED=false
TASK_WORKER_CONCURRENCY=2
SYSTEM_MAX_RUNNING_IMAGE_TASKS=4
USER_MAX_RUNNING_IMAGE_TASKS=2
PROVIDER_MAX_RUNNING_APIMART=2
PROVIDER_MAX_RUNNING_ATLAS=1

ENABLE_DATALER_PROVIDER=false
ENABLE_PIKACHU_PROVIDER=false
ENABLE_ATLAS_PROVIDER=false
VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false
```

Do not commit real secrets. `APIMART_BASE_URL` is the runtime variable used by the server for the APIMart API base URL.

## 5. Docker Compose

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

## 6. Legacy Generation Endpoint

`/api/generate-image` is a legacy compatibility endpoint only. New image generation should use:

```text
POST /api/tasks/image
GET /api/tasks/:taskId
GET /api/tasks/by-node/:nodeId
```

Keep `VITE_ENABLE_LEGACY_GENERATION_FALLBACK=false` unless you are intentionally testing old behavior.

## 7. Experimental Providers

Dataler, Pikachu, and Atlas are disabled by default:

```env
ENABLE_DATALER_PROVIDER=false
ENABLE_PIKACHU_PROVIDER=false
ENABLE_ATLAS_PROVIDER=false
```

They do not enter the visible model/provider chain unless explicitly enabled. Use them only for controlled tests.

Atlas Cloud configuration:

```env
ENABLE_ATLAS_PROVIDER=true
ATLAS_BASE_URL=https://api.atlascloud.ai
ATLAS_API_KEY=
ATLAS_TEXT_TO_IMAGE_MODEL=openai/gpt-image-2/text-to-image
ATLAS_EDIT_MODEL=openai/gpt-image-2/edit
ATLAS_REQUEST_TIMEOUT_MS=300000
PROVIDER_MAX_RUNNING_ATLAS=1
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

`api_key_encrypted` is currently a passthrough placeholder in this branch. Do not store long-lived production keys there until proper encryption/KMS is wired in.

## 8. Troubleshooting

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
