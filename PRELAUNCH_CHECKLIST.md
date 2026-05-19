# MYML Canvas 上线前手测清单

本文档面向内部上线前自测，用于确认 MYML Canvas 在进入 `test` / 内测环境前的关键链路可用、风险可控。

## 1. 基础环境检查

上线前先确认代码、构建、Docker 配置和数据库连接状态。

```bash
git branch --show-current
git status --short
npm run build
docker compose config
```

通过标准：

- 当前分支应为 `test`。
- `git status --short` 应为空。
- `npm run build` 应通过。
- `docker compose config` 应通过。
- PostgreSQL 可以连接，服务启动时 migration 无错误。

`.env` 中关键变量应存在：

- `DATABASE_URL`
- `APIMART_API_KEY`
- `TASK_WORKER_ENABLED`
- `TASK_WORKER_CONCURRENCY`
- `SYSTEM_MAX_RUNNING_IMAGE_TASKS`
- `USER_MAX_RUNNING_IMAGE_TASKS`
- `TASK_LEASE_MS`
- `TASK_HEARTBEAT_MS`
- `ENABLE_DATALER_PROVIDER`
- `ENABLE_PIKACHU_PROVIDER`
- `VITE_ENABLE_LEGACY_GENERATION_FALLBACK`
- `REQUIRE_TEAM_PROVIDER_CREDENTIALS`

## 2. 推荐启动方式

开发/测试 worker 时推荐两个终端分开启动。

Terminal A 后端：

```bat
set TASK_WORKER_ENABLED=true
set TASK_WORKER_CONCURRENCY=1
set SYSTEM_MAX_RUNNING_IMAGE_TASKS=1
set USER_MAX_RUNNING_IMAGE_TASKS=1
set PROVIDER_MAX_RUNNING_APIMART=1
npm run server
```

Terminal B 前端：

```bat
npx vite --host 0.0.0.0 --port 4246
```

注意：

- 不建议用 `npm run dev` 测 worker，因为它会同时启动 backend + Vite，容易和单独 worker server 冲突。
- `TASK_WORKER_ENABLED=false` 时，任务只会 `queued`，不会被后台 worker 执行，也不会提交付费供应商任务。

## 3. API 检查

需要检查的接口：

```text
GET /api/models/image
POST /api/tasks/image
GET /api/tasks/:id
GET /api/generation-status/:nodeId  legacy
POST /api/generate-image legacy
```

通过标准：

- `/api/models/image` 只返回当前可用模型。
- 默认情况下 Dataler/Pikachu 不应出现在 `providerChain`，除非 env 显式开启。
- 新图片生成默认走 `/api/tasks/image`。
- `/api/generate-image` 仅用于 legacy compatibility，不是新生成入口。
- `/api/tasks/image` 创建成功后应返回 `taskId`、`nodeId`、`status`。
- `/api/tasks/:id` 可以查询当前登录用户自己的 task。

## 4. 前端手测

### 普通 Image 节点生成

通过标准：

- Network 应看到 `/api/tasks/image`。
- 不应默认请求 `/api/generate-image`。
- 节点状态能从 `queued` / `running` / `polling` 进入 `completed` 或 `failed`。
- `completed` 后节点缩略图和查看原图都显示新结果。
- `failed` 后显示明确错误，不应无限 loading。

### Image Editor 生成

通过标准：

- 生成请求走 task API。
- 关闭 modal 后不应继续回写 UI。
- 关闭后不应报错刷屏。
- 再次打开 Image Editor 仍能正常操作。

### 旧 workflow 模型兼容

通过标准：

- 不可用旧模型显示 `Legacy: <modelId>`。
- 不自动改写旧 workflow。
- 点击生成时提示选择可用模型。
- 用户主动选择可用模型后可以正常创建 task。

### Agent 入口

通过标准：

- 普通画布右下角 Agent 入口可见。
- Asset panel 打开后入口不被永久遮挡。
- Storyboard/TikTok modal 打开关闭后入口恢复。
- ChatPanel 原有逻辑不被影响。

## 5. Worker 手测

建议先用低并发配置测试：

```bat
set TASK_WORKER_ENABLED=true
set TASK_WORKER_CONCURRENCY=1
set SYSTEM_MAX_RUNNING_IMAGE_TASKS=1
set USER_MAX_RUNNING_IMAGE_TASKS=1
set PROVIDER_MAX_RUNNING_APIMART=1
npm run server
```

通过标准：

- worker enabled 启动时日志出现 `TaskRunner started`。
- 任务创建后进入 `queued`。
- worker claim 后进入 `running`。
- `locked_by` / `lease_expires_at` / `heartbeat_at` 有值。
- provider submit 后进入 `polling` 或 `completed` / `failed`。
- `completed` / `failed` / `timeout` 后 lock 字段清理。
- APIMart 402 余额不足时，任务应 `failed`，不应卡 `running` / `polling`。
- 并发限制生效：
  - `TASK_WORKER_CONCURRENCY=1`
  - `SYSTEM_MAX_RUNNING_IMAGE_TASKS=1`
  - 多任务时不应同时执行超过 1 个。

建议检查 PostgreSQL：

