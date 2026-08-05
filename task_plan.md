# 任务计划: Text to Image

## Goal

完成本地文件夹驱动的图片生成与图库系统的领域设计、正式文档、实现、测试和可维护的 Codex 工作流.

## Current Phase

Phase 17

## Phases

### Phase 1: Requirements and Domain Design

- [x] 完成逐项设计访谈并达到 shared understanding.
- [x] 建立 glossary 与 ADR 机制.
- [x] 建立文档治理与持续计划文件.
- [x] 形成完整产品需求与验收标准草稿.
- **Status:** completed

### Phase 2: Architecture and Technical Plan

- [x] 完成 Asset Library Schema 与写入协议草稿.
- [x] 完成 Generation Workflow 与项目级 Hook 设计草稿.
- [x] 完成 Web UI 信息架构与技术选型草稿.
- [x] 明确测试矩阵与迁移策略草稿.
- **Status:** completed

### Phase 3: Implementation

- [x] 实现共享领域库与写入器.
- [x] 实现仓库级 Skill 与项目级 Hook.
- [x] 实现 Web UI 与 SQLite read model.
- [x] 同步更新正式文档.
- **Status:** completed

### Phase 4: Testing and Verification

- [x] 执行单元、集成、故障恢复与 UI 测试.
- [x] 验证 Archive 完整性与 cache 可重建性.
- [x] 执行完整规模 index rebuild 与 warm query benchmark.
- [x] 记录全部实际结果并修复问题.
- **Status:** completed

### Phase 5: Delivery

- [x] 检查文档、代码、Schema 与测试一致性.
- [x] 完成根 README 与 AGENTS 导航审查.
- [x] 生成 Skill eval review viewer.
- [x] 提交最终交付说明与已知限制.
- **Status:** completed

### Phase 6: First-run Library Initialization

- [x] 禁止缺少 manifest 的 read model 创建 Library 或 cache.
- [x] 实现 Server initialization-required diagnostics mode.
- [x] 在 Web bootstrap screen 显示 canonical path 与 exact init command.
- [x] 补充 API、Read Model、Web 回归测试并同步正式文档.
- **Status:** completed

### Phase 7: Persistent Library Selection and Merge

- [x] 持久化 `assetctl init --library` 的 canonical Library path.
- [x] 实现既有 Library 的无写入选择命令.
- [x] 实现 current Library 作为 destination 的原子 Library Merge 与 dry-run.
- [x] 修复 Read Model 对新 Commit Marker 的启动时追平.
- [x] 补充 Schema、集成测试、E2E 与正式文档.
- **Status:** completed

### Phase 8: Generation Issues and Safety Rejection UX

- [x] 通过逐项访谈确认 Generation Issue、Safety Rejection、生命周期与 Prompt guidance 边界.
- [x] 将产品、Asset Library、Generation Workflow、Web UI 与测试文档切回 `draft` 并形成实施契约.
- [x] 扩展 format `1` Generation error Schema、domain types、writer request 与 bounded moderation contract.
- [x] 更新 Generation Skill, 归档 stable safety code 与 bounded moderation metadata.
- [x] 在 read model 与 API 中派生每个 active Creation 的最新 Generation Issue.
- [x] 实现 Gallery Issues region、Creation Timeline inline issue、Generation Detail warning panel 与 Draft recovery path.
- [x] 完成 Compact Editorial Workspace desktop UI audit: fixed 200 px sidebar, compact headers, readable type scale, dark sidebar tokens, detail two-column layout and desktop viewport matrix.
- [x] 执行 Schema、Archive、read model、API、Web、integration、fixtures 与 documentation verification; Chromium/WebKit E2E 通过, 并加入 `1024x768` Gallery 与 `1440x900` Creation visual snapshots.
- [x] 完成代码、测试和交叉检查后把正式文档恢复为 `accepted`.
- **Status:** completed

#### Implementation Order

