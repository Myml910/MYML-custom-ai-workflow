# Hermes Server Migration Checklist

Use this checklist before and after moving the MYML Canvas x Hermes integration to the server.

## MYML Canvas

- [ ] MYML Canvas is on the expected `test` branch.
- [ ] The server includes the required Hermes integration commits:
  - [ ] `9e0d601`
  - [ ] `c59d0a0`
  - [ ] `801a6af`
  - [ ] `3da55a2`
  - [ ] `7867530`
- [ ] `DATABASE_URL` exists in the MYML Canvas server environment.
- [ ] MYML Canvas can connect to PostgreSQL.
- [ ] `hermes_runs` exists.
- [ ] `hermes_assets` exists.
- [ ] MYML Canvas has:

```env
HERMES_CLIENT_MODE=api
HERMES_BASE_URL=http://127.0.0.1:8642/v1
HERMES_API_KEY=<same-as-api-server-key>
HERMES_MODEL=hermes-agent
HERMES_TIMEOUT_MS=180000
```

- [ ] `HERMES_API_KEY` matches Hermes API Server `API_SERVER_KEY`.
- [ ] `HERMES_API_KEY` is not exposed to frontend code or logs.

## Read-Only MYML Canvas Checks

Run these from the MYML Canvas project directory. They do not write database rows, do not call company MySQL, do not download images, and do not print secrets.

```bash
npm run check:hermes:env
npm run check:hermes:api
npm run check:hermes:db
npm run check:hermes:stale
```

- `check:hermes:env` verifies required MYML Canvas environment variables are present and redacts key/password/token/url fields.
- `check:hermes:api` calls only the Hermes API Server health endpoint and prints safe `status` / `platform` fields.
- `check:hermes:db` performs a read-only PostgreSQL query against recent `hermes_runs` rows and prints only safe summary columns.
- `check:hermes:stale` performs a read-only PostgreSQL query for `status='running'` Hermes runs older than 15 minutes. Stale rows require manual confirmation; the script does not update the database.

## Runtime Consistency Checks

- [ ] Hermes asset placeholder warnings do not mean the project lookup failed. If project fields were returned, `hermes_runs.status` should remain `completed` and asset insert warnings should be recorded in `response_payload.warnings`.
- [ ] `status='running'` rows older than 15 minutes should be reviewed manually with `npm run check:hermes:stale`.
- [ ] The Hermes project card defaults to the approved high-frequency field whitelist: project code, project name, customer, category, craft, size, quantity, deadline, and development requirement.
- [ ] Full redacted project fields remain available behind the collapsed "View all project fields" control.
- [ ] P3-A Hermes proposal responses may include `projectBrief`, `designStrategy`, `designTasks`, and `generationReadiness`.
- [ ] P3-A `generationReadiness.readyForImageGeneration` must be `false`.
- [ ] P3-A design tasks are prompt proposals only. MYML Canvas must not call image generation, download `ref_img`, visit `ref_link`, or create real image nodes from these tasks.
- [ ] Real image generation from Hermes design tasks is reserved for a later P4 worker path in MYML Canvas.

## Hermes API Server

- [ ] Hermes is installed on the server.
- [ ] Hermes API Server is enabled.
- [ ] Health endpoint works:

```bash
curl -s http://127.0.0.1:8642/health
```

- [ ] Expected health response:

```json
{"status":"ok","platform":"hermes-agent"}
```

- [ ] `API_SERVER_KEY` is configured.
- [ ] `API_SERVER_HOST=127.0.0.1`.
- [ ] `API_SERVER_PORT=8642`.
- [ ] `company-system` plugin is installed.
- [ ] `company-system` plugin is enabled.
- [ ] `company_system` toolset is enabled for `api_server`.
- [ ] `COMPANY_SYSTEM_MOCK=0`.
- [ ] `COMPANY_DB_TYPE=mysql`.
- [ ] `COMPANY_DB_HOST` is configured with a placeholder replaced on the server only.
- [ ] `COMPANY_DB_PORT=3306`.
- [ ] `COMPANY_DB_NAME=yxfproduct`.
- [ ] `COMPANY_DB_USER` is a read-only user.
- [ ] `COMPANY_DB_PASSWORD` is configured on the server only.
- [ ] `COMPANY_DB_VIEW=v_yxf_project_design_context`.
- [ ] `COMPANY_DB_TIMEOUT_MS=5000`.
- [ ] `pymysql` is installed in the Hermes runtime environment.

## End-To-End Test

Use test project:

```text
YXF2504090116
```

Expected:

- [ ] User sends a right-side Agent message to start work on `YXF2504090116`.
- [ ] MYML Canvas calls Hermes from the server.
- [ ] Hermes calls `company_project_lookup`.
- [ ] MYML Canvas ChatPanel shows the Hermes project card.
- [ ] If the message asks for a design proposal, MYML Canvas ChatPanel shows the design strategy card and design task prompt list.
- [ ] `hermes_runs.response_payload->'generationReadiness'->>'readyForImageGeneration' = 'false'` for P3-A proposal runs.
- [ ] `hermes_runs.status = 'completed'`.
- [ ] `hermes_assets` contains the mock local image asset.
- [ ] `hermes_runs.project_fields.source = 'mysql_view'`.
- [ ] `hermes_runs.project_fields.mock = false`.
- [ ] `hermes_runs.project_fields.companyFields` exists.
- [ ] `hermes_runs.project_fields.companyFields.companyFields` does not exist.

Example read-only SQL:

```sql
select
  id,
  project_code,
  status,
  project_fields->>'source' as source,
  project_fields->>'mock' as mock,
  project_fields ? 'companyFields' as has_company_fields,
  project_fields->'companyFields' ? 'companyFields' as has_nested_company_fields,
  created_at
from hermes_runs
where project_code = 'YXF2504090116'
order by created_at desc
limit 5;
```

## Must Not Happen

- [ ] MYML Canvas must not connect directly to company MySQL.
- [ ] Browser must not call Hermes directly.
- [ ] Browser must not receive `API_SERVER_KEY` or `HERMES_API_KEY`.
- [ ] Hermes must not return external image URLs in P2.
- [ ] MYML Canvas must not download `ref_img`.
- [ ] MYML Canvas must not visit `ref_link`.
- [ ] Real secrets must not appear in Git, frontend bundles, or browser network traffic.
