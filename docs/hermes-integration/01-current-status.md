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

P3-C scope:

- Hermes may return structured `references.images`, `references.links`, and `references.notes`.
- MYML Canvas may identify and display company reference image URLs, reference links, Amazon URLs, and product URLs.
- Current company View reference fields include `design_img`, `design_link`, `oper_img`, and `oper_link`.
- MYML Canvas merges references from Hermes LLM output, `companyFields.references`, and raw company fields such as `design_img`, `oper_img`, `design_link`, and `oper_link`.
- Reference items may include `resolvedUrl`, `url`, or `rawValue`; only http/https values are opened as links.
- Reference image merge prefers complete `companyFields.references.images` records with `resolvedUrl` / `url` / `safeToDisplay=true`; raw `design_img` / `oper_img` fields are only fallback records.
- MYML Canvas does not download external reference images, crawl Amazon, visit `ref_link`, or import references into the asset library in P3-C.
- Moving references into the canvas, safe downloading, and using them as image-generation inputs are reserved for later P4/P5 work.

P3-E scope:

- Hermes may return `designTasks[].structuredPromptDescription` as a structured intermediate layer for image-generation prompts.
- `structuredPromptDescription` records subject, product context, art style, color, composition, layered details, typography, production constraints, reference usage, and negative constraints.
- `designTasks[].prompt` remains the final English prompt intended for later MYML Canvas image workers.
- MYML Canvas displays the structured prompt description for review and copying only. It does not execute image generation in P3-E.
- Designers can copy the final prompt, negative prompt, structured prompt Markdown, or a full generation package from each task card.
- Hermes should align total design demand with explicit project requirements when present. Response payload may include `expectedDesignTaskCount`, `actualDesignTaskCount`, `maxDesignsPerGeneration`, `countReason`, and `batchPlan`.
- `maxDesignsPerGeneration` is currently 6. If the project requires more than 6 directions, Hermes should plan only the first batch of 6 directions and return `batchPlan` for the remaining directions.
- P3-F records current manual validation: T8 GPT Image 2 and T8 Nano Banana 3.1 Flash are the preferred model recommendations for pattern tasks.
- Each design task should include `modelRecommendation`, `alternativeModelRecommendation`, and `modelReason`. MYML Canvas displays these recommendations but does not run image generation automatically.

P4-A scope:

- Designers may manually click "Generate Draft" on one Hermes `designTask` card.
- MYML Canvas routes that single task through the existing `/api/tasks/image` async image task path.
- The draft request uses `designTasks[].prompt`, `designTasks[].negativePrompt`, and `designTasks[].modelRecommendation` metadata.
- The default P4-A draft model is `custom-image-t8-nano-banana-3-1-flash` for pattern exploration and style variation.
- `custom-image-t8-gpt-image-2` remains recommended for tasks that need stronger structure, small-size print stability, or readable text.
- P4-A does not auto-generate all tasks, does not batch-generate a full set, and does not create canvas nodes from the result.
- P4-A does not download or access reference images/links and does not use reference URLs as image-to-image inputs.
- P4-A does not write back to the company system.

## Current Non-Goals

Do not do these during this migration preparation phase:

- Do not connect MYML Canvas directly to company MySQL.
- Do not connect real image generation through Hermes.
- Do not download `ref_img`.
- Do not visit or crawl `ref_link`.
- Do not download `design_img` or `oper_img`.
- Do not visit `design_link` or `oper_link`.
- Do not create real canvas nodes from Hermes results.
- Do not automatically execute image generation from P3-A design tasks.
- Do not automatically execute image generation from P3-E task batches. P4-A only allows a designer-triggered single-task draft.
- Do not treat `ref_img` or `ref_link` as downloaded or trusted local assets.
- Do not download or proxy P3-C reference images.
- Do not crawl Amazon or any product reference URL.
- Do not submit multiple P3-E prompts to image generation workers without explicit designer action on each task.
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