1. Contract first: 更新 `packages/domain/src/index.ts`、`schemas/asset-library/v1/generation.schema.json` 与 `packages/archive/src/generation.ts` 的 fail request validation.
2. Workflow mapping: 更新 `.agents/skills/generate-and-archive/` 的 CLI contract、failure classification 和 eval cases, 只保存 stable code 与 bounded moderation metadata.
3. Projection and API: 在 `packages/read-model/src/` 派生 latest-per-active-Creation issues, 扩展 `packages/api-contract/src/`、`apps/server/src/` 和 integration tests, 提供 bounded `GET /api/v1/generation-issues`.
4. Web UI: 更新 shared shell/styles 与 `apps/web/src/pages/gallery-page.tsx`, `creation-detail-page.tsx` 和 `generation-detail-page.tsx`, 增加独立 Issues region、typed warning panel、Review Prompt navigation、desktop viewport rules 和 tests.
5. Verification and reset: 执行 Schema、Archive、read model、API、Web、integration、fixtures 与 docs checks; 记录 browser E2E 的环境阻断后恢复文档 `accepted`.

### Phase 9: Runtime Library Management

- [x] 确认 Library Unavailable、absolute path input、hot switch、failure 与 session isolation contract.
- [x] 新增 ADR 0010, 并把受影响正式文档切回 `draft`.
- [x] 实现 request-boundary unavailable detection、path-based control plane 与 single async transition.
- [x] 实现 candidate prebuild、request drain、atomic persistence、context swap 与 session token rotation.
- [x] 修复 Stop Hook 对 `ARCHIVE_NOT_INITIALIZED` 的错误分类和无效 recovery hint.
- [x] 完成 focused、root contract 与 documentation verification, 记录结果并恢复本阶段独立文档状态.
- **Status:** completed

### Phase 10: Configurable Listen Address

- [x] 通过逐项访谈确认 CLI host 参数、wildcard、trusted LAN 与开发模式语义.
- [x] 将受影响正式文档切回 `draft`, 并记录 trusted LAN contract.
- [x] 实现 `--host` parsing、配置优先级、Browser-facing development listener 与 wildcard interface allowlist.
- [x] 补充 config、security、startup 与 development launcher tests.
- [x] 执行 focused、root 与 documentation verification, 记录结果并恢复文档为 `accepted`.
- **Status:** completed

### Phase 11: Session Image Reference Ingress

- [x] 通过 `$grill-with-docs` 确认 Session Image、自动导入、Reference roles 与部分失败边界.
- [x] 在 `CONTEXT.md` 定义 Session Image, 并把受影响正式文档切回 `draft`.
- [x] 实现只读 Image source inspection 与稳定错误分类.
- [x] 更新 Generation Skill, 自动导入已物化 Session Image 并固定 Library root.
- [x] 补充 Archive、CLI、Skill contract 与文档测试.
- [x] 执行 root verification, 更新执行记录并恢复正式文档为 `accepted`.
- **Status:** completed

#### Confirmed Contract

1. Session Image 只有在原始 bytes 已物化并导入当前 Asset Library 后, 才能成为 Reference Image.
2. 明确生成请求授权独立 `import_asset` 事务; 后续生成失败不回滚已提交 Image Asset.
3. Reference roles 仅从用户明确措辞解析; 语义不足时在 prepare 前询问, 不设置默认 role.
4. 多张 Session Image 先全部预检; 任一失败时不创建 Generation transaction, 不调用图片工具, 不静默丢弃输入.
5. opaque session handle 在宿主没有提供原始 bytes 或路径时 fail closed, 并报告 `SESSION_IMAGE_NOT_MATERIALIZED`.

### Phase 12: End-user Documentation

- [x] 审计现有文档, 确认缺少面向普通用户的完整操作手册.
- [x] 编写图片生成、参考图导入、Prompt 迭代、结果整理和失败恢复说明.
- [x] 使用 ImageGen 生成无文字 PNG 教学示意图.
- [x] 使用不含私人内容的临时演示 Library 制作真实 Web UI 截图.
- [x] 更新 README、AGENTS、文档规范、文档索引和执行记录.
- [x] 完成文档、格式、链接与 Git 差异验证.
- **Status:** completed

### Phase 13: Generation Workflow Latency and Progress

- [x] 复盘真实 Generation task 的 `16m38s` 用户端到端耗时, 区分已观测工具时间与未观测 Codex orchestration.
- [x] 通过 `$grill-with-docs` 确认 SLO、计时、stdin framing、Preflight、Prompt hash gate、增量 index、CLI 分层、progress、telemetry 与测试边界.
- [x] 将产品需求、Generation Workflow 与测试策略切回 `draft`, 新增 ADR 0012 并形成实施契约.
- [x] 实现 bounded `LF-or-EOF` stdin reader 与 byte-identical Prompt hash gate.
- [x] 实现只读 `generation preflight`、capture staged path 与高层 happy-path finalize command.
- [x] 实现增量 Commit Marker catch-up 与 index degraded recovery contract.
- [x] 更新 Generation Skill 的单一 Prompt、真实阶段进度和双层 SLO reporting.
- [x] 补充 unit、integration、fault injection、Skill eval 与 release-scale performance tests.
- [x] 执行 focused 与 root verification, 记录实测结果并恢复正式文档为 `accepted`.
- **Status:** completed

