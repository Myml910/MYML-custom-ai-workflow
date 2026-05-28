# MYML Canvas x Hermes Agent Current Status

This document records the current integration state before server migration.

## Current Branch And Key Commits

Current MYML Canvas branch: `test`

Key commits that form the current Hermes integration baseline:

- `9e0d601` Add Hermes agent mock run pipeline
- `c59d0a0` Separate agent model config and focus canvas context
- `801a6af` Add Hermes API client mode
- `3da55a2` Show full Hermes project fields
- `7867530` Preserve full Hermes project fields

## Current End-to-End Flow

The intended server-side flow is:

1. User opens the right-side MYML Canvas Agent.
2. User enters a request such as starting work on a `YXF...` project.
3. MYML Canvas extracts the `YXF` project code on the server.
4. MYML Canvas calls the Hermes API Server from the backend only.
5. Hermes loads the `company-system:project-lookup` skill.
6. Hermes calls `company_project_lookup`.
7. The company-system plugin reads the read-only MySQL View.
8. Hermes returns a JSON object with project fields, design strategy, design tasks, prompts, and P3-A generation readiness metadata.
9. MYML Canvas renders the Hermes project card in ChatPanel.
10. MYML Canvas writes `hermes_runs` and `hermes_assets`.

The browser must not call Hermes directly and must never receive the Hermes API key.

## Current Data Written By MYML Canvas

MYML Canvas persists Hermes execution data in:

- `hermes_runs`
  - `user_id`
  - `username`
  - `project_code`
  - `status`
  - `project_fields`
  - `generation_strategy`
  - `design_task`
  - `response_payload`
  - error fields when the run fails
- `hermes_assets`
  - Hermes run relationship
  - project code
  - local mock asset URL
  - model and prompt metadata

`project_fields` and `response_payload.project` are expected to preserve complete company project fields returned by Hermes, with sensitive keys redacted by MYML Canvas before storage.

## Current Scope

Completed:

- Right-side Agent detects explicit `YXF...` project start intent.
- Hermes mock run pipeline is available.
- Hermes API client mode is available.
- Normal Agent text model config is separated from Hermes execution config.
- Agent canvas context is focused by default.
- Hermes card can display full project fields safely.
- Hermes project fields are preserved in JSONB storage.
- Hermes can return P3-A design proposal data: `projectBrief`, `designStrategy`, `designTasks`, and `generationReadiness`.

P3-A scope:

- Hermes may generate design strategy, production-oriented pattern prompts, and negative prompts.
- `generationReadiness.readyForImageGeneration` must remain `false`.
- MYML Canvas displays the proposal and prompt list only.
- Real image generation is reserved for a later P4 worker flow inside MYML Canvas.

## Current Non-Goals

Do not do these during this migration preparation phase:

- Do not connect MYML Canvas directly to company MySQL.
- Do not connect real image generation through Hermes.
- Do not download `ref_img`.
- Do not visit or crawl `ref_link`.
- Do not create real canvas nodes from Hermes results.
- Do not execute image generation from P3-A design tasks.
- Do not treat `ref_img` or `ref_link` as downloaded or trusted local assets.
- Do not store real passwords, keys, internal connection strings, or customer-sensitive raw debug data in Git.
- Do not expose `API_SERVER_KEY`, `HERMES_API_KEY`, database credentials, or internal hostnames to the frontend.

## Deployment Assumption

Hermes API Server runs on the same server or same private host as MYML Canvas, bound to `127.0.0.1`.

MYML Canvas should call:

```text
POST http://127.0.0.1:8642/v1/chat/completions
Authorization: Bearer <same-as-api-server-key>
```

The public browser should only call MYML Canvas APIs.
