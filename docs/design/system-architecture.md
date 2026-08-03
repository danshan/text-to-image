---
title: System Architecture
status: accepted
owner: project
last_updated: 2026-08-03
related:
  - ../product/requirements.md
  - asset-library.md
  - generation-workflow.md
  - web-ui.md
  - ../adr/0008-use-a-typescript-local-web-stack.md
---

# 系统架构

## Context

系统由两条独立但共享同一 Asset Library contract 的执行路径组成:

- Codex Generation Workflow 负责生成和不可变归档.
- Local Web Application 负责查询、展示、Draft/Curation 和 recovery orchestration.

两条路径必须复用同一个 Archive package 和 JSON Schema. SQLite、Web API、Skill instructions 与 Hook 都不能成为第二事实来源.

## System Boundary

```mermaid
flowchart LR
    User["User"]
    Browser["Browser Web UI"]
    Server["Fastify Local Service"]
    Codex["Codex"]
    Skill["Repository Generation Skill"]
    Tool["Built-in Image Generation"]
    CLI["assetctl CLI"]
    Archive["Shared Archive Package"]
    ReadModel["SQLite Read Model"]
    Library["Asset Library"]
    CodexHome["Codex Generated Images"]
    Hook["Project Codex Hook"]

    User --> Browser
    User --> Codex
    Browser --> Server
    Server --> Archive
    Server --> ReadModel
    Codex --> Skill
    Skill --> Tool
    Tool --> CodexHome
    Skill --> CLI
    CLI --> Archive
    Archive --> Library
    Archive --> ReadModel
    CodexHome --> Archive
    Hook --> Codex
    Hook --> Archive
```

`CodexHome --> Archive` 表示 capture source, 不是 Archive package 主动扫描 `$CODEX_HOME`.

## Components

| Component                 | Owns                                                                                | Must Not Own                                                       |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Browser Web UI            | UI state、URL state、unsubmitted form edits                                         | filesystem path、Archive write logic、generation invocation        |
| Fastify Local Service     | loopback security、HTTP validation、orchestration                                   | domain duplicate、arbitrary file endpoint、authoritative user data |
| `assetctl`                | human/machine CLI、init、validate、commit、recover、migrate                         | independent Archive implementation                                 |
| Shared Archive Package    | filesystem contract、hash、lock、transaction、Commit Marker、Curation atomic update | HTTP、React、Codex prompt decisions                                |
| Read Model Package        | SQLite projection、FTS、query、thumbnail metadata                                   | non-rebuildable user data                                          |
| Generation Skill          | Prompt orchestration、tool sequence、user confirmation boundary                     | direct Archive file writes、API key fallback in MVP                |
| Built-in Image Generation | raster generation                                                                   | Library identity、commit、Curation                                 |
| Project Hook              | Codex guard 和 read-only validation                                                 | asset mutation、repair、business state                             |
| Asset Library             | authoritative runtime data                                                          | source code、global Codex config                                   |

## Runtime Topology

### Web Runtime

一个 local service process 打开一个 canonical Library root:

```text
Browser -> 127.0.0.1:<ephemeral-port> -> Fastify -> Shared Packages -> Library
```

生产模式由 Fastify 托管 Vite static build. 开发模式可以由 Vite dev server 代理 `/api/v1`, 但最终 Host、Origin 与 token security behavior 必须在 production-like integration test 中验证.

服务启动顺序:

1. 解析 Library path.
2. 检查 `library.json` 是否存在.
3. 缺少 manifest 时跳过 read model, 进入初始化诊断模式并绑定 loopback.
4. manifest 存在时验证 format 与 permissions.
5. 获取 read-only health snapshot.
6. 打开或重建 SQLite read model.
7. 生成 session token 并绑定 loopback.
8. 输出本地 URL.

初始化诊断模式不会创建 Library root、`.cache/` 或 SQLite index. Bootstrap 返回 canonical path 和 shell-safe exact init command, Browser 显示后等待用户显式初始化并重启 local service. 其他 Library API 返回 `503 LIBRARY_INITIALIZATION_REQUIRED`. 如果 Library invalid, server 可以以 read-only diagnostics mode 启动, 但不得 fallback 到另一个空 Library.

### Generation Runtime

```mermaid
sequenceDiagram
    participant U as User
    participant C as Codex
    participant S as Generation Skill
    participant A as assetctl
    participant I as Built-in Image Tool
    participant L as Asset Library

    U->>C: Invoke repository skill
    C->>S: Load workflow
    S->>A: Prepare transaction
    A->>L: Write staged inputs
    S->>A: Mark invocation started
    S->>I: Generate with effective prompt and references
    I-->>S: Output path
    S->>A: Capture and finalize
    A->>L: Install immutable objects
    A->>L: Publish commit marker
    A-->>S: Committed IDs and paths
    S-->>U: Report provenance and warnings
```