#### Confirmed Contract

1. warm user end-to-end latency 目标为图片模型耗时加不超过 30 秒非模型开销; pre-tool p95 不超过 20 秒, post-tool p95 不超过 10 秒.
2. Codex UI 与仓库 span 使用同一个 `workflowRunId`, 但仓库时间不得替代用户端到端时间.
3. stdin request 以首个 `LF` 或 EOF 结束, 上限 1 MiB, Prompt 不进入 argv、process list、shell history 或临时脚本.
4. Prepare Prompt 与 tool argument 必须 UTF-8 byte-identical, 并在 invocation marker 前通过 SHA-256 gate.
5. `generation preflight` 保持只读; happy path 使用高层 command, recovery 继续使用现有低层状态机 primitives.
6. 正常路径增量投影 Commit Marker; full rebuild 只用于 cache 缺失、Schema 变化、corruption 或显式 recovery.
7. progress 只显示真实阶段和累计耗时, 无 provider event 时不生成百分比或 ETA.
8. Workflow telemetry 不进入 Archive; fake generator 承担 deterministic CI SLO gate, 真实模型只记录 observation.

#### Implementation Order

1. Contract first: stdin framing、Prompt hash、Preflight response、capture response、index catch-up result 与 typed error contract.
2. Archive and read model: 复用现有 transaction primitives, 增加增量 Marker projection 和 atomic `last_indexed_marker`.
3. CLI orchestration: 增加只读 Preflight 与高层 post-tool happy path, 保留低层 recovery commands.
4. Skill: 单次构造 effective Prompt, transaction-scoped storage, hash gate、真实 progress 与双层 SLO report.
5. Verification: fake generator performance gate、fault injection、release-scale dataset、real model observation 与 docs cross-check.

### Phase 14: End-to-end Generation Workflow Optimization

- [x] 复盘真实 Generation task 的 `12m17s` Codex UI 端到端耗时, 定位 PTY canonical input、过度前置阅读、串行工具轮次与不完整 telemetry.
- [x] 通过 `$grill-with-docs` 确认端到端责任边界、Workspace Ready、TTY ownership、双源计时、最小确定输入、commit 后检查、高层 command 与验证预算.
- [x] 将产品需求、Generation Workflow 与测试策略切回 `draft`, 同步 glossary 与实施契约.
- [x] 实现 CLI-owned TTY raw mode 与状态恢复.
- [x] 实现只读 `preflight`、高层 `begin`、built-in `image_gen`、高层 `finalize` 的 happy path.
- [x] 修正 `workflowRunId` 双源关联、真实 repository spans 与 `unknown` UI SLO 语义.
- [x] 更新 Generation Skill 的 Workspace Ready fast path 与 commit 后检查规则.
- [x] 补充 long Prompt TTY、high-level command、telemetry、performance 与 Skill eval 测试.
- [x] 执行 deterministic verification 与一次真实 Workspace Ready Generation observation.
- [x] 记录实测结果, 完成交叉检查并恢复正式文档为 `accepted`.
- **Status:** completed
- **Completed:** 2026-08-04

#### Verification Summary

- deterministic fake workflow 运行 12 次, non-model overhead p95 为 `256.26ms`.
- 真实 TTY smoke 一次接收 `5,135` bytes, 输入未回显, raw mode 自动恢复.
- 真实 Workspace Ready Generation 从 Preflight 到 Finalize return 为 `226.28s`: pre-tool `40.62s`, provider `152.86s`, post-tool `32.80s`; Archive telemetry 到 index ready 为 `225.54s`.
- 相比原始 Codex UI `12m17s` observation, 相同 Creation 与 subject Reference 的 repository-observed workflow 缩短约 `8m31s`. Codex UI authoritative duration 未暴露, user-facing SLO 保持 `unknown`.
- 单次真实 observation 的 pre-tool 与 post-tool 分别未满足 `20s` 与 `10s` 目标. 该样本包含 smoke harness 的一次本地计时错误和 Finalize 前 commentary; Skill 已收紧为 tool 返回本地 Output 后下一动作立即启动 Finalize. 单样本不用于宣称 provider 或 workflow p95.

