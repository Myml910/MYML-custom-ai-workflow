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
- [ ] P3-C reference responses may include `references.images`, `references.links`, and `references.notes`.
- [ ] Company View fields `design_img`, `design_link`, `oper_img`, and `oper_link` are recognized as P3-C reference material fields.
- [ ] P3-C references are fallback-merged from Hermes output, `companyFields.references`, and raw company fields, so `references.images` / `references.links` are not lost if the LLM omits them.
- [ ] P3-C reference items may use `resolvedUrl`, `url`, or `rawValue`; only http/https references should be openable.
- [ ] P3-C image reference merge prefers complete `companyFields.references.images` records over raw `design_img` / `oper_img` fallback records.
- [ ] P3-C image reference merge deduplicates same-URL images and keeps the more specific `design_img` / `oper_img` source over generic `references` records.
- [ ] P3-C only identifies and displays reference URLs. MYML Canvas must not download external reference images, crawl Amazon, visit `ref_link`, or create imported assets from these references.
- [ ] Reference images can be shown as safe link cards. Moving them into the canvas or asset library is reserved for later P4/P5 work.
- [ ] P3-E design tasks may include `structuredPromptDescription` as a prompt-generation intermediate layer.
- [ ] P3-E `structuredPromptDescription` is displayed for review only. MYML Canvas must not submit these prompts to image generation workers until a later P4 flow.
- [ ] P3-E task cards allow copying the final prompt, negative prompt, structured prompt Markdown, and full generation package.
- [ ] P3-E task count should match explicit project demand when present; compare `expectedDesignTaskCount` and `actualDesignTaskCount`.
- [ ] P3-E `maxDesignsPerGeneration` is 6. If `expectedDesignTaskCount` is greater than 6, Hermes should return 6 current tasks plus a `batchPlan`.
- [ ] P3-E batch planning is proposal-only. MYML Canvas must not execute it automatically; P4-A only allows explicit single-task draft generation.
- [ ] P3-F design tasks include `modelRecommendation`, `alternativeModelRecommendation`, and `modelReason`.
- [ ] P3-F recommended model IDs are `custom-image-t8-gpt-image-2` and `custom-image-t8-nano-banana-3-1-flash`. These are recommendations only, not automatic generation.
- [ ] P4-A allows a designer to click "Generate Draft" for one Hermes `designTask` at a time.
- [ ] P4-A draft generation uses the existing `/api/tasks/image` async task path and stores Hermes task metadata in task input JSON.
- [ ] P4-A default draft model is `custom-image-t8-nano-banana-3-1-flash`; use `custom-image-t8-gpt-image-2` when a task needs stronger structure, small-size print stability, or readable text.
- [ ] P4-A maps legacy Hermes model IDs to T8 draft models: `custom-image-gpt-image-2` -> `custom-image-t8-gpt-image-2`, and `custom-image-nano-banana-3-1-flash` -> `custom-image-t8-nano-banana-3-1-flash`.
- [ ] P4-A draft task input records both `originalModelRecommendation` and `normalizedModelRecommendation`; `imageModel` must be the normalized T8 model to avoid the old APIMart default route.
- [ ] P4-A must not auto-generate all design tasks, batch-generate six directions, download references, use reference URLs as image inputs, create canvas nodes, or write back to the company system.
- [ ] P4-B-1 Hermes runs can create a `HERMES_PROJECT` canvas node; the right-side Agent should show compact feedback while the canvas node becomes the main execution panel.
- [ ] Only `completed` Hermes runs with a project code and usable payload create `HERMES_PROJECT` canvas nodes. Failed, timed out, running, or empty-payload runs must stay in Agent feedback and must not create blank failure nodes.
- [ ] The Hermes Project node is draggable, selectable, deletable, and persisted in workflow JSON with redacted Hermes payload metadata.
- [ ] The Hermes Project node may preview `safeToDisplay=true` reference images in the browser, but MYML Canvas must not server-download, proxy, or import those references in P4-B-1.
- [ ] P4-B-2 auto-generates the current batch only when a fresh completed Hermes run is received; historical messages and refreshed workflow nodes must not resubmit the same run/task.
- [ ] P4-B-2 uses the existing `/api/tasks/image` path, `generation_tasks`, and image worker. Hermes must not call image providers directly.
- [ ] Auto candidate task input records `source='hermes_design_task'`, `capability='hermes-design-auto-candidate'`, `projectCode`, `hermesRunId`, `designTaskId`, `originalModelRecommendation`, and `normalizedModelRecommendation`.
- [ ] Auto candidate `imageModel` is normalized to `custom-image-t8-nano-banana-3-1-flash` by default, or `custom-image-t8-gpt-image-2` for GPT Image recommendations.
- [ ] P4-B-2 must not auto-generate later batches, create image nodes, use references as image-to-image inputs, download references, or write back to the company system.
- [ ] P5-C provides read-only recovery for Hermes candidate tasks through MYML Canvas task APIs. Recovery must use `hermesRunId` / `designTaskId` / `projectCode` metadata from `generation_tasks.input`.
- [ ] P5-C recovery is current-user scoped and must not accept frontend `userId` / `teamId` overrides.
- [ ] Reloading a workflow with a Hermes Project node should call only the recovery API, not `POST /api/tasks/image`.
- [ ] Recovered task rows should return safe fields only: status, model, provider, progress, result URL, safe error text, and Hermes metadata.
- [ ] P5-D Hermes Project nodes should maintain `hermesProject.generatedImages` as the normalized candidate image array.
- [ ] `generatedImages` should include `projectCode`, `hermesRunId`, `designTaskId`, `generationTaskId`, model/provider, prompt metadata, result URL, status, safe error text, reference metadata, and `triggerMode`.
- [ ] P5-D must not add a new database table, query final company submission images, create scoring UI, or rerun failed tasks.
- [ ] P5-E-1 guards complex multi-product bundle projects in the Hermes prompt. Bundle signals include gift sets, multiple `1pc` products, plus-separated product names, multiple sizes, or multiple crafts.
- [ ] For complex bundles, Hermes should output `multiProductBundle=true` and concise `productTasks` before deriving `designTasks`.
- [ ] For complex bundles, `expectedDesignTaskCount` should follow product demand while `maxDesignsPerGeneration=6` remains the single-batch cap, not a fixed required count.
- [ ] Complex bundle output should be concise: short brief/strategy, at most two reference notes, at most two task notes, and no repeated full reference URLs in every task.
- [ ] P5-E-2 compact output mode is enabled for `multiProductBundle=true`: designTasks must keep `prompt`, `negativePrompt`, model recommendation, reference metadata, and can omit full `structuredPromptDescription`.
- [ ] Compact bundle tasks should remain image-generation-ready even when `structuredPromptDescription` is missing or minimal.
- [ ] P5-E-3A Hermes starts complex projects in `lightweight_decomposition` mode: Stage 1 should return project summary, `productTasks`, references, count metadata, `batchPlan`, and `generationReadiness` only.
- [ ] Lightweight Stage 1 must not return `designTasks`, full prompts, `negativePrompt`, or `structuredPromptDescription`.
- [ ] `lightweightMode=true` Hermes Project nodes should not auto-submit image tasks; they should display product decomposition and wait for Stage 2 prompt generation.
- [ ] P5-E-3B Stage 2 should generate one short JSON prompt per `productTask`, serially, for the current batch only.
- [ ] Stage 2 results should populate `productTaskPrompts` and successful `designTasks`; partial failures should become warnings rather than failed Hermes runs.
- [ ] Stage 2 must not download references, visit links, pass `referenceImages`, or create a parallel image-generation system; successful `designTasks` should reuse the existing MYML task worker path.

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
- [ ] If the project contains `design_img`, `design_link`, `oper_img`, `oper_link`, `ref_img`, `ref_link`, Amazon URL, or product URL fields, MYML Canvas ChatPanel shows the references section without downloading external content.
- [ ] If Hermes returns `designTasks[].structuredPromptDescription`, MYML Canvas ChatPanel shows it in a collapsed "Structured Prompt Description" area.
- [ ] If Hermes returns `expectedDesignTaskCount` / `actualDesignTaskCount`, MYML Canvas ChatPanel shows whether returned directions match the project demand.
- [ ] If Hermes returns `maxDesignsPerGeneration` / `batchPlan`, MYML Canvas ChatPanel shows the single-batch limit, current batch label, and remaining directions.
- [ ] If a designer manually clicks one design task's "Generate Draft" button, MYML Canvas creates one `/api/tasks/image` task for that task only.
- [ ] Manual draft task input may include `source='hermes_design_task'`, `projectCode`, `hermesRunId`, `designTaskId`, `referenceIds`, `referenceUsage`, `originalModelRecommendation`, and `normalizedModelRecommendation`; reference URLs remain metadata only.
- [ ] A successful Hermes run also creates a canvas Hermes Project node showing the project summary, references, and simplified design tasks.
- [ ] A fresh successful Hermes run automatically submits current-batch candidate image tasks through `/api/tasks/image`.
- [ ] Stage 2 `designTasks` include `structuredPromptDescription` and `generationPrompt`; auto/manual candidate tasks send the structured `generationPrompt` as the image-model prompt and keep the shorter final prompt as metadata.
- [ ] Stage 2 `designTasks[].taskId` values are unique and product-order based (`concept_01`, `concept_02`, ...); duplicate `concept_01` values would break candidate generation/recovery.
- [ ] Each Hermes Project node design task shows queued/running/completed/failed status, `generationTaskId`, actual draft model, result URL, and safe error text.
- [ ] Auto candidate task input must not contain `referenceImages`; reference IDs and usage are metadata only.
- [ ] After browser refresh or workflow reload, Hermes Project node candidate statuses recover from existing `generation_tasks` without duplicate image generation.
- [ ] After auto generation or recovery, Hermes Project node `generatedImages` should reflect the same candidate statuses/results shown in the design task cards.
- [ ] Saving and reloading the workflow preserves the Hermes Project node without requiring a new Hermes run.
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
- [ ] MYML Canvas must not auto-submit later Hermes batches for image generation.
- [ ] MYML Canvas must not resubmit existing Hermes candidate tasks during workflow recovery.
- [ ] MYML Canvas must not use Hermes reference image URLs as image-to-image inputs in P4-A/P4-B.
- [ ] Real secrets must not appear in Git, frontend bundles, or browser network traffic.
