# Company-System Plugin Deployment Notes

This document records the deployment boundary for the Hermes `company-system` plugin.

## Source And Backup Locations

Fill these paths during server migration. Keep real internal paths out of public commits if they reveal sensitive infrastructure.

```text
Local plugin source directory:
<local-hermes-repo>/plugins/company-system

Private plugin backup repository:
<private-plugin-backup-repo>/company-system

Server plugin directory:
<server-hermes-home>/plugins/company-system
```

The server plugin directory must be confirmed on the target server before migration.

## Expected Skill

MYML Canvas expects Hermes to load:

```text
skill_view(name="company-system:project-lookup")
```

The skill must be able to call:

```text
company_project_lookup(projectCode)
```

The final Hermes JSON returned to MYML Canvas must preserve the full project object returned by `company_project_lookup` and must place the same full object in `project.companyFields`.

## Enable Plugin

Use the actual Hermes CLI or admin command available on the server. Record the exact command during migration.

Template:

```bash
<hermes-command> plugin enable company-system
```

or, if Hermes uses a local plugin registry:

```bash
<hermes-command> plugin install <server-hermes-home>/plugins/company-system
<hermes-command> plugin enable company-system
```

## Enable Toolset For API Server

The `company_system` toolset must be available to the `api_server` execution context.

Template:

```bash
<hermes-command> toolset enable company_system --for api_server
```

If Hermes uses a config file instead of CLI flags, record the exact config key and value here during migration.

## Restart Requirement

After changing plugin code, skill instructions, fixtures, schemas, or toolset config:

1. Restart `hermes gateway`.
2. Confirm health:

```bash
curl -s http://127.0.0.1:8642/health
```

Expected:

```json
{"status":"ok","platform":"hermes-agent"}
```

## Safety Rules

- Do not commit real `.env` files.
- Do not commit real DB passwords.
- Do not commit internal connection strings.
- Do not commit customer-sensitive payload examples.
- Keep plugin backup in a private repository.
- Keep the Hermes API Server key server-side only.

