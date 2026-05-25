# Designer Account Credential Seeding

This note documents the local helper for preparing 10 designer test accounts with user-scoped provider credentials.

Current boundary:

- Do not store real passwords or API keys in git.
- Do not run `--apply` from a laptop against production unless the operator has intentionally configured the target database.
- Use `--dry-run` first with fake input.
- Use user-scoped credentials for the 10-person test unless there is a specific team-budget reason to create one team per person.

## Files

- Script: `scripts/seed-designer-user-credentials.cjs`
- Fake example input: `tmp/designer-accounts.example.json`
- Real local inputs should use a path matching `tmp/designer-accounts*.json`; `.gitignore` keeps them out of git, except the fake example.

## Input Shape

The script accepts an array directly, or an object with `designers`, `accounts`, or `users`.

```json
{
  "designers": [
    {
      "username": "designer01@example.test",
      "password": "demo-only-change-me-01",
      "role": "designer",
      "status": "active",
      "credentials": [
        {
          "provider": "t8",
          "apiKey": "fake-t8-key-designer01-0001",
          "label": "primary",
          "status": "active",
          "priority": 1
        }
      ]
    }
  ]
}
```

Supported providers:

- `t8`
- `atlas`

The script always writes credentials as:

- `scope_type = 'user'`
- `scope_id = users.id`

It only logs `api_key_last4`, never full API keys.

## Dry Run

Run locally with fake data:

```bash
node scripts/seed-designer-user-credentials.cjs --input tmp/designer-accounts.example.json --dry-run
```

Dry-run behavior:

- validates JSON shape
- validates provider names
- reports whether `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` is configured
- prints users that would be ensured
- prints credentials that would be upserted
- does not connect to PostgreSQL
- does not hash passwords
- does not encrypt keys
- does not write anything

## Apply

Run only on the intended server or against the intended database:

```bash
node scripts/seed-designer-user-credentials.cjs --input /secure/path/designer-accounts.json --apply
```

Apply behavior:

- requires `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`
- connects to PostgreSQL using existing `DATABASE_URL` or PG env vars
- creates missing users with bcrypt password hashes
- skips user creation when `username` already exists
- inserts or updates matching user-scoped provider credentials by user/provider/label
- encrypts provider API keys with the existing `server/utils/providerCredentialCrypto.js` logic
- logs only `apiKeyLast4`

## Recommended Test Setup

For the 10 designer test, prefer user-scoped credentials:

- one `users` row per designer
- one `provider_credentials` row per designer/provider
- `scope_type = 'user'`
- `scope_id = users.id`

This is easier to audit than one-user-one-team for the first personal-account test.

One-user-one-team can be introduced later if budgets need to be managed as team pools.

## Server Apply Checklist

1. Put the real input file outside git, or in an ignored path such as `tmp/designer-accounts.production.json`.
2. Confirm `.env` or service environment has `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`.
3. Confirm the target database is the intended test database.
4. Run the script with `--dry-run` on the server first.
5. Run the script with `--apply`.
6. Set `REQUIRE_TEAM_PROVIDER_CREDENTIALS=true` for strict attribution testing.
7. Restart the app only if the deployment environment requires it for changed env values.

## Read-Only Verification SQL

Confirm users:

```sql
select id, username, role, status, created_at
from users
order by username;
```

Confirm user-scoped credentials without exposing keys:

```sql
select
  u.username,
  pc.provider,
  pc.scope_type,
  pc.status,
  pc.priority,
  pc.api_key_last4,
  pc.label
from provider_credentials pc
join users u on u.id = pc.scope_id
where pc.scope_type = 'user'
order by u.username, pc.provider, pc.priority;
```

Confirm no new test tasks are falling back to env credentials after testing starts:

```sql
select username, provider, model, credential_id, team_id, status, count(*) as task_count
from generation_tasks
where created_at >= '<test_start_timestamp>'
group by username, provider, model, credential_id, team_id, status
order by username, task_count desc;
```

Confirm provider usage attribution:

```sql
select
  u.username,
  pul.provider,
  pul.upstream_model,
  pul.credential_id,
  pul.status,
  count(*) as usage_events,
  sum(coalesce(pul.image_count, 0)) as image_count,
  sum(coalesce(pul.provider_cost, 0)) as provider_cost
from provider_usage_logs pul
left join users u on u.id = pul.user_id
where pul.created_at >= '<test_start_timestamp>'
group by u.username, pul.provider, pul.upstream_model, pul.credential_id, pul.status
order by u.username, usage_events desc;
```

## Safety Notes

- Never commit real `designer-accounts*.json` files.
- Never paste real API keys into chat, logs, screenshots, or PR descriptions.
- Never print `api_key_encrypted`; only inspect `api_key_last4`.
- Use unique personal accounts. Shared group accounts will mix workflow history and usage attribution.
- Historical tasks with `credential_id is null` can remain as legacy data; test reporting should filter by the formal test start timestamp.
