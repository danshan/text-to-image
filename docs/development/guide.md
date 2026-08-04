---
title: Development Guide
status: accepted
owner: project
last_updated: 2026-08-04
related:
  - ../product/requirements.md
  - ../design/asset-library.md
  - ../design/generation-workflow.md
  - ../design/web-ui.md
  - testing.md
  - ../adr/0008-use-a-typescript-local-web-stack.md
  - ../adr/0010-enable-web-controlled-library-hot-switching.md
  - ../adr/0011-allow-configurable-trusted-lan-binding.md
---

# 开发指南

## Prerequisites

- macOS, MVP 正式支持平台.
- Node.js 24 与随附 npm.
- Git.
- Codex desktop app 或 Codex CLI, 用于 Skill 与 Hook 验证.
- Python 不是应用运行时依赖; 仅部分本地 agent skill 在设计阶段使用.

built-in image generation 不需要 `OPENAI_API_KEY`. MVP 不实现 CLI/API fallback, 不应要求用户配置 API key.

## Repository Layout

目标 monorepo:

```text
apps/
  web/
  server/
  cli/
packages/
  domain/
  schemas/
  archive/
  read-model/
  api-contract/
schemas/
  asset-library/
    v1/
fixtures/
  asset-libraries/
    v1-minimal/
    v1-invalid-*/
.agents/
  skills/
    generate-and-archive/
.codex/
  hooks.json
  hooks/
docs/
  product/
  design/
  development/
  standards/
  adr/
```

npm root `package.json` 定义:

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

仓库提交 `package-lock.json`, 禁止同时引入其他 package manager lockfile.

## Package Responsibilities

### `packages/domain`

保存纯领域类型、状态机、错误分类和不变量. 禁止依赖 Node.js filesystem、Fastify、React 或 SQLite.

### `packages/schemas`

加载和编译 versioned JSON Schema, 提供 record validation 与 TypeScript type generation boundary. `schemas/asset-library/` 中的 JSON 文件是磁盘契约, TypeScript 类型不得成为另一个独立事实来源.

### `packages/archive`

实现 Library resolution、path containment、hash、Draft/Curation atomic update、staging、lock、Commit Marker、validator、recovery 和 migration. 这是唯一允许写 Archive 的 package.

### `packages/read-model`

实现隔离 `node:sqlite` adapter、index projection、FTS query、thumbnail metadata 和 cache rebuild. 禁止产生无法从 Archive 与 Curation 恢复的用户数据.

### `packages/api-contract`

保存 HTTP request/response JSON Schema、stable error codes 和 generated client types. 不包含 server handler 实现.

### `apps/cli`

提供 `assetctl`, 调用 shared packages. machine-readable stdout 与 human stderr 严格分离.

### `apps/server`

使用 Fastify 提供 local HTTP API 和 Vite production assets. Handler 只做 authentication、validation、mapping 与 orchestration.

### `apps/web`

使用 React + TypeScript + Vite. 不导入 `node:fs`, 不解析 Archive path, 不复制 server/domain Schema.

## Dependency Direction

```text
apps/web -> api-contract
apps/server -> api-contract, archive, read-model
apps/cli -> archive, read-model
archive -> domain, schemas
read-model -> domain, schemas
api-contract -> domain, schemas
domain -> none
schemas -> none
```

禁止 package cycle. `archive` 与 `read-model` 通过公开 domain records 交互, 不互相访问内部状态.

## Commands

以下命令是实现必须提供的 root contract:

```bash
npm ci
npm run dev
npm start
npm run daemon
npm run daemon:status
npm run daemon:stop
npm run daemon:logs
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run test:e2e
npm run test:performance
npm run docs:check
npm run fixtures:validate
```

`mise.toml` pin Node.js 24 并提供同名薄封装. npm scripts 继续是实现与 CI 的权威入口:

```bash
mise dev
mise start
mise daemon
mise daemon:status
mise daemon:stop
mise daemon:logs
```

Asset CLI 通过 root script 调用:

```bash
npm run assetctl -- init --library ./library
npm run assetctl -- library select --library /path/to/existing-library
npm run assetctl -- library merge --source /path/to/source-library --dry-run
npm run assetctl -- library merge --source /path/to/source-library
npm run assetctl -- asset inspect --library ./library --source /path/to/reference.jpg --format json
npm run assetctl -- asset import --library ./library --source /path/to/reference.jpg --format json
npm run assetctl -- validate --library ./library
npm run assetctl -- capabilities --format json
npm run assetctl -- index rebuild --library ./library
npm run assetctl -- recover list --library ./library
```

实现稳定并产生 executable package 后, 可以额外提供 `assetctl` binary, 但文档和 Skill 不依赖未安装的全局 binary. 仓库内默认调用始终可工作.

## Local Setup

目标流程:

```bash
git clone <repository-url>
cd text-to-image
npm ci
npm run assetctl -- init --library ./library
npm run assetctl -- validate --library ./library
npm run dev
```

首次启动 Web UI 时:

1. 如果 Library root 或 `library.json` 不存在, Server 不打开或重建 read model, 进入 Library Unavailable mode.
2. Web UI 导航到 Settings, 显示绝对 Library path, 并提供 initialize、select 与 Retry.
3. Library Unavailable mode 不得创建 Library 目录、`.cache`、SQLite index 或 fallback Library.
4. 如果 Library version unsupported, 显示 migration or upgrade diagnostic.
5. 如果 Library healthy, 启动或重建 read model.
6. 默认打开 loopback URL; 只有显式 `--host` 或 `TEXT_TO_IMAGE_HOST` 才绑定其他 interface.

## Configuration

Tracked `text-to-image.config.json`:

```json
{
  "library": "./library"
}
```

Ignored `text-to-image.local.json` 可以保存仓库外路径:

```json
{
  "library": "/Volumes/Media/TextToImageLibrary"
}
```

CLI `--library` 优先级最高. 相对路径按 Git root 解析. 配置 parser 与 path resolver 位于 shared package, CLI、server、Skill helper 与 Hook 不得独立实现 precedence.

Generation Skill 在一次工作流开始时保存 resolver 返回的 canonical Library root, 后续 inspection、import、prepare、capture、commit 与 recovery 命令全部显式使用同一路径. 不得在中途重新解析 Library 或复用前一会话的旧 path.

`asset inspect` 是 Session Image ingress 的只读 preflight. 它不要求 source 位于 Library 内, 不修改 source, 也不创建 Archive transaction. `asset import` 必须在全部 source inspection 成功后执行, 并重新读取 source 以防 inspection 与 import 之间发生变化.

成功执行 CLI `init --library`、`library select --library` 或 Web Library transition 后, shared resolver 把 canonical absolute path 原子写入 Git root 的 `text-to-image.local.json`. 写入失败或 Library validation 失败时保留原配置. Web transition 会在 candidate ready 后排空旧请求、切换 runtime context 并轮换 session token, 无需重启 Server.

Browser-facing listen host 的优先级为 CLI `--host`、`TEXT_TO_IMAGE_HOST`、默认 `127.0.0.1`. Host 必须是 IPv4 或 IPv6 literal; `0.0.0.0` 与 `::` 表示 wildcard. `npm start` 直接配置 Fastify, `npm run dev` 配置 Vite listener 并让 Fastify proxy target 保持 loopback.

```bash
npm start -- --host 192.168.1.10
npm run dev -- --host 0.0.0.0
```

root `.env` 是可选且 ignored 的 Server 启动配置. `.env.example` 只提供可复制的变量清单. `npm run dev`、`npm start` 与 `npm run daemon` 自动加载 `.env`; `assetctl`、build、test、lint 与 docs commands 不加载它. precedence 为 CLI 参数、已存在 shell environment、`.env`、mode default.

production-like Server port 默认由 OS 分配 `0`. development Server 与 Web port 分别默认 `4174` 与 `5173`, 可以通过 `TEXT_TO_IMAGE_PORT` 与 `TEXT_TO_IMAGE_DEV_PORT` 覆盖; Vite listener、proxy target 与 Server allowlist 必须使用相同 resolved values.

```dotenv
TEXT_TO_IMAGE_HOST=127.0.0.1
TEXT_TO_IMAGE_LOG_LEVEL=info
TEXT_TO_IMAGE_PORT=4174
TEXT_TO_IMAGE_DEV_PORT=5173
```

Wildcard bind 在启动时枚举 usable active interfaces 并输出 concrete URLs. Scoped IPv6 link-local address 因缺少 URL zone 不发布. 服务只接受其余 IP literal 对应的 `Host` 与 `Origin`; interface 变化后需要重启. Non-loopback 模式仅用于 trusted LAN, 不提供 TLS、额外身份认证或公网安全承诺.

`npm start` 与 `npm run daemon` 在启动 Server 前运行 Web build. daemon state 位于 `.runtime/daemon/`; `metadata.json` 保存 PID、instance ID、启动时间、URLs 与日志路径, `server.log` 保存当前启动的 structured Server log. 每次新启动截断旧日志.

## Development Workflow

1. 阅读 `AGENTS.md`, `task_plan.md`, `CONTEXT.md` 和相关正式文档.
2. 在代码前把行为与验收标准写入对应 `draft` 文档.
3. 添加或更新 Schema 与 fixtures.
4. 先实现 pure domain 和 failure tests, 再连接 filesystem、SQLite 和 HTTP.
5. 运行最小相关测试, 再运行 root verification.
6. 把实际命令、结果和错误写入 `progress.md`.
7. 行为稳定且交叉检查通过后, 才把文档状态改为 `accepted`.

## Archive Change Rules

- 不得在应用代码、测试 setup 或 migration 之外直接写 managed Archive path.
- 新 archive behavior 先在 `packages/archive` 暴露窄 API, CLI/server 复用.
- Schema 修改必须增加 compatible fixture 与 invalid fixture.
- breaking format change 必须增加新 `vN` Schema 和 copy migration, 不修改旧 Schema 文件.
- migration source 默认只读, destination 使用正常 Commit Marker protocol.
- debug script 也必须调用 shared validator, 不创建隐藏格式.