Built-in tool call 不经过 local Web service. Web service 通过 Commit Marker index update 观察新结果.

## Data Ownership

| Data                | Authoritative Owner         |        Mutable |          Indexed |
| ------------------- | --------------------------- | -------------: | ---------------: |
| `library.json`      | Asset Library control plane | migration only |              yes |
| Creation identity   | Archive                     |             no |              yes |
| Prompt Draft        | Creation working area       |            yes |              yes |
| Prompt Revision     | Archive                     |             no |              yes |
| Generation          | Archive                     |             no |              yes |
| Image Asset payload | Archive                     |             no |              yes |
| Commit Marker       | Archive                     |             no |              yes |
| Curation            | Curation tree               |            yes |              yes |
| Staging transaction | Transaction area            |            yes | diagnostics only |
| SQLite rows         | Read model                  |    rebuildable |             self |
| Thumbnail           | Cache                       |    rebuildable |               no |
| Browser theme       | Browser local preference    |            yes |               no |

## Write Paths

允许的写入入口:

```text
Web UI -> Fastify -> Shared Archive Package -> Draft/Curation/Recovery
Codex Skill -> assetctl -> Shared Archive Package -> Archive Transaction
Human CLI -> assetctl -> Shared Archive Package -> Init/Validate/Recovery/Migration
```

禁止的入口:

```text
Web UI -> filesystem
Fastify handler -> managed path
Codex -> apply_patch Archive
Hook -> mutate Library
SQLite -> reconstruct Archive
```

## Read Paths

普通查询优先使用 SQLite read model. 权威 detail response 必须包含或核对 Archive source version. Diagnostics、validation 与 rebuild 直接遍历 Commit Marker 和 records.

Read model lag 允许发生, 但必须可观察. API health 返回 last indexed Marker、latest Archive Marker 和 lag count. UI 在 lag 时显示 indexing, 不把暂时未出现的 committed result视为失败.

## Source Control and Runtime Data

Git 保存:

- TypeScript source.
- Codex Skill 与 project Hook.
- JSON Schema、fixtures 和 migration code.
- README、AGENTS、正式文档和 ADR.

Git 不保存:

- 用户 Asset Library.
- SQLite、thumbnail 和 test runtime artifacts.
- 本机 Library absolute path.
- `$CODEX_HOME/generated_images/...` output.

默认 `./library/` 被 root `.gitignore` 精确忽略. External Library 由 ignored local config 或 CLI 参数选择.

## Security Boundaries

### Browser to Local Service

- loopback bind.
- exact Host/Origin.
- per-process session token.
- no wildcard CORS.
- CSP and content endpoint by hash.

### Local Service to Filesystem

- canonical root containment.
- no internal symlink.
- typed relative paths only.
- no arbitrary file endpoint.
- Archive writes only through shared package.

### Codex to Library

- AGENTS and Skill instructions.
- project-local trusted Hook.
- sandbox approval for external Library.
- writer and validator remain authoritative if Hook is bypassed.

### User Data

- Prompt 和图片默认不进入 logs.
- built-in generation 是唯一 MVP external processing path.
- app 不上传 Library、telemetry 或 thumbnails.

## Failure Domains

| Failure                          | Containment                           | Recovery                                   |
| -------------------------------- | ------------------------------------- | ------------------------------------------ |
| Image tool failure               | staging transaction                   | commit known failure Generation            |
| Codex interruption               | staging transaction                   | explicit interrupted recovery              |
| Archive commit crash             | uncommitted objects + Marker boundary | idempotent commit or quarantine            |
| SQLite corruption                | `.cache/`                             | delete and rebuild                         |
| Thumbnail corruption             | thumbnail cache                       | regenerate by hash/version                 |
| Curation conflict                | one sidecar                           | reload and optimistic retry                |
| Archive corruption               | read-only whole Library               | validate, diagnose, explicit repair design |
| External Library permission loss | current process                       | read-only/unavailable, no fallback Library |
| Hook disabled                    | Codex guard only                      | writer still rejects invalid operations    |

## Compatibility

Compatibility dimensions独立版本化:

- Asset Library `formatVersion`.
- Per-record `schemaVersion`.
- HTTP API major version.
- CLI capabilities schema.
- Generation Skill supported format range.
- read model Schema, freely rebuildable.
- thumbnail transform version, freely rebuildable.

App 启动和 Skill prepare 都执行 capabilities handshake. Unsupported future version 必须 fail closed.

## Validation

- dependency rule lint 防止 apps 绕过 shared packages.
- API contract tests 确认 browser/server Schema 一致.
- end-to-end provenance test 跨 Browser、Server、Archive、Read Model 与 CLI.
- failure injection 确认每个 failure domain 不污染其他层.
- security suite 确认 local service 和 external Library path containment.
- docs checker 确认本总览 links 到 canonical detail, 不复制漂移的 Schema 定义.
