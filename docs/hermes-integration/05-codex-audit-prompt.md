# Codex Audit Prompt For Hermes Migration

Use this prompt for a later read-only migration risk audit.

```text
You are auditing the MYML Canvas x Hermes Agent server migration.

Scope:
- Read-only audit only.
- Do not modify files.
- Do not install dependencies.
- Do not run real image generation.
- Do not download ref_img.
- Do not visit ref_link.
- Do not connect MYML Canvas directly to company MySQL.
- Do not print or store real secrets.

Current intended flow:
MYML Canvas right-side Agent
-> server extracts YXF project code
-> server calls Hermes API Server
-> Hermes company-system plugin queries company MySQL read-only View
-> Hermes returns project fields, strategy, designTask, and local mock asset URL
-> MYML Canvas writes hermes_runs / hermes_assets
-> MYML Canvas renders Hermes project card

Audit these risks:

1. Secret leakage
- Check whether real API keys, database passwords, internal hostnames, or connection strings are committed.
- Check .env.example and docs for placeholders only.
- Check logs for API key, Authorization, DB password, or raw upstream debug output.

2. Direct database access boundary
- Confirm MYML Canvas never connects to company MySQL.
- Confirm only Hermes company-system plugin owns COMPANY_DB_* access.
- Confirm COMPANY_DB_USER is expected to be read-only.

3. Hermes API security
- Confirm Hermes API Server key stays server-side.
- Confirm frontend cannot call Hermes directly.
- Confirm HERMES_API_KEY is never sent to browser responses.
- Confirm API_SERVER_HOST is local/private and not accidentally public.

4. Timeout and error handling
- Check HERMES_TIMEOUT_MS behavior.
- Check failed Hermes calls write hermes_runs status=failed.
- Check ChatPanel displays friendly errors.
- Check invalid JSON from Hermes does not crash the server.

5. Persistence protection
- Check hermes_runs and hermes_assets writes are guarded.
- Check partial failure behavior.
- Check response_payload and project_fields are JSONB-safe.
- Check project_fields redacts sensitive nested fields.
- Check project_fields does not contain recursive companyFields.companyFields.

6. Project field sensitivity
- Check whether project_fields may preserve too much sensitive data.
- Identify fields that should be saved but hidden from UI.
- Identify fields that should be redacted before storage.

7. Deployment portability
- Check for Windows-only paths.
- Check plugin directory assumptions.
- Check Hermes command assumptions.
- Check any hardcoded local development paths.

8. Mode clarity
- Confirm HERMES_CLIENT_MODE=mock and api behavior is clear.
- Confirm mock mode cannot be mistaken for real company-system output.
- Confirm api mode errors clearly when plugin/toolset is not enabled.

9. Plugin readiness
- Confirm company-system plugin is enabled.
- Confirm company_system toolset is enabled for api_server.
- Confirm COMPANY_SYSTEM_MOCK=0 for real field lookup.
- Confirm pymysql is installed in Hermes runtime.

Output:
- P0 blockers
- P1 risks
- P2 hardening items
- Read-only verification commands
- Minimal remediation plan
- Explicit list of things not to change
```

