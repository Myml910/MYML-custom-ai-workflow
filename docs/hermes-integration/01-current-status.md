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
8. Hermes returns a JSON object with project fields, design strategy, design tasks, prompts, references, and generation readiness metadata.
9. MYML Canvas creates a Hermes Project canvas node and keeps the right-side Agent as the trigger / summary surface.
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

P4-B-1 scope:

- Successful Hermes runs can create a `HERMES_PROJECT` canvas node.
- Failed, timed out, running, or payload-empty Hermes runs do not create canvas project nodes; the Agent shows a compact failure summary instead.
- The right-side Agent remains the trigger and compact feedback surface; the canvas node is the main project execution panel.
- The Hermes Project node is a normal canvas node: it can be dragged, selected, deleted, and persisted in workflow JSON.
- The node displays project summary, reference image/link cards, and simplified design task cards.
- P4-B-1 does not auto-generate all design tasks, does not download references, does not use reference URLs as image-to-image inputs, and does not write back to the company system.

P4-B-2 scope:

- A fresh completed Hermes run now creates a Hermes Project node and automatically submits the current batch of AI candidate image tasks through MYML Canvas `/api/tasks/image`.
- Hermes still only decides the project strategy and `designTasks`; MYML Canvas workers execute image generation through the existing task runner and provider router.
- The current batch count follows `expectedDesignTaskCount` and `maxDesignsPerGeneration=6`; if the project needs more than 6 directions, only the first batch is generated and `batchPlan` shows the remaining count.
- Each auto draft records `generationTaskId`, status, model, `originalModelRecommendation`, `normalizedModelRecommendation`, prompt, result URL, and safe error text in the Hermes Project node metadata.
- P4-B-2 does not generate later batches automatically, does not download or use reference images as image-to-image input, and does not write back to the company system.

P5-C scope:

- Hermes Project nodes can recover existing candidate generation task status from `generation_tasks` by `hermesRunId`, `designTaskId`, and `projectCode`.
- Recovery is read-only and scoped to the current authenticated user.
- Refreshing the browser or reloading a workflow should update candidate task status / result URLs without resubmitting `/api/tasks/image`.
- Recovery does not download references, does not access external links, does not use reference images as generation inputs, and does not write back to the company system.

P5-D scope:

- Hermes Project node metadata now normalizes candidate results into `hermesProject.generatedImages`.
- `generatedImages` is derived from existing `designTasks`, `draftRunsByTaskId`, references, and recovered `generation_tasks`; it does not require a new database table.
- Each generated image record carries project code, Hermes run id, design task id, generation task id, model/provider, prompt metadata, status, result URL, safe error text, reference ids/urls, and trigger mode.
- `generatedImages` is intended as the stable handoff structure for later external comparison against company-system final submitted images.
- P5-D does not query final submission images, add scoring UI, download references, or rerun failed tasks.

P5-E-1 scope:

- Complex multi-product bundle projects are guarded in the Hermes system prompt to reduce timeout risk.
- Hermes should detect `multiProductBundle=true` when project fields contain signals such as gift sets, multiple `1pc` products, plus-separated products, multiple sizes, or multiple crafts.
- Hermes should output concise `productTasks` first, then derive `designTasks` from those product tasks.
- For multi-product bundles, design task count follows product demand while `maxDesignsPerGeneration=6` remains the current single-batch limit, not a fixed required count.
- Complex bundle output should stay concise: short `projectBrief`, short `designStrategy`, at most two reference notes, at most two task notes, and 1-2 sentences per structured prompt section.
- P5-E-1 does not change the Hermes plugin, database schema, reference download policy, or image generation flow.

P5-E-2 scope:

- Complex multi-product bundle projects use compact output mode to reduce Hermes timeout risk.
- In compact mode, Hermes must prioritize `productTasks` plus image-generation-ready `designTasks` containing `prompt`, `negativePrompt`, model recommendation, and lightweight reference metadata.
- In compact mode, full 10-section `structuredPromptDescription` is not required. It may be omitted or reduced to a few one-sentence fields.
- Compact mode still keeps the product-demand count rules: `expectedDesignTaskCount` follows project demand and `maxDesignsPerGeneration=6` remains the single-batch cap.
- P5-E-2 does not change the Hermes plugin, database schema, reference download policy, external link policy, or MYML image-generation worker path.

P5-E-3A scope:

- Complex projects now start with `lightweight_decomposition` mode by default from the MYML Agent Hermes intent.
- Stage 1 asks Hermes only for project summary, `productTasks`, references, count metadata, `batchPlan`, and `generationReadiness`.
- Stage 1 must not return `designTasks`, full prompts, `negativePrompt`, or `structuredPromptDescription`.
- Hermes Project canvas nodes can display `productTasks` and show that prompt generation is waiting for Stage 2.
- `lightweightMode=true` runs do not auto-submit `/api/tasks/image`; candidate generation waits for Stage 2 per-product prompt generation.
- P5-E-3A does not change the Hermes plugin, database schema, reference download policy, external link policy, or MYML image-generation worker path.

P5-E-3B scope:

- Stage 2 generates prompts one `productTask` at a time after lightweight decomposition succeeds.
- Each Stage 2 call returns one short JSON `designTask` with `structuredPromptDescription`, `generationPrompt`, `prompt`, `negativePrompt`, model recommendation, reference metadata, and `productTaskId`.
- `generationPrompt` is the sectioned Markdown package used as the preferred image-model input. The shorter `prompt` is retained as the final prompt / fallback.
- Stage 2 `designTask.taskId` is forced to be unique and product-order based (`product_01 -> concept_01`, `product_02 -> concept_02`, etc.) so auto generation, recovery, and `generatedImages` do not collapse multiple products into one task.
- Stage 2 runs serially and processes only the current batch, capped at `maxDesignsPerGeneration=6`.
- Product-task prompt failures are recorded in `productTaskPrompts` and `warnings`; they do not fail the whole Hermes run.
- Successful Stage 2 `designTasks` reuse the existing MYML `/api/tasks/image` candidate generation path, passing `generationPrompt` as `input.prompt`.
- Stage 2 does not download references, visit links, pass reference images as image inputs, write back to company systems, or add database schema.

## Current Non-Goals

Do not do these during this migration preparation phase:

- Do not connect MYML Canvas directly to company MySQL.
- Do not connect real image generation through Hermes.
- Do not download `ref_img`.
- Do not visit or crawl `ref_link`.
- Do not download `design_img` or `oper_img`.
- Do not visit `design_link` or `oper_link`.
- Do not create separate image-generation canvas nodes or company-system asset records automatically from Hermes results.
- Do not let Hermes call image generation directly or bypass MYML Canvas workers.
- Do not automatically execute later `batchPlan` batches. P4-B-2 only auto-generates the current batch for a fresh Hermes run.
- Do not resubmit candidate generation tasks when a saved Hermes Project node is restored; use read-only task recovery instead.
- Do not add candidate statistics tables or scoring UI in P5-D; `generatedImages` is a workflow JSON / node metadata normalization step only.
- Do not treat `ref_img` or `ref_link` as downloaded or trusted local assets.
- Do not download or proxy P3-C reference images.
- Do not crawl Amazon or any product reference URL.
- Do not use reference URLs as image-to-image inputs when auto-generating current-batch candidates.
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