```sql
SELECT id, username, node_id, provider, model, status, provider_task_id,
       locked_by, lease_expires_at, heartbeat_at, error_type, error_message,
       created_at, updated_at
FROM generation_tasks
ORDER BY created_at DESC
LIMIT 20;
```

## 6. SSRF / 图片 URL 安全检查

通过标准：

- 正常公网图片 URL 应可使用。
- 以下 URL 应被拒绝：
  - `http://127.0.0.1:3001/a.png`
  - `http://localhost:3001/a.png`
  - `http://192.168.1.1/a.png`
  - 非图片 `Content-Type`
  - 超大图片

拒绝时应显示清晰错误，不应导致 Node server 崩溃。

## 7. 供应商 / Provider 检查

APIMart：

- `APIMART_API_KEY` 有效。
- APIMart 余额充足。
- `402 Payment Required` / `Insufficient balance` 是供应商余额问题，不是 worker 或前端错误。
- 余额不足时 task 应进入 `failed`，并保留明确错误信息。

Experimental providers：

- Dataler/Pikachu 默认 experimental disabled。
- 开启时必须显式设置：
  - `ENABLE_DATALER_PROVIDER=true`
  - `ENABLE_PIKACHU_PROVIDER=true`
- 未开启时，它们不应进入正式 `providerChain`。

Team provider credential isolation:

- Set `REQUIRE_TEAM_PROVIDER_CREDENTIALS=true` for strict internal launch testing.
- group1 has active `atlas` credential -> Atlas task should succeed when provider balance/key is valid.
- group2 without active `atlas` credential -> task should fail with `CREDENTIAL_REQUIRED` and must not use group1 key or `.env ATLAS_API_KEY`.
- After inserting group2's own active `atlas` credential -> group2 Atlas task should succeed.
- Check `task_events` and `provider_usage_logs`: `credentialSource` should not be `env` when strict isolation is enabled.
- Atlas Nano Banana 2 is optional experimental and hidden unless both `ENABLE_ATLAS_PROVIDER=true` and `ENABLE_ATLAS_NANO_BANANA_2=true`.
- Atlas Nano Banana 2 uses the same `provider = atlas` team credential; no separate Nano Banana key is needed.
- With `ENABLE_ATLAS_PROVIDER=true`, ordinary Image nodes should show Atlas text-to-image models only, and Image Editor should show Atlas edit/image-to-image models only.
- Optional only: smoke test `Atlas Nano Banana 2 Text-to-Image` on an Image node and `Atlas Nano Banana 2 Edit` in Image Editor when the Atlas account/route is confirmed. This is not a launch Go/No-Go requirement.
- For encrypted provider credentials, configure `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` before storing long-lived team keys.

## 8. 失败排查速查

| 现象 | 可能原因 | 检查点 | 处理方式 |
| --- | --- | --- | --- |
| 任务一直 queued | `TASK_WORKER_ENABLED=false` 或 worker 未启动 | 后端启动日志、`.env` | 设置 `TASK_WORKER_ENABLED=true` 并重启后端 |
| 任务一直 running | worker 崩溃、heartbeat/lease 异常、provider submit 卡住 | `locked_by`、`lease_expires_at`、server log | 查看 worker 日志，确认 lease 是否会过期并被 sweep |
| 任务一直 polling | provider pending、poll 失败重试、任务未超时 | `provider_task_id`、task_events、provider 控制台 | 等待或检查 provider 状态；确认 `IMAGE_TASK_TIMEOUT_MS` |
| APIMart 402 | APIMart 余额不足或额度不足 | task `error_message`、APIMart 控制台 | 充值或更换可用 API key |
| `/api/models/image` 为空 | APIMart 配置缺失，experimental provider 未开启 | `APIMART_BASE_URL`、`APIMART_API_KEY`、provider gate env | 补齐可用 provider 配置 |
| 旧 workflow 模型不可用 | 历史模型已隐藏或 experimental disabled | 节点模型下拉 | 选择新的可用模型后再生成 |
| Agent 入口看不到 | z-index 遮挡、modal 状态残留、入口未挂载 | App/ChatPanel 状态、浏览器元素检查 | 关闭 modal/asset panel，检查 Agent 挂载和 z-index |
| Docker compose 启动失败 | env 缺失、PostgreSQL 未就绪、端口冲突 | `docker compose config`、container logs | 修正 `.env`、释放端口、重启 compose |
| PostgreSQL 连接失败 | `DATABASE_URL` 或 PG* 配置错误，网络不可达 | server log、`psql`/DB health | 修正连接参数、账号、密码、网络和防火墙 |

## 9. 上线前 Go / No-Go

Go 条件：

- build 通过。
- migration 启动无错误。
- task worker smoke 通过。
- 普通 Image 节点 task 生成链路通过。
- Image Editor task 链路通过。
- 余额不足等 provider 错误能明确显示。
- 无任务无限 `running` / `polling`。
- 文档和 env 已同步。

No-Go 条件：

- migration 报错。
- worker 无法启动。
- 任务无法从 `queued` 被 claim。
- failed 任务仍卡住 lock。
- 出现重复 submit provider 的证据。
- `/api/tasks/image` 失败后默认 fallback legacy。
- SSRF 防护失效。