#### Confirmed Contract

1. Generation Workflow 的正式性能边界从用户明确请求开始, 到 Archive committed、index ready 且最终回复完成后结束.
2. Workspace Ready 不依赖当前 Codex task 的历史; 第一次明确 Generation 也必须满足图片模型耗时加不超过 30 秒可控非模型开销.
3. CLI 的共享 stdin reader 在 TTY 下自治管理 raw mode 并恢复原状态; Skill 不依赖 `stty` 或额外 Wrapper.
4. 普通 Generation 只加载 Skill contracts 与一次 Preflight snapshot; 完整项目文档只用于设计、实现或异常恢复.
5. happy path 收敛为 `preflight -> begin -> image_gen -> finalize`; 高层 commands 复用现有 Archive primitives, 低层 commands 保留用于 recovery 与 fault injection.
6. built-in result 已在会话中可见时, 视觉检查不阻塞 commit; 必要的 Archive 复查在 commit 后执行.
7. 同一 `workflowRunId` 关联 Codex UI 权威端到端耗时与 repository spans. 未观测 UI duration 保持 `unknown`, 不从 repository timings 推测.
8. deterministic fake workflow 至少运行 12 次; 完成后执行一次真实 Workspace Ready Generation observation, 不以单个真实样本宣称 provider p95.

### Phase 15: Prompt, Generation, and Reference Provenance Navigation

- [x] 通过 `$grill-with-docs` 确认 Prompt Revision、Generation 与 Reference Image 的双向交互语义.
- [x] 将受影响的产品需求、Web UI、用户手册与测试策略切回 `draft`.
- [x] 在 Creation 页面实现 Prompt History 与 Generation Timeline 的 URL-backed 双区同步联动.
- [x] 按 Generation usage 展示 Reference Image, 并补全 Generation、Image 与 Prompt Revision 的精确反向链接.
- [x] 保持 Focus 与 Prompt Compare 为独立状态, 补充 keyboard、deep-link 与多次 Generation 覆盖.
- [x] 执行 focused 与 root verification, 更新研发记录并恢复正式文档为 `accepted`.
- **Status:** completed
- **Completed:** 2026-08-04

#### Confirmed Contract

1. Reference Image 属于 Generation usage, 不直接归属于 Prompt Revision.
2. Prompt History 与 Generation Timeline 保持两个视图; Focus Revision 时保留完整 Timeline, 高亮全部关联 Generation, 并定位到最新关联项.
3. Focused Revision 按 Generation 分组展开 Reference Image、roles 与 guidance; Timeline 显示 Prompt Revision link 与 Reference Image thumbnails.
4. Creation deep link 使用 URL 保存 Focus Revision 与 Generation, 支持刷新、复制、前进后退和详情页精确返回.
5. 无深链时默认 Focus 最新 Generation 及其 Prompt Revision; 没有 Generation 时 Focus 最新 Revision.
6. Prompt Compare 与 provenance Focus 使用独立状态和控件.
7. Image Detail 按 Generation usage 同时显示 Generation 与 Prompt Revision links; 不新增独立 Prompt Revision route.

#### Verification Summary