## Error Model

Public errors 使用 stable code 和 typed details:

```json
{
  "code": "ARCHIVE_HASH_MISMATCH",
  "message": "An archived object does not match its committed digest.",
  "details": {
    "relativePath": "assets/sha256/89/89d3b6935c51f34d36b8f8ab8a884b02a71fba99f980e9f67352e6e2373bbf79.png"
  },
  "recoveryHint": "Run assetctl validate --full and inspect the reported commit."
}
```

禁止根据 human message 分支. Internal cause 可以进入本地 debug log, 但 UI response 和 Generation error record 不保存 secret 或无关绝对路径.

## Logging

- CLI machine mode: stdout 只输出一个 JSON value, logs 写 stderr.
- Prompt、tool result 和 error 等结构化敏感输入通过 stdin 传递, 不进入 argv 或 shell history.
- Server: structured JSON logs, 每个 request 有 correlation ID.
- Daemon: stdout 与 stderr 合并写入 `.runtime/daemon/server.log`; `npm run daemon:logs` 持续 follow, `Ctrl-C` 只退出日志查看.
- Library mutation: log transaction ID、operation、state 和 relative paths, 不记录完整 Prompt text by default.
- Prompt 与图片属于用户数据, debug mode 也不得自动上传或复制到外部服务.
- Hook 输出保持简短, 完整 validator report 写入 Library diagnostics cache 或明确的 workspace test artifact.

## Documentation

- `README.md` 只作为入口和导航.
- `AGENTS.md` 保持当前路径地图、工作规则和验证命令.
- `CONTEXT.md` 只保存领域术语.
- 产品行为进入 `docs/product/requirements.md`.
- 磁盘和流程契约进入 `docs/design/`.
- hard-to-reverse trade-off 进入 `docs/adr/`.
- 实际执行历史进入 `progress.md`.

复制内容前先选择 canonical location, 其他位置使用链接. 任何新增正式文档必须更新 `docs/README.md` 与 `AGENTS.md`.

## Verification

完成实现变更前至少运行:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run docs:check
```

涉及 Archive、Schema、Hook 或 recovery 时额外运行:

```bash
npm run fixtures:validate
npm run test:integration
```

涉及 Web UI、API 或 navigation 时额外运行:

```bash
npm run test:e2e
```

涉及 query、index、thumbnail 或 grid performance 时运行:

```bash
npm run test:performance
```

不得在没有实际输出证据时把命令标记为 pass.

## Troubleshooting

### Daemon is stale

运行 `npm run daemon:status`. `stale` 表示 metadata 存在但 PID 或唯一 process identity 不再匹配. 再次执行 `npm run daemon` 会在启动前清理 stale metadata; `npm run daemon:stop` 对 stopped 或 stale 状态保持幂等. 不根据 metadata 中的 PID 手工发送信号.

### Daemon does not stop

`npm run daemon:stop` 发送 `SIGTERM` 并等待 10 秒. 超时后命令失败并保留 metadata 与日志, 不自动使用 `SIGKILL`. 先检查 `.runtime/daemon/server.log` 与 process identity, 再决定人工恢复.

### Library path not found

Web UI 进入 Settings Library management. 输入 existing Library 的绝对路径后执行 Select, 对 missing 或 empty target 执行 Initialize, 或在原路径恢复完成后执行 Retry. Server 只提供 control plane, 其他 Library API 返回 `LIBRARY_UNAVAILABLE`; Index rebuild 无法恢复已删除的事实来源.

Library transition prepare 可以在旧 Library 继续服务时运行. UI 轮询 processed/total progress; ready 后 commit 会短暂阻断新请求、排空旧请求、持久化选择、切换 context 并轮换 session token. 如果初始化已完成但后续失败, 不删除新目录; 根据 UI 返回路径重试 Select.

### External Library permission denied

确认 canonical path 和 macOS filesystem permission. Codex Skill 必须请求目标目录权限, 不复制到仓库内替代位置.

### Unsupported format

读取 `library.json`, 使用兼容 app version 或显式 copy migration. 禁止手工修改 `formatVersion`.

### Stale lock

运行 recovery inspect. 不根据 age 删除 lock, 先验证 owner PID、host 和 transaction.

### Index corruption

停止 server, 删除 `.cache/`, 运行 index rebuild. 不修改 Archive.

### Hook not running

确认项目已 trusted, 使用 Codex Hook UI 检查 repo-local source 和 script hash. Hook 失效时 writer 仍必须拒绝非法操作.

## Compatibility

- 正式运行时固定 Node.js 24.
- npm dependency versions 由 `package-lock.json` 固定.
- macOS 是 release gate.
- Linux best-effort 问题不阻断 MVP, 但禁止故意引入不必要的 macOS-only shell dependency.
- Windows 不在支持范围, 文档和测试不得暗示支持.
