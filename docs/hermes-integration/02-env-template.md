# Hermes Integration Environment Templates

Use placeholders only. Do not commit real keys, passwords, internal hostnames, or customer data.

## MYML Canvas Server

These variables belong in the MYML Canvas server environment.

```env
HERMES_CLIENT_MODE=api
HERMES_BASE_URL=http://127.0.0.1:8642/v1
HERMES_API_KEY=<same-as-api-server-key>
HERMES_MODEL=hermes-agent
HERMES_TIMEOUT_MS=180000

AGENT_TEXT_PROVIDER=t8
AGENT_TEXT_BASE_URL=https://ai.t8star.org/v1
AGENT_TEXT_API_KEY=<agent-text-api-key>
AGENT_TEXT_MODEL=gemini-3.1-pro-preview
AGENT_TEXT_TIMEOUT_MS=90000
```

Notes:

- `HERMES_API_KEY` must match Hermes API Server `API_SERVER_KEY`.
- `HERMES_API_KEY` is server-only. It must not be sent to the browser.
- MYML Canvas must not contain `COMPANY_DB_*` variables because MYML Canvas should not connect to company MySQL directly.
- `AGENT_TEXT_*` is for normal right-side Agent chat.
- Hermes execution model config is separate from normal Agent text chat.

## Hermes API Server

These variables belong in the Hermes API Server environment.

```env
API_SERVER_ENABLED=true
API_SERVER_KEY=<local-or-server-secret>
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642

COMPANY_SYSTEM_MOCK=0
COMPANY_DB_TYPE=mysql
COMPANY_DB_HOST=<mysql-host>
COMPANY_DB_PORT=3306
COMPANY_DB_NAME=yxfproduct
COMPANY_DB_USER=<readonly-user>
COMPANY_DB_PASSWORD=<readonly-password>
COMPANY_DB_VIEW=v_yxf_project_design_context
COMPANY_DB_TIMEOUT_MS=5000
```

Notes:

- Use a read-only MySQL account.
- The MySQL user should only have the minimum privileges needed to read `COMPANY_DB_VIEW`.
- `COMPANY_SYSTEM_MOCK=0` means the plugin should use the configured company-system read-only View rather than mock data.
- `API_SERVER_HOST=127.0.0.1` prevents direct public access when MYML Canvas and Hermes run on the same server.
- If Hermes runs on a separate private host, use a private network address and firewall rules. Do not expose the API Server directly to the public internet.

## Forbidden In Git

Never commit:

- Real `API_SERVER_KEY`
- Real `HERMES_API_KEY`
- Real T8 or provider API keys
- Real database passwords
- Internal database hostnames or private IPs
- Raw customer-sensitive project payloads