- root unit、Hook/Skill 与 Web tests 分别通过 `11`、`31` 与 `24` tests; read model integration 共 `46` tests 通过.
- Chromium 与 WebKit provenance navigation、Prompt Compare 和 desktop visual snapshots 通过; WebKit 保留 1 个既有 mutation skip.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check` 与 `npm run docs:check` 通过.
- 未修改 Archive Schema、Generation writer 或持久化格式; `promptRevisionId` 只从 rebuildable read model join 派生.

### Phase 16: Local Runtime Entry Points

- [x] 通过 `$grill-with-docs` 确认 daemon、`.env` 与 mise task 的完整契约.
- [x] 将用户手册、产品需求、系统架构、开发指南与测试策略切回 `draft`.
- [x] 实现可选 `.env` 加载、可配置 development ports 与 Web build startup gate.
- [x] 增加 `mise.toml` 和 npm-backed `dev`、`start`、daemon lifecycle tasks.
- [x] 实现单 checkout daemon readiness、metadata、日志、status 与安全停止.
- [x] 补充 unit、real process integration、mise task 与文档验证.
- [x] 更新研发记录并在交叉检查后恢复正式文档为 `accepted`.
- **Status:** completed

#### Confirmed Contract

1. `mise.toml` pin Node.js 24; mise task 仅封装 root npm scripts, npm 继续作为实现与 CI 权威入口.
2. `.env` 可选且不进入 Git, 只由 Server 启动命令加载; 优先级为 CLI、shell environment、`.env`、mode default.
3. development Server 与 Web 默认端口分别为 `4174` 与 `5173`, shell 或 `.env` 可以覆盖, Vite、proxy 与 Server allowlist 必须共享 resolved ports.
4. foreground `start` 与 daemon 启动前只构建 Web UI; build 失败不得启动 Server.
5. 每个 Git checkout 只允许一个 daemon; 状态位于 `.runtime/daemon/`, 不进入 Asset Library 或 Git.
6. daemon 通过内部 IPC 等待真实 listener 与 Library Runtime ready, 保留动态端口, 60 秒未 ready 则以 `SIGTERM` 停止并失败.
7. `daemon:stop` 只发送 `SIGTERM` 并等待 10 秒; 超时后不使用 `SIGKILL`, 保留 metadata 与日志.
8. status 区分 `running`、`stopped` 与 `stale`; logs 默认 follow; 每次启动截断旧日志, 不保留历史 rotation.
9. daemon 正式支持 macOS 与 Linux, 不提供 Windows、登录自启、崩溃重启、named instances 或 JSON status.

### Phase 17: Creation and Image Asset Purge

- [x] 通过 `$grill-with-docs` 确认 Creation Purge、Image Asset Purge、引用安全、maintenance、恢复和 UI 边界.
- [x] 将受影响正式文档切回 `draft`, 新增 ADR 并形成完整实施契约.
- [x] 实现单目标 Purge Plan、verified replacement、maintenance transition 与关键 crash-window roll-forward.
- [x] 实现 Archive、CLI、API 与 Web Detail Danger Zone 的 Creation 和 Image Asset Purge vertical slice.
- [x] 修复 aborted request lease 泄漏, 并为 maintenance drain 增加 30 秒 fail-safe deadline.
- [ ] 补充 unit、integration、fault injection、Web 与文档测试.
- [ ] 执行 browser E2E 与最终 acceptance verification, 更新执行记录并恢复正式文档为 `accepted`.
- **Status:** in_progress

#### Confirmed Contract

1. Creation Purge 不可恢复地物理清除 Creation 身份、Draft、Curation、Prompt Revision、Generation 和关系, 但不级联删除 Image Asset.
2. Image Asset Purge 是独立操作, 仅允许删除没有任何存续 Generation Output 或 Reference 关系的资产; `inbox/` 与 Library 外部原文件不自动删除.
3. References 只展示存续关系; Creation Purge 提交并同步 read model 后, 对应 Generation Issue 与 Reference 关系消失.
4. Purge 完成后不保留目标 tombstone、audit record 或 read-model/cache 残留; 后续 Library Merge 可以显式重新引入相同内容.
5. Purge 使用独占 Library Maintenance 和 verified replacement; cutover 前失败保持原 Library, cutover 后只能 roll forward.
6. recovery evidence 默认阻塞 Purge; 用户可以在 dry-run 列出 exact transaction 后二次确认 Recovery Evidence Abandonment.
7. Purge 强制使用 snapshot-bound `prepare -> execute`, `planDigest`、精确确认短语和 stale-plan rejection.
8. 第一版只支持单目标. Web 入口仅位于 Creation Detail 与 Image Detail 的 Danger Zone, CLI 与 Web 共用 shared writer contract.

#### Implementation Order

1. Contract first: 增加独立 Purge Plan / journal Schema、domain types、typed errors 与 maintenance state contract; 完成态 Library 保持 format `1`.
2. Archive protocol: 构建 candidate replacement、重写 surviving Commit Marker、full validation、cutover journal、retired-root cleanup 与 startup roll-forward.
3. Runtime and adapters: 排空 Library requests, 阻断 Generation, 持久化 maintenance progress, rebuild read model 并只在 index ready 后恢复服务.
4. CLI and API: 实现单目标 prepare/execute/status, exact confirmation、stale-plan detection、blocking references 与 Recovery Evidence Abandonment.
5. Web UI: 在 Creation Detail 与 Image Detail 增加 Danger Zone、impact review、typed confirmation、maintenance progress 与完成后导航.
6. Verification: 覆盖引用图、并发、磁盘空间、权限、failpoints、restart roll-forward、无残留检查、Merge reintroduction 与 desktop E2E.

### Phase 18: Cross-process Read Model Coordination

- [x] Diagnose concurrent `catch-up` and `rebuild` replacement as the cause of transient SQLite malformed errors.
- [x] Confirm bounded waiting, coordinator ownership, rebuild classification, typed degradation, and multi-process verification contract.
- [x] Implement one cross-process Index Writer coordinator for incremental catch-up and full rebuild.
- [x] Add stable index degradation codes across CLI, Server health, and Web diagnostics.
- [x] Add deterministic multi-process, crash-release, timeout, corruption, and Archive fail-closed tests.
- [x] Run focused and root verification, update execution records, and cross-check formal documentation.
- **Status:** completed

#### Confirmed Contract

1. Incremental catch-up and full rebuild share one cross-process Index Writer coordinator at `.cache/index-writer.sqlite`.
2. Contenders wait for at most 8 seconds. After acquisition they reopen the read model and rescan Archive Markers and the current cursor.
3. Timeout degrades only the read model. A committed Generation remains successful, and contention never starts a concurrent rebuild.
4. Missing index, incompatible read-model Schema, and confirmed SQLite corruption may trigger rebuild; Archive validation failures remain fail closed.
5. The CLI returns stable index degradation codes, Server health reports `degraded`, and Web diagnostics do not expose internal paths or raw stacks.
6. Integration coverage uses real child processes and deterministic barriers, including owner crash release and a shortened test-only timeout.
7. Replaceable read models use `DELETE` journal mode so atomic replacement never combines a new main file with an old WAL/SHM generation.
8. Cross-process degradation state is a disposable `.cache/index-degradation.json`; successful catch-up or rebuild clears it, and Server health only exposes bounded diagnostics.

## Remaining Design Questions

无. Phase 17 核心 vertical slice 已实现, 当前剩余异步 maintenance progress、完整 phase failpoint、安全故障矩阵与 browser E2E.

## Errors Encountered

| Error                                                                           | Attempt | Resolution                                                         |
| ------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------ |
| Codex manual fetch failed because DNS was unavailable in the sandbox            |       1 | Re-ran the official helper with approved network access            |
| Existing project Markdown used English prose against repository language rules  |       1 | Rewrote glossary and ADR prose in Simplified Chinese               |
| Documentation patch had malformed section markers                               |       1 | Split the change into smaller valid patch sections                 |
| Cross-file documentation patch used the wrong hunk context                      |       1 | Split updates by target file and validated each context            |
| `tsx` IPC socket was denied by the Codex filesystem sandbox                     |       1 | Re-ran CLI and E2E verification with scoped approval               |
| Initial dependency audit reported vulnerable static/Sharp versions              |       1 | Upgraded both packages and regenerated the lockfile                |
| SPA navigation was incorrectly protected before token bootstrap                 |       1 | Limited token enforcement to protected API routes                  |
| Full-scale FTS query repeatedly evaluated three subqueries                      |       1 | Materialized one FTS hit set and reused it                         |
| WebKit omitted links from the default macOS Tab focus ring                      |       1 | Split Tab-order and activation checks by browser                   |
| Server build emitted artifacts into referenced package source directories       |       1 | Removed generated files and corrected project references           |
| Documentation check traversed dependency and evaluation workspaces              |       1 | Excluded generated and dependency directories                      |
| Web test used an unavailable `jest-dom` matcher                                 |       1 | Replaced it with the repository's existing Chai assertions         |
| Playwright server could not create a `tsx` IPC socket in the sandbox            |       1 | Re-ran the E2E suite with scoped approval                          |
| Archive adapter factory read the manifest before initialization mode            |       1 | Removed the eager read and covered the real factory path           |
| npm workspace `cwd` was treated as the repository Git root                      |       1 | Resolve the nearest Git root before Library configuration          |
| Playwright browser processes aborted inside the filesystem sandbox              |       1 | Re-ran the installed browsers with scoped outside-sandbox access   |
| Standalone Server typecheck read stale referenced package declarations          |       1 | Use root build/typecheck contract after fixing the new test type   |
| Initial host smoke failed because sandbox denied the `tsx` IPC socket           |       1 | Re-ran the isolated temp-root smoke outside the sandbox            |
| Purge documentation cross-file patch used a non-existent testing context        |       1 | Split updates by target file and inspect exact section text        |
| Purge documentation format check reported three unformatted Markdown files      |       1 | Run repository Prettier on the exact reported files                |
| Second format check reported the expanded task plan error table                 |       1 | Format `task_plan.md` after all error rows were recorded           |
| Final verification record changed progress table alignment                      |       1 | Format `progress.md` after recording final validation counts       |
| Final format-error logging patch used pre-Prettier table spacing                |       1 | Re-read exact table rows and patch the formatted context           |
| Format check found the listener test changed after its earlier Prettier pass    |       1 | Re-format the exact test file before final verification            |
| Initial source inspection read referenced a non-existent `errors.ts` file       |       1 | Located `ArchiveError` in `packages/domain/src/index.ts`           |
| Standalone Archive and CLI typecheck read stale referenced declarations         |       1 | Use root build before the root typecheck contract                  |
| Default Vitest config excluded the Archive integration test                     |       1 | Use the repository `test:integration` runner                       |
| New Image source inspection test used an incorrect fixture SHA-256              |       1 | Replaced it with the digest reported for the tracked fixture       |
| Combined documentation patch used stale Testing Strategy wording                |       1 | Split the patch and matched the current Chinese test sections      |
| Lint rejected an `any` matcher nested inside an unknown CLI payload assertion   |       1 | Narrowed the payload explicitly and asserted command membership    |
| Direct execution of CLI dist could not resolve workspace source `.js` imports   |       1 | Use the documented root `npm run assetctl -- ...` contract         |
| Fixture validation could not create the `tsx` IPC socket in the sandbox         |       1 | Re-run the root fixture contract outside the sandbox               |
| Documentation demo CLI could not create the `tsx` IPC socket in the sandbox     |       1 | Re-ran scoped temporary Library commands outside the sandbox       |
| Development Server port `4174` was already occupied during screenshot setup     |       1 | Used an isolated production-like Server on loopback port `4180`    |
| Full-page screenshots repeated the sticky shell near the bottom                 |       1 | Cropped exact documentation assets and visually rechecked them     |
| Direct read model workspace test excluded integration files                     |       1 | Used the root integration Vitest config with the exact test path   |
| Playwright browser launch was denied by the macOS sandbox                       |       1 | Re-ran the scoped browser suite outside the sandbox                |
| E2E Prompt Compare assertion used the removed hidden label                      |       1 | Asserted the new visible `Compare` label and reran both browsers   |
| Initial Purge Archive build found unused imports and exact optional type errors |       1 | Removed unused imports and omitted undefined optional properties   |
| Purge Plan treated committed staging directories as recovery blockers           |       1 | Excluded transactions already published by a Commit Marker         |
| Empty-directory cleanup used the file-oriented non-recursive `rmSync` path      |       1 | Use `rmdirSync` after exact child enumeration and cleanup          |
| CLI parser local Map type did not include newly supported repeated options      |       1 | Match the local Map type to `ParsedArguments`                      |
| Purge Web test used unavailable `jest-dom` enabled and disabled matchers        |       1 | Assert the native element `disabled` property with Chai            |
| Node 24 experimental `localStorage` shadowed the jsdom test storage             |       2 | Install a deterministic in-memory Storage in Web test setup        |
| CLI integration test overcounted Creation Purge plan paths                      |       1 | Assert the three canonical Creation, tree and Curation targets     |
| Independent Purge lock did not exclude existing Archive writers                 |       1 | Reuse `archive.lock` and reject writers while the journal exists   |
| Recovery sibling check compared macOS `/var` and `/private/var` lexically       |       1 | Compare canonical parent `realpath` values                         |
| Ajv smoke initially resolved the root Ajv 6 instead of workspace Ajv 8          |       2 | Resolve Ajv from `packages/schemas` and compile both Purge schemas |
| Root lint rejected an unbound mocked API method assertion                       |       1 | Assert the standalone Vitest mock function                         |
| Sandbox denied the daemon integration test's temporary loopback listener        |       2 | Re-ran the complete integration suite outside the sandbox          |
