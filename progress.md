# 研发进度

## Session: 2026-08-02

### Phase 1: Requirements and Domain Design

- **Status:** completed
- **Started:** 2026-08-02
- 已完成:
  - 确认文件系统事实来源、Creation 边界、Prompt 历史与 Image Asset 身份.
  - 确认原子归档、并发、Curation、Replay 与删除策略.
  - 确认 Creation 只使用可逆的 `active | shelved` Curation 状态.
  - 确认中断事务的阶段化恢复、禁止自动重试与隔离策略.
  - 确认图片优先的图库信息架构与第一版检索边界.
  - 确认项目级 Hook 只执行事前阻断与结束前只读校验.
  - 使用 Context7 核对 Vite 的当前 React + TypeScript 官方模板与构建方式.
  - 使用 Context7 核对 Fastify 的当前 TypeScript、JSON Schema 与静态资源支持.
  - 使用 Context7 核对 Node.js 24 内置 `node:sqlite` 的 API 与稳定性状态.
  - 确认 TypeScript monorepo、React + Vite、Fastify 与隔离 `node:sqlite` adapter.
  - 确认包含 Generation Workflow、恢复、Hook、图库和完整文档的端到端 MVP 截面.
  - 确认 macOS 为正式支持平台, Linux 为 best-effort, Windows 不支持.
  - 确认包含正确性、故障恢复、安全、性能和文档一致性的 MVP 验收标准.
  - 在正式设计审查中识别出跨目录记录无法通过单次 rename 原子发布的矛盾.
  - 确认 append-only Commit Marker 是跨目录 Archive 事务的逻辑可见性边界.
  - 在正式目录 Schema 编写前识别出 Asset Library 与 Git 跟踪边界尚未定义.
  - 确认源码进入 Git, Asset Library 整体忽略且路径可配置.
  - 确认仓库外 Library 路径解析和 versioned format contract 的 onboarding 方式.
  - 使用 `ui-ux-pro-max` 调研 generative art gallery 的视觉、可访问性、性能与 React UI 约束.
  - 创建正式产品需求与 Asset Library 设计文档草稿.
  - 读取当前 `imagegen` Skill 并创建 Generation Workflow 设计文档草稿.
  - 根据 `ui-ux-pro-max` 结果创建 Web UI 信息架构、视觉、可访问性与安全设计草稿.
  - 使用 Context7 核对 npm workspaces、Vitest 与 Playwright 的当前官方文档.
  - 创建 monorepo 开发指南与完整测试策略草稿.
  - 更新 README、AGENTS 与 docs index, 使文档导航和状态一致.
  - 补充系统架构总览, 连接 Web、Codex、CLI、Archive、Read Model 与运行时边界.
  - 修正 CLI contract, 通过 stdin 传递 Prompt 和 tool result, 避免 argv 泄漏与 quoting 风险.
  - 记录 runtime Library 与源码 Git 边界 ADR.
  - 创建并持续更新 `CONTEXT.md` 与 7 份 ADR.
  - 创建根 `README.md`、根 `AGENTS.md`、文档索引和文档规范.
  - 初始化持续计划、发现与进度文件.
  - 用户确认 shared understanding, 设计阶段结束.
- 已修改文件:
  - `README.md`
  - `AGENTS.md`
  - `CONTEXT.md`
  - `docs/README.md`
  - `docs/standards/documentation.md`
  - `docs/product/requirements.md`
  - `docs/design/system-architecture.md`
  - `docs/design/asset-library.md`
  - `docs/design/generation-workflow.md`
  - `docs/design/web-ui.md`
  - `docs/development/guide.md`
  - `docs/development/testing.md`
  - `docs/adr/*.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### Phase 3: Implementation

- **Status:** completed
- **Started:** 2026-08-02
- 已完成:
  - 固定 feature-first monorepo、same-origin typed fetch、ephemeral local session token、无实时通道和 typed global error handling 的实现边界.
  - 按互不覆盖的目录所有权拆分 Archive/CLI、Web UI、Codex Skill/Hook 与 Server/read model 集成工作.
  - 实现 domain、Schema、Archive writer、Library resolver、validator、transaction、Commit Marker、recovery 和 optimistic Curation/Draft update.
  - 实现 `assetctl` 的 init、validate、Creation、Draft、Curation、asset import、Revision、Generation、recovery、fixture validation 与 index rebuild commands.
  - 实现 `node:sqlite` read model、FTS5 Gallery query、provenance query、atomic rebuild 与 bounded Sharp thumbnail cache.
  - 实现 loopback Fastify API、Host/Origin/session token 边界、multipart import、static SPA 和 typed error model.
  - 实现 React + Vite SPA 的 Gallery、References、Creations、Image、Generation、Recovery 与 Settings 页面.
  - 实现 repo-scoped `$generate-and-archive` Skill、CLI reference、Prompt policy、recovery policy、3 个 eval cases 与 project Hook.
  - 创建 valid/invalid fixtures、Playwright synthetic Library、full-scale performance dataset 和测试矩阵.
  - 升级 `@fastify/static` 与 Sharp, 最终 npm registry audit 为 0 vulnerabilities.
  - 补齐全部 workspace project references, root build 覆盖 API contract、Archive、read model、CLI、Server 与 Web.
  - 更新根 README、AGENTS、正式文档、ADR、Schema guide 与研发记录, 将稳定契约设为 `accepted`.

### Phase 4: Testing and Verification

- **Status:** completed
- **Started:** 2026-08-02
- 已完成:
  - 运行 Archive 成功、失败、中断、Replay、并发、hash、symlink、path traversal 与 recovery integration tests.
  - 在外部临时 Library 执行 Creation、Generation、Commit、full validate 与 index rebuild smoke.
  - 运行 Hook/Skill contract tests 与 Web component/API/state tests.
  - 在 Chromium 与 WebKit 运行完整 provenance、search/history、Curation/filter、Prompt diff、recovery、keyboard/theme 与 warm thumbnail E2E.
  - 发现并修复 SPA bootstrap token boundary、FTS query plan 和 rebuild/query concurrency.
  - 在 Apple M1 16 GiB、Node.js 24.18.0 上执行完整规模 performance baseline.
  - 运行干净 `npm ci`、production build、typecheck、lint、format、fixtures、docs 与 dependency audit.

### Phase 5: Delivery

- **Status:** completed
- **Started:** 2026-08-03
- 已完成:
  - 生成 Skill 与无 Skill 的 3 组离线对照样本、逐项评分、汇总 benchmark 与静态 review viewer.
  - 使用严格执行型断言评分时, 两组均为 0 / 12. 原因是本轮明确禁止真实图片生成和 Library 写入, 规划文档不能证明执行结果.
  - 记录质性差异: Skill 版本更完整地覆盖受控 roles、引用绑定、原子归档、失败恢复与未知结果隔离, 但当前离线样本不能量化其执行收益.
  - 完成 README、AGENTS、正式文档、计划、发现与进度记录的最终同步.
  - 确认所有 Codex 约束均位于仓库内, 未修改全局 Codex 配置.

### Phase 6: First-run Library Initialization

- **Status:** completed
- **Started:** 2026-08-03
- 已完成:
  - 在 Read Model 的 open 与 rebuild 边界增加 `library.json` 前置检查, 缺少 manifest 时不创建 Library root、`.cache/` 或 SQLite index.
  - Server 缺少 manifest 时跳过 read model, 以 initialization-required diagnostics mode 继续提供 bootstrap、health 与静态 Web UI.
  - 初始化模式下阻断其他 Library API, 返回 `503 LIBRARY_INITIALIZATION_REQUIRED`、canonical path 与 shell-safe exact init command.
  - Web bootstrap screen 展示解析路径、初始化命令和 restart local service 指引, 不构造 API client 或请求 Gallery.
  - 同步 README、产品需求、系统架构、Web UI、开发指南与测试策略.
  - 新增 Read Model 无副作用回归测试、Server setup/API guard integration test 与 Web first-run component test.
  - 真实启动验证发现 Archive adapter factory 在 initialization mode 前 eager-read manifest; 已移除重复读取并补 factory regression test.
  - 修正 npm workspace 从 `apps/server` 启动时的 Git root 解析, Server 现在向上查找 `.git`, initialization command 指向仓库根目录的 `library/`.
  - 使用真实 `npm run dev` 和 loopback bootstrap 验证 initialization payload、canonical path 与 exact init command.

### Phase 7: Persistent Library Selection and Merge

- **Status:** completed
- **Started:** 2026-08-03
- 已完成:
  - `assetctl init --library` 成功后通过共享 resolver 将 canonical absolute path 原子写入 Git root 的 `text-to-image.local.json`.
  - 新增 `assetctl library select --library`, full validation 成功后只更新本机选择, 不修改 Archive.
  - 新增 `assetctl library merge --source [--library <destination>] [--dry-run]`, 将 source committed graph 合并到 current Library.
  - Merge 对 Creation、Revision、Generation 和 Commit identity 冲突执行全量预检, Image Asset 按 hash 复用, 同 UUID 不同 bytes 整体失败.
  - Merge 对新增实体复制 Draft 与 Curation, 对已存在实体保留 destination mutable state, 忽略 `inbox/` 与所有 cache/recovery state.
  - Merge 复用现有 staging、Archive lock、checksum、recovery 与 Marker visibility boundary, 使用单一 `merge_library` Marker 原子发布.
  - Source 在 staging 前后执行 optimistic snapshot recheck, destination 在锁内重新检查 identity collision.
  - 修复 Read Model 将随机 Marker UUID 当作顺序的问题, 改为按 `createdAt` 排序, 并在 `open()` 检测 lag 后自动 rebuild.
  - 更新 domain contract、v1 JSON Schema、CLI capability、README、产品需求、Asset Library、系统架构、开发与测试文档.
  - 增加 config persistence、select failure preservation、merge dry-run/apply/no-op/conflict/interruption/recovery 和 Read Model marker lag tests.
  - 安装 Playwright browser binaries, 在 scoped outside-sandbox execution 中完成 Chromium 与 WebKit E2E.

### Phase 8: Generation Issues and Safety Rejection UX

- **Status:** completed
- **Started:** 2026-08-03
- 已完成:
  - 通过逐项设计访谈确认 Gallery placement、structured moderation contract、Draft recovery path、latest-per-active-Creation lifecycle 与 evidence boundary.
  - 在 `CONTEXT.md` 定义 `Generation Issue` 与 `Safety Rejection`.
  - 将受影响正式文档切回 `draft`, 同步产品需求、Asset Library、Generation Workflow、Web UI、测试策略与文档索引.
  - 明确直接更新 format `1`; 当前 development Library 可重新初始化, 不实现 migration 或旧 reader compatibility.
  - 修复 `commitGeneration` 的根因: effective Prompt 只写入 immutable Prompt Revision, Generation 成功、失败和中断都保留用户 Draft 原文与语言, hash 未变化时只更新 `basedOnRevisionId`.
  - 扩展 Generation error schema、domain、Archive request、read model、API 与 `GET /api/v1/generation-issues`, 限制 moderation stage/categories 并兼容旧 error record.
  - 实现 Gallery `Generation Issues` region、Creation Timeline concise failure reason、Generation Detail structured warning panel、category-level guidance 和 explicit Draft recovery links.
  - 完成 Compact Editorial Workspace desktop UI audit: fixed 200 px dark sidebar, compact header, desktop two-column detail, type scale、theme contrast 和 visible focus.
  - 更新 Generation Skill、CLI contract、Prompt policy、产品需求、设计与测试文档, 并恢复受影响文档状态为 `accepted`.
- 验证:
  - `npm test`: passed, 28 Hook/Skill tests and 23 Web tests.
  - `npm run test:integration`: passed, 4 files and 33 tests.
  - `npm run typecheck`, `npm run build`, `npm run lint`, `npm run docs:check`, `npm run fixtures:validate`: passed.
  - `git diff --check`: passed.
  - `npm run test:e2e`: passed outside the sandbox, 13 passed and 1 intentional WebKit mutation skip; added Gallery `1024x768` and Creation `1440x900` visual snapshots. The earlier in-sandbox run failed before application assertions because of macOS browser Mach port permissions.

### Phase 9: Runtime Library Management

- **Status:** completed
- **Started:** 2026-08-03
- **Completed:** 2026-08-03
- 已完成:
  - 定义 `Library Unavailable` contract, 并通过 ADR 0010 固化 absolute path input、candidate preparation、request drain、atomic switch 与 session isolation.
  - Server 在 request boundary 检测 active Library 删除、manifest 缺失和权限错误; Settings 显示或输入绝对路径, 初始化、选择或重试 Library.
  - 按反馈删除 directory browser UI、目录列表 API 与对应类型、样式和测试, 避免暴露无必要的 filesystem enumeration surface.
  - Candidate 在 switching critical section 外完成 validation 与 Read Model rebuild; commit 排空旧请求、持久化选择、切换 context 并轮换 session token.
  - Stop Hook 将 `ARCHIVE_NOT_INITIALIZED` 识别为可恢复的 unavailable state, 不再错误报告 Archive integrity failure.
- 验证:
  - `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` 与 `git diff --check`: passed.
  - `npm test`: 28 Hook/Skill tests 和 16 Web tests passed.
  - `npm run test:integration`: 4 files, 30 tests passed.
  - `npm run test:e2e`: 11 passed, 1 intentional WebKit mutation skip.
  - `npm run docs:check`: 31 Markdown files 和 10 ADRs passed.
  - `npm run fixtures:validate`: 2 of 2 fixtures matched.
  - Phase 9 独立修改的系统架构与开发指南恢复为 `accepted`; 与 Phase 8 共享的正式文档继续保持 `draft`.

### Phase 10: Configurable Listen Address

- **Status:** completed
- **Started:** 2026-08-03
- **Completed:** 2026-08-03
- 已完成:
  - 通过逐项访谈确认 IPv4、IPv6、wildcard、trusted LAN、CLI precedence 与 Browser-facing development listener contract.
  - 将产品需求、系统架构、Web UI、开发指南与测试策略切回 `draft`, 新增 ADR 0011.
  - 在 `AGENTS.md` 强化 AI 修改项目逻辑时同步更新正式文档、测试与 `progress.md` 的规则.
  - 实现 `--host` parsing、IP literal validation、wildcard interface URL discovery、runtime Host/Origin allowlist 与 development launcher.
- 验证:
  - Focused Server config/listener tests: 2 files, 8 tests passed.
  - Web workspace typecheck: passed.
  - Standalone Server workspace typecheck: failed because referenced package declarations had not been rebuilt; 同时发现并修复新增 test helper 的 IPv4/IPv6 discriminated union 类型错误. 后续使用 root build/typecheck contract 复验.
  - Root build 与 root typecheck: passed.
  - Initial production-like smoke 在 sandbox 内因 `tsx` IPC socket `EPERM` 失败; 使用相同 isolated temp root 在 scoped outside-sandbox execution 中通过.
  - `npm start -- --host 0.0.0.0`: 输出 loopback 与 LAN concrete URLs; bootstrap `200`, hostile Host `403`.
  - `npm run dev -- --host 0.0.0.0`: Vite 暴露 wildcard `5173`, Fastify 保持 loopback `4174`; Web 与 LAN Origin proxy bootstrap 均返回 `200`.
  - `npm test`: Server 2 files / 9 tests, Hook and Skill 28 tests, Web 10 files / 23 tests passed.
  - `npm run test:integration`: 4 files, 33 tests passed.
  - Final root build: passed.
  - Initial `npm run format:check`: failed only because `listener.test.ts` was patched after its earlier Prettier pass; exact file was reformatted before final rerun.
  - Final `npm test`, `npm run build`, `npm run typecheck` 与 `npm run lint`: passed after scoped IPv6 filtering was added.
  - `npm run test:e2e`: 13 passed, 1 existing intentional WebKit mutation skip.
  - Code、README、ADR 与正式文档交叉审查完成; 受影响正式文档恢复为 `accepted`.
  - Final `npm run docs:check`: 32 Markdown files and 11 ADRs passed.
  - Final `npm run format:check` 与 `git diff --check`: passed.

### Phase 11: Session Image Reference Ingress

- **Status:** completed
- **Started:** 2026-08-04
- **Completed:** 2026-08-04
- 已完成:
  - 使用 `$grill-with-docs`、`grilling` 与 `domain-modeling` 逐项确认 Session Image ingress contract.
  - 在 `CONTEXT.md` 新增 `Session Image`, 明确它与 Image Asset、Reference Image 的边界.
  - 确认自动导入使用独立 `import_asset` transaction, Reference roles 不使用默认值, 多图输入在 Generation boundary fail closed.
  - 核对当前 Codex 能力: opaque session handle 可以被图片工具消费, 但当前没有通用原始 bytes 导出接口.
  - 将产品需求、Asset Library、Generation Workflow、开发指南与测试策略切回 `draft`.
- 错误:
  - 初次 source inspection 阅读命令引用了不存在的 `packages/archive/src/errors.ts`; `ArchiveError` 实际位于 `packages/domain/src/index.ts`, 后续检查改用真实路径.
  - Standalone Archive 与 CLI typecheck 读取了尚未重建的 referenced declarations; 改用 root build 后执行 root typecheck.
  - 默认 Vitest 配置排除了 `tests/archive/archive.test.ts`; 后续使用仓库 `test:integration` contract.
  - 新增 Image source inspection test 使用了错误的 fixture SHA-256; 已按实际 fixture bytes 修正期望值.
  - 组合文档补丁使用了过期的 Testing Strategy 英文条目; 已拆分并按当前中文章节更新.
  - Lint 拒绝在 unknown CLI payload assertion 中嵌套 `any` matcher; 已显式收窄 payload 并逐项断言 command membership.
  - 直接执行 CLI dist 无法解析 workspace source `.js` import; 该入口不属于当前 root command contract, smoke 改用 `npm run assetctl -- ...`.
  - Fixture validation 在 sandbox 内无法创建 `tsx` IPC socket; 按既有 root command contract 在 sandbox 外复验.
- 待完成:
  - 无.
- 实现:
  - 在 Archive 新增无写入 `inspectImageSource`, 返回 canonical source path、SHA-256、byte length、media type 与尺寸.
  - 新增 `IMAGE_SOURCE_MISSING` 与 `IMAGE_SOURCE_UNREADABLE`, 并保留 `IMAGE_UNSUPPORTED` 与 `IMAGE_INVALID` 的 payload 语义.
  - CLI capabilities 与 command surface 新增 `asset.inspect`; `asset import` 复用同一 source reader, 避免 inspection 与 import 产生两套解析逻辑.
  - Generation Skill 固定一次 resolver 结果, 对全部 Session Image 先 inspection、再独立 import, 校验 hash 后才 prepare Generation.
  - Prompt policy 明确从用户措辞解析 roles, 无明确语义时询问且不设置默认值.
  - 新增 Session Image eval、Skill contract test 与 Archive/CLI integration coverage.
  - 本次真实 source path 只读 smoke 成功: JPEG `1080x1080`, SHA-256 `35ebe9964144d179861de28cb797dff07f54d7fb56f87af41511cd9ebd2e9574`, byte length `116052`.
- 验证:
  - `npm test`: Server 2 files / 9 tests, Hook and Skill 29 tests, Web 10 files / 23 tests passed.
  - `npm run test:integration`: 4 files / 34 tests passed.
  - `npm run build`, `npm run typecheck`, `npm run lint` 与 `npm run format:check`: passed.
  - `npm run docs:check`: 32 Markdown files and 11 ADRs passed.
  - `npm run fixtures:validate`: 2 of 2 fixtures matched outside the sandbox.
  - `git diff --check`: passed.

### Phase 12: End-user Documentation

- **Status:** completed
- **Started:** 2026-08-04
- **Completed:** 2026-08-04
- 已完成:
  - 审计正式文档, 确认现有入口只有产品, 设计和开发资料, 缺少面向普通用户的完整操作手册.
  - 新增 `docs/user/guide.md`, 说明首次启动, Creation, 纯 Prompt 生成, Reference roles, 稳定本地路径导入, Prompt 迭代, variant, replay, Curation, failure 和 Recovery.
  - 明确当前 Web UI 不启动生成, `Files mentioned` 只有在宿主提供可读取本地路径或原始 bytes 时才能进入 Reference ingress.
  - 使用 ImageGen 生成 `1672x941` PNG 教学示意图, 并通过 `view_image` 检查角色身份一致性, 构图和无文字要求.
  - 通过共享 CLI 在临时目录创建无私人内容的演示 Library, 导入参考图, 完成包含 Prompt Revision, Reference relation 和 Output 的真实 Generation, full validation 通过.
  - 启动隔离的 loopback Web UI, 使用浏览器控制实际打开 Gallery, Creation 和 Generation 页面, 检查 DOM 后保存 3 张截图并逐张视觉检查.
  - 更新 README, AGENTS, 文档规范, 文档索引和任务计划.
- 错误:
  - Sandbox 拒绝 `tsx` IPC socket, 使用限定 approval 在临时演示 Library 中重跑 CLI.
  - 默认开发 Server 的 `4174` 端口已被现有进程占用, 改用独立 production-like Server 的 `4180` 端口制作截图.
  - 浏览器 full-page capture 在长页面底部重复 sticky shell, 对精确截图文件执行裁剪并重新视觉检查.
- 验证:
  - 临时演示 Library `assetctl validate --full`: passed, 6 committed records, 4 commit markers, 0 diagnostics.
  - `npm run build -w @text-to-image/web`: passed, 56 modules transformed.
  - `npm run docs:check`: passed, 33 Markdown files and 11 ADRs.
  - `npm run format:check`: passed.
  - `git diff --check`: passed.
  - 文档图片存在性, MIME 和尺寸检查: passed, 1 PNG 示意图和 3 JPEG Web UI screenshots.

### Phase 13: Generation Workflow Latency and Progress

- **Status:** completed
- **Started:** 2026-08-04
- 已完成:
  - 复盘一次真实带 `subject` Reference Image 的 Generation task. Codex UI 用户端到端耗时为 `16m38s`; 可见工具 `Wall time` 手工汇总约 `8m30s`, 剩余约 `8m08s` 属于当前未分段观测的 Codex reasoning、调度、序列化与渲染时间.
  - 实测当前 `npm run assetctl -- capabilities` 三次为 `0.23-0.41s`, 直接 `tsx` 为 `0.11-0.12s`; 当前 63 文件、10 MiB Library quick validation 为 `0.75s`. 结论是 CLI 计算不是主要瓶颈, 不优先引入 daemon 或 executable 优化.
  - 确认本次最大可消除错误是 CLI `readFileSync(0)` 等待 EOF, 而 Codex PTY 无法可靠关闭 stdin, 导致多次约 28 秒等待和 fallback pipeline.
  - 通过 `$grill-with-docs` 逐项确认双层 SLO、`LF-or-EOF` stdin framing、只读 Preflight、byte-identical Prompt hash gate、增量 Marker catch-up、CLI 分层、stage progress、telemetry boundary 与 deterministic performance gate.
  - 新增 ADR 0012, 明确 Workflow telemetry 不进入 immutable Archive.
  - 将 `docs/product/requirements.md`、`docs/design/generation-workflow.md` 与 `docs/development/testing.md` 切回 `draft`, 同步文档索引和 Phase 13 实施计划.
- 已完成:
  - CLI 使用 bounded `LF-or-EOF` reader, 以 1 MiB 上限、严格 UTF-8、单 JSON value 和 trailing-content rejection 替代 `readFileSync(0)` EOF 等待.
  - Generation Prepare 返回 `promptSha256`; 带 hash 的 invocation marker 在 marker 前 fail closed, mismatch 保持 `prepared`. `generation verify-prompt` 仅保留为独立诊断与 fault-injection command.
  - `generation preflight` 只读返回 canonical Library、quick validation、Draft snapshot、recovery warning 和 Session Image inspections; capture 返回 canonical `stagedPath`; `generation finalize` 复用 complete/fail、commit 与 Read Model catch-up.
  - Read Model 增加按 Commit Marker 增量 catch-up, 每个 Marker 在单个 SQLite transaction 内原子更新 `last_indexed_marker`; projection failure 返回 `degraded` 并保留上一 cursor, 后续可继续追平.
  - Generation Skill 与 CLI contract 补充单一 Prompt、真实 stage/elapsed/heartbeat、无 fake percentage/ETA、双层 SLO 和 telemetry boundary. Workflow telemetry 只作为 transient report, 不进入 Archive.
  - 新增 `WorkflowProgress`、SLO evaluator、stdin/preflight/hash/finalize/index focused tests 与 deterministic fake workflow performance gate.
- 验证:
  - `npm test`: passed, 3 Vitest files / 11 tests, Hook and Skill 30 tests, Web 10 files / 23 tests.
  - `npm run test:integration`: passed, 5 files / 42 tests.
  - `npm run test:performance:smoke`: passed, 2 files / 3 tests; synthetic rebuild 692 ms, warm query p95 1.36 ms, workflow p95 pre-tool 170 ms, post-tool 342 ms, non-model overhead 495 ms.
  - `npm run test:performance`: passed, release scale 2,000 Creations / 30,000 Generations / 10,000 Image Assets; rebuild 14,566 ms, warm query p95 48.88 ms, workflow p95 pre-tool 140 ms, post-tool 353 ms, non-model overhead 491 ms.
  - `npm run build`, `npm run typecheck`, `npm run lint` 与 `npm run format:check`: passed.
  - `npm run docs:check`: passed, 34 Markdown files and 12 ADRs; formal Markdown statuses restored to `accepted`.
  - `git diff --check`: passed.

### Phase 14: End-to-end Generation Workflow Optimization

- **Status:** completed
- **Started:** 2026-08-04
- **Completed:** 2026-08-04
- 已完成:
  - 使用 `$grill-with-docs` 逐项确认完整端到端性能边界、Workspace Ready、CLI TTY ownership、双源 telemetry、最小确定输入、commit 后检查、高层 Begin/Finalize 与验证预算.
  - 在 `CONTEXT.md` 定义 `Workspace Ready` 与 `Workflow Telemetry`, 并收紧 `Generation Workflow` 的端到端边界. ADR 0012 已覆盖 telemetry 不进入 Archive, 因此没有新增重复 ADR.
  - CLI shared stdin reader 在 TTY 下保存原 `isRaw`, 自治启用 raw mode, 并在成功、失败和 cleanup 时恢复. Skill 不再依赖 `stty` 或 Wrapper.
  - 新增高层 `generation begin`, 复用 Session Image importer、Prepare、Prompt hash gate 与 Mark primitives. Session Image 在 Preflight 后变化时返回 `SESSION_IMAGE_CHANGED`, 已提交 import 保留.
  - 扩展高层 `generation finalize`, 直接接收 local output sources, 复用 Capture、terminal finalize、Commit Marker 与 incremental index catch-up.
  - `workflowRunId` 关联 repository spans 与 Codex UI duration. UI duration 未暴露时, `nonModelOverheadMs` 与端到端 SLO 保持 `unknown`, 不使用 repository timings 推测.
  - Generation Skill 的普通路径收敛为 `preflight -> begin -> image_gen -> finalize`, 只加载 Skill contracts 与一次 Preflight snapshot. built-in result 可见时不在 commit 前重复检查; tool 返回本地 Output 后下一动作立即启动 Finalize.
  - 更新 CLI contract、Skill eval、产品需求、Generation Workflow、测试策略和文档索引.
- 错误:
  - 初始 Phase 14 test 假设 Commit Marker 文件名顺序等于提交时间; 改为按 operation 查找目标 marker.
  - `/usr/bin/script` 无法在 Vitest socket stdin 上执行 `tcgetattr`; `/usr/bin/expect` PTY smoke 没有按预期交付 `LF`. 删除不可靠自动化, 改用 raw-mode unit test 与真实 Codex PTY smoke.
  - Phase 14 stream fake 在 root typecheck 中因 `isRaw` 的 `this` 类型过窄失败; 显式收窄 receiver 后通过.
  - Skill contract test 仍断言旧 wording `全部 inspection 成功后`; 更新为新 fail-closed contract 后通过.
  - 第一次真实 PTY helper 使用 top-level await, `tsx -e` 的 CJS output 不支持; 改用真实 `assetctl generation preflight` smoke.
  - inline `tsx -e` helper 被 Archive guard 拒绝为不可证明安全的 compound shell; 使用允许的 root CLI contract 后通过.
  - 真实 Generation Begin 已启动后, smoke orchestration 用 `TextEncoder` 统计 payload bytes, 但 tool isolate 未提供该 global. 已保留 session 并发送原 payload, transaction 正常完成; 该额外编排时间保留在 pre-tool observation 中.
- 验证:
  - `npm test`: passed, root Vitest 3 files / 11 tests, Hook and Skill 31 tests, Web 10 files / 23 tests.
  - `npm run test:integration`: passed, 6 files / 46 tests.
  - `npm run test:performance:smoke`: passed, 2 files / 3 tests. 12 次 fake workflow 的 p95 为 pre-tool `84.01ms`, post-tool `172.25ms`, non-model overhead `256.26ms`.
  - 真实 PTY smoke 接收 `5,135` bytes, 未回显 payload, command exit `0`.
  - `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run docs:check`, `npm run fixtures:validate` 与 `git diff --check`: passed.
  - 真实 Workspace Ready Generation committed: workflow `716715d7-f88c-4159-a4b0-ac5108f1c710`, Generation `2fecfcaa-f9bb-40d2-b1bb-53b84f078128`, Output SHA-256 `fd9ecd802e70e86e77ad9d35f846377e6a5395704e205d44dccea7d1cb1f3b95`, PNG `1536x1024`, index `ready`.
  - 真实 observation 从 Preflight 到 Finalize return 为 `226.28s`: pre-tool `40.62s`, provider `152.86s`, post-tool `32.80s`. Archive telemetry 到 index ready 为 `225.54s`. 相比原始 `12m17s` 缩短约 `8m31s`.
  - 真实单样本 pre-tool 和 post-tool 未达到 `20s/10s`; Codex UI authoritative duration 未暴露, user-facing SLO 为 `unknown`. 不以该样本宣称 provider 或 workflow p95.

### Phase 15: Prompt, Generation, and Reference Provenance Navigation

- **Status:** completed
- **Started:** 2026-08-04
- **Completed:** 2026-08-04
- 已完成:
  - 使用 `$grill-with-docs` 确认双区同步联动、多次 Generation 高亮、Reference Image usage 分组、URL 深链、默认 Focus、Prompt Compare 独立状态与 Image Detail 反向入口.
  - 核对现有 Archive 和 read model 已保存 `Generation.promptRevisionId` 与 `Generation.references`; 本阶段不新增 Archive 实体或持久化关系.
  - 将产品需求、Web UI、用户手册与测试策略切回 `draft`.
  - Creation 页面使用 `revision` 与 `generation` query parameters 同步 Prompt History 与 Generation Timeline, 默认 Focus 最新 Generation, 并保持 Prompt Compare 独立.
  - Focused Revision 按 Generation usage 展开 Reference Image、roles 与 guidance; Timeline 保留完整 chronology 并显示 Prompt link 与 Reference thumbnails.
  - Generation Detail 返回精确 Creation provenance Focus; Image Detail 的每条 used-as-reference relation 同时链接 Generation 与 Prompt Revision.
  - Read model 通过 Generation join 派生 `promptRevisionId`, Archive Schema、writer 和持久化格式保持不变.
  - 更新产品需求、Web UI、用户手册、测试策略、findings、task plan、component/integration/E2E tests 与 Chromium/WebKit visual snapshots.
- 验证:
  - `npm test`: passed, root Vitest 3 files / 11 tests, Hook and Skill 31 tests, Web 11 files / 24 tests.
  - `npm run test:integration`: passed, 6 files / 46 tests.
  - `npm run test:e2e`: Chromium 与 WebKit provenance、URL deep link、Prompt Compare 和 visual snapshots 通过; WebKit 保留 1 个既有 mutation skip.
  - `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check` 与 `npm run docs:check`: passed.
- 错误:
  - 直接运行 read model workspace test 时 integration pattern 被默认配置排除; 改用 root integration Vitest config 后 6 tests 通过.
  - Playwright 在默认 sandbox 内因 macOS Mach port 权限失败; 在 scoped outside-sandbox execution 中通过.
  - 完整 E2E 首轮仍断言旧的隐藏 Compare label; 更新为可见 `Compare` label 后 Chromium 与 WebKit 用例通过.

### Phase 16: Local Runtime Entry Points

- 已完成:
  - 使用 `$grill-with-docs` 逐项确认 daemon scope、`.env` precedence、mise ownership、single instance、readiness、stop、status、logs、development ports、Web build gate 与 platform boundary.
  - 将用户手册、产品需求、系统架构、开发指南与测试策略切回 `draft`, 同步 Phase 16 confirmed contract; 完成实现与交叉检查后恢复为 `accepted`.
  - root npm scripts 使用 Node.js 24 `--env-file-if-exists` 为 `dev` 与 `start` 加载可选 `.env`; daemon 只在 Server child 启动时加载, build、test 与 CLI 不受影响.
  - development launcher 统一解析 Server / Web ports, 并把同一 values 传入 Vite listener、proxy target 与 Server allowlist.
  - 新增 npm-backed `mise.toml`, 提供 `dev`、`start` 与 daemon lifecycle tasks, pin Node.js 24.
  - 新增 project-owned daemon launcher, 使用 detached Node.js child、唯一 process identity、IPC readiness、atomic metadata、structured log follow 与 bounded `SIGTERM` stop.
  - `start` 与 daemon 启动前构建 Web UI; daemon 已运行时保持幂等且跳过重复 build.
  - 增加 metadata unit tests、`.env` contract tests 与 test-owned runtime 的真实 daemon integration.
- focused 验证:
  - root typecheck: passed.
  - daemon metadata、runtime entrypoint 与 Server config focused unit tests: 3 files / 13 tests passed.
  - daemon integration: 1 file / 1 test passed, 覆盖 build、readiness、health、idempotent start、status、log follow 与 stop.
  - `mise tasks validate`: 6 tasks validated; local task list 与 `dev` / `daemon:status` dry-run expansion matched npm scripts.
- full 验证:
  - `npm test`: 5 root files / 19 tests、31 Hook/Skill tests 与 24 Web tests passed.
  - `npm run test:integration`: 7 files / 47 tests passed, 包含真实 daemon lifecycle integration.
  - `npm run build`、`npm run typecheck`、`npm run lint`、`npm run format:check` 与 `npm run docs:check`: passed.
  - `npm run test:e2e`: 13 passed, 1 intentional WebKit mutation skip.
  - 临时 `.env` 与临时 Library smoke: `mise dev` 和 `mise start` 的 root page 与 `/api/v1/health` 均可访问; `SIGTERM` 后使用的临时端口均已关闭.
- 错误:
  - 首次 daemon integration 在 Web build 阶段失败, 因为 Vite config 把 production port `0` 当作 development port 校验. 将 host / port parsing 限定到 Vite `serve` command 后通过.

### Phase 17: Creation and Image Asset Purge Design

- 已完成:
  - 使用 `$grill-with-docs`、`grilling` 与 `domain-modeling` 逐项确认 Creation Purge、Image Asset Purge、Generation Issue、Reference relation、recovery evidence、maintenance、verified replacement、Cutover、Merge、confirmation 与 Web UI 边界.
  - 在 `CONTEXT.md` 增加 Creation Purge、Image Asset Purge、Library Maintenance、Recovery Evidence Abandonment、Purge Plan 与 Purge Cutover, 并收紧 Generation Issue、Reference Image 与 Library Merge 语义.
  - 新增 ADR 0013, 记录拒绝原地 deletion 与永久 tombstone、采用 verified replacement 的原因和代价.
  - 新增 `docs/design/purge-workflow.md`, 定义完整不变量、Purge Plan、阻塞关系、candidate、journal、Cutover、restart recovery、CLI/API、failure、security、compatibility 与 validation contract.
  - 将产品需求、用户手册、系统架构、Asset Library、Generation Workflow、Web UI、开发指南与测试策略切回 `draft`, 并加入 Phase 17 实施与验收边界.
  - 更新 README、AGENTS、文档索引、任务计划与研究记录, 明确 Purge 尚未实现, 禁止手工删除 managed Archive.
- 当前范围:
  - 已新增 Purge domain types、stable errors 与独立 Plan / journal JSON Schema.
  - Shared Archive 已实现 snapshot-bound Plan、Reference blocker、Recovery Evidence Abandonment、Inbox warning、verified replacement、Marker rewrite、hard-link/copy fallback、global lock、writer maintenance guard、retired cleanup 与关键 crash-window roll-forward.
  - CLI 已实现 Creation / Image prepare、execute、status 与重复 exact abandonment option; execute 后重建 read model.
  - Server 已实现 Purge prepare / execute / status control plane, request drain、maintenance rejection、index rebuild、context reopen 与 session token rotation.
  - 修复 client abort 后 Fastify `onResponse` 未执行导致 Library lease 泄漏、后续 Purge 永久等待的问题. Request lifecycle 现在联合跟踪 handler completion、response close、abort 与 timeout, drain 另有 30 秒 fail-safe deadline.
  - Web 已在 Creation Detail 和 Image Detail 增加 Danger Zone, 展示 impact、relation blocker、recovery evidence、exact confirmation 与同步 maintenance status, 完成后导航到对应 list.
  - 尚未完成异步 `/maintenance/purge/:operationId` progress route、全部 journal phase failpoint、locked-file / permission / mount 安全矩阵与 browser E2E; 正式文档继续保持 `draft`.
- 实现验证:
  - `npm run build`: passed, Web 57 modules transformed.
  - Phase 17 focused Archive / CLI integration: 8 tests passed.
  - Server Purge / security integration: 10 tests passed, 包含真实 loopback client abort cleanup 与 drain timeout fail-safe.
  - `npm test`: root 5 files / 19 tests、31 Hook / Skill tests、Web 12 files / 26 tests passed.
  - `npm run test:integration`: 8 files / 56 tests passed outside sandbox, 包含 daemon loopback lifecycle.
  - `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run docs:check`、`npm run fixtures:validate` 与 `git diff --check`: passed.
  - Purge Plan 与 journal JSON Schema 使用 Ajv 8 strict mode 编译通过.
- 文档验证:
  - `npm run docs:check`: passed, validated 36 Markdown files and 13 ADRs.
  - `npm run format:check`: passed.
  - `git diff --check`: passed.
- 错误:
  - 首次 Purge 跨文件文档补丁引用了不存在的 testing context, 整体未应用; 改为逐文件小补丁后继续.
  - 首次 `npm run format:check` 报告 3 个新增或更新文档未格式化; 使用 repository Prettier 处理 exact files 后重新验证.
  - 第二次 format check 只报告 `task_plan.md` 的 error table 对齐变化; 完成错误记录后统一格式化该文件.
  - 写入最终 validation count 后 `progress.md` 表格需要重新对齐; 记录后执行一次 exact-file format.
  - 首次记录该格式错误时使用了 Prettier 前的 table spacing, patch 未应用; 读取 exact rows 后修正.
  - Purge Plan 初次把已提交 staging 误判为 recovery blocker; 使用 Commit Marker 排除已发布 transaction.
  - retired cleanup 初次使用 file-oriented `rmSync`; 改为逐项安全枚举后 `rmdirSync`.
  - restart recovery 初次 lexical 比较 macOS `/var` 与 `/private/var`; 改为 parent `realpath` containment.
  - Web Purge test 初次使用未启用的 `jest-dom` matcher; 改用 Chai property assertion.
  - root integration 与 fixture validation 在 sandbox 内被 loopback / `tsx` IPC policy 拒绝; scoped outside-sandbox rerun passed.
  - Purge abort regression 的真实 loopback listener 在 sandbox 内返回 `EPERM`; scoped outside-sandbox rerun 后 10 tests passed.
  - Phase 18 完成 `IndexCatchUpResult.lagCount` contract 后 root typecheck passed; 本轮新增的 `exactOptionalPropertyTypes` 错误已修复.

### Phase 18: Cross-process Read Model Coordination

- **Status:** completed
- 已完成:
  - 读取并复核并发故障诊断任务, 确认 transient malformed error 来自跨进程 catch-up/rebuild 缺少共同 writer coordination.
  - 使用 `$grill-with-docs`, `grilling` 与 `domain-modeling` 逐项确认 8 秒有界等待、独立 SQLite coordinator、错误分类、typed degradation 与多进程验收边界.
  - 通过 Context7 核对 Node.js 24 `node:sqlite` 的 `DatabaseSync` timeout 与 transaction API, 并在当前 runtime 验证 busy error fields.
- 当前实现范围:
  - `index-writer.sqlite` 使用 SQLite `BEGIN IMMEDIATE` 串行化跨进程 catch-up 与 rebuild, 8 秒有界等待并在 owner crash 时由 OS 自动释放.
  - Read Model 在获得 writer ownership 后重新打开当前 index 并 rescan Archive cursor; corruption recovery 只允许首个 holder rebuild.
  - CLI、Server health 与 Web Settings 使用稳定 degradation code, 不暴露内部 path 或 stack.
  - 长生命周期 Read Model 只在实际 Marker lag 大于零时暴露 degradation; 其他 process 追平后, 旧实例不会保留 stale degraded health.
  - Phase 18 多进程 integration 覆盖四 writer serialization、busy timeout、owner crash release 与 single corruption rebuild.
  - Empty Library Schema 显式保存 `indexed_marker_ids = []`, 避免 reopen 把合法空 cursor 误判为不完整 replacement.
  - 保留并行 Phase 17 Purge working tree changes, 并完成 root cross-check.
- 最终验证:
  - `npm test`: 5 root files / 19 tests、31 Hook/Skill tests 与 26 Web tests passed.
  - `npm run test:integration`: 9 files / 64 tests passed, 包含真实多进程 coordinator、owner crash、persisted degradation 与 loopback runtime coverage.
  - `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run docs:check` 与 `git diff --check`: passed.
  - release performance: full rebuild `10,841 ms`, warm Gallery query p95 `44.29 ms`; 12-run workflow pre-tool p95 `105.15 ms`, post-tool p95 `224.51 ms`, non-model p95 `329.66 ms`.
- 错误:
  - 首次 root format check 报告 Server lifecycle 与 Read Model 两个文件未格式化; 对 exact files 执行 Prettier 后通过.
  - 首次完整 integration 有 13 个连锁失败, 根因是合法 Empty Library 没有 `indexed_marker_ids`; Schema 初始化显式空 cursor 并增加 reopen regression 后 9 files / 62 tests passed.
  - 首次 `rebuild.ts` 大补丁与当前返回结构不匹配, 整体未应用; 拆分为 coordinator import、rebuild wrapper 与 catch-up result 小补丁.
  - 首次 Phase 18 多进程测试有 3 个 fixture failure: pending Promise 未保持 holder process 存活、guard 在 lock release 后清理产生 false overlap、一个断言错误要求 optional field 等于 `undefined`; 使用真实 timer handle、pre-release cleanup 与正确断言后 3 tests passed.
  - Focused integration 在默认 sandbox 内的既有 client-abort test 无法绑定 loopback listener; scoped outside-sandbox 同命令重跑后 4 files / 30 tests passed.

### Phase 19: Generation Platform Provenance

- **Status:** completed
- 已完成:
  - format `1` Generation Schema 增加 optional `platform`, 当前 shared OpenAI Writer 在成功、失败和中断终态固定写入 `openai`; Tool、Model 和 Parameters 保持独立.
  - Read model Schema 升级到 version `2`, shared Marker projection 区分 `recorded`, `legacy_inferred` 与 `unknown`; incremental catch-up 和 full rebuild 不修改旧 Archive.
  - API、Creation Timeline 与 Generation Detail 展示 OpenAI、legacy inferred OpenAI 或 Unknown, 并保留原 invocation fields.
  - 增加 legacy valid fixture、Schema/Writer/CLI/read-model/Web/browser regressions、ADR 0014, 并同步 Skill contract、formal docs、task plan 与 findings.
- 最终验证:
  - `npm test`: 6 root files / 21 tests、31 Hook/Skill tests 与 13 Web files / 28 tests passed.
  - `npm run test:integration`: 9 files / 65 tests passed.
  - `npm run test:e2e`: 13 passed, 1 intentional WebKit mutation skip; recorded 与 legacy-inferred Platform 断言和更新后的 Creation visual baselines passed.
  - `npm run build`, `npm run lint`, `npm run typecheck`, `npm run fixtures:validate` 与 `git diff --check`: passed.
  - `npm run docs:check` 完成全部扫描后只报告 Multica 自动管理的 `AGENTS.md` runtime block 中 1 个中文标点和 4 个非文件 mention/example links; 本阶段正式文档没有 diagnostics.
  - Root `npm run format:check` 只报告 Multica runtime-owned `.agent_context/issue_context.md`, `.multica/daemon_task_context.json`, `.multica/project/resources.json` 与 `AGENTS.md`; 对本阶段 exact files 的 Prettier check passed.
- 错误:
  - Read-model Schema version 从 `1` 升到 `2` 后, Phase 18 multi-process test worker 的 usability probe 仍硬编码 `"1"`, 导致四个 holder 都被错误计入 rebuild; 改为复用 `READ_MODEL_VERSION` 后 focused 3 tests 与完整 65 integration tests passed.
  - Legacy fixture 初次挂到既有 E2E Creation, 增加了第三个 Revision 和 Timeline item; 改为独立无 Output Creation 后既保留兼容 fixture, 又恢复原 provenance 用例.
  - 首次 legacy browser navigation 缺少 mutable Prompt Draft, Creation API 返回 `ENOENT`; 补齐 fixture Draft metadata 后 Chromium 与 WebKit provenance tests passed.
  - Platform 文案改变 Creation screenshot; 检查差异仅来自预期 UI 后更新 Chromium 与 WebKit baselines.

## Test Results

| Test                                | Expected                                                                            | Actual                                                                                         | Status |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| Clean install                       | Lockfile can reproduce dependencies                                                 | `npm ci` installed 397 packages                                                                | pass   |
| Dependency audit                    | No known registry advisories                                                        | 0 vulnerabilities across 480 dependencies                                                      | pass   |
| Root build                          | Every production module compiles                                                    | API contract、Archive、read model、CLI、Server and 57-module Web build passed                  | pass   |
| Static quality                      | TypeScript、ESLint and Prettier are clean                                           | `typecheck`, `lint` and `format:check` passed                                                  | pass   |
| Unit and contract                   | Hook、Skill and Web behavior is stable                                              | 5 root files / 19 tests, 31 Hook/Skill tests and 26 Web tests passed                           | pass   |
| Integration                         | Archive、read model、HTTP security and daemon lifecycle pass                        | 9 files, 64 tests passed                                                                       | pass   |
| Browser E2E                         | Chromium and WebKit cover the accepted UI slice and desktop visual baselines        | 13 passed, 1 intentional WebKit mutation skip; Gallery 1024 and Creation 1440 snapshots passed | pass   |
| Warm thumbnail                      | First screen is interactive within 2 seconds                                        | Chromium 991 ms, WebKit 1.9 s                                                                  | pass   |
| Full-scale rebuild                  | 2,000 / 30,000 / 10,000 rebuild <= 60 s                                             | 10,841 ms                                                                                      | pass   |
| Warm Gallery query                  | p95 <= 200 ms                                                                       | 44.29 ms across 100 queries                                                                    | pass   |
| Fixture validation                  | Legal and illegal fixtures match expectations                                       | 2 of 2 matched                                                                                 | pass   |
| External Library                    | Resolver、Generation、Commit、validate and index rebuild work outside repo          | Temporary external Library reached lagCount 0 and full validation passed                       | pass   |
| Generation workflow                 | 12 deterministic runs satisfy the repository non-model budget                       | pre-tool p95 105.15 ms, post-tool p95 224.51 ms, non-model p95 329.66 ms                       | pass   |
| Documentation structural validation | Links, JSON fences, frontmatter, ADR sequence, punctuation and whitespace are valid | 36 Markdown files and 13 ADRs passed                                                           | pass   |
| Library selection and merge         | Config persistence、dry-run、atomic apply、conflict and recovery are correct        | Archive and read model integration coverage passed                                             | pass   |

## Error Log

| Timestamp  | Error                                                                | Attempt | Resolution                                                        |
| ---------- | -------------------------------------------------------------------- | ------: | ----------------------------------------------------------------- |
| 2026-08-02 | DNS resolution failed while fetching the Codex manual in the sandbox |       1 | Re-ran with approved network access                               |
| 2026-08-02 | Initial Markdown prose violated the required document language       |       1 | Rewrote existing glossary and ADR content in Simplified Chinese   |
| 2026-08-02 | Documentation patch failed because section markers were malformed    |       1 | Split the patch into smaller valid sections                       |
| 2026-08-02 | Cross-file documentation patch used the wrong hunk context           |       1 | Split updates by target file and validated each context           |
| 2026-08-02 | `tsx` IPC socket was denied by the Codex sandbox                     |       1 | Re-ran scoped CLI and E2E commands with explicit approval         |
| 2026-08-02 | Initial npm audit found vulnerable static and image packages         |       1 | Upgraded packages; final registry audit reports zero issues       |
| 2026-08-02 | SPA route returned `INVALID_SESSION` before bootstrap                |       1 | Required tokens only for protected API routes                     |
| 2026-08-02 | Full-scale FTS test exceeded timeout due repeated subqueries         |       1 | Materialized one FTS hit set; p95 dropped to 51.92 ms             |
| 2026-08-02 | Gallery query raced with read model rebuild                          |       1 | Kept old snapshot live until replacement opened and swapped       |
| 2026-08-02 | Server workspace production build crossed its `rootDir`              |       1 | Added project references and included Server in root build        |
| 2026-08-02 | WebKit omitted ordinary links from default macOS Tab focus ring      |       1 | Split browser-independent activation from Chromium Tab ordering   |
| 2026-08-03 | Server build emitted JavaScript and declarations into package source |       1 | Removed exact generated artifacts and corrected project refs      |
| 2026-08-03 | Documentation check traversed nested dependency and eval workspaces  |       1 | Excluded generated and dependency directories from traversal      |
| 2026-08-03 | Strict Skill eval assertions required real execution evidence        |       1 | Kept offline scores at zero and documented a future fake harness  |
| 2026-08-03 | Web test used an unavailable `jest-dom` matcher                      |       1 | Replaced it with existing Chai assertions                         |
| 2026-08-03 | Playwright server could not create a `tsx` IPC socket in the sandbox |       1 | Re-ran the E2E suite with scoped approval                         |
| 2026-08-03 | Archive adapter factory bypassed initialization diagnostics          |       1 | Removed its eager manifest read and added a factory test          |
| 2026-08-03 | Server workspace `cwd` resolved `apps/server/library`                |       1 | Resolve the nearest Git root before Library configuration         |
| 2026-08-03 | Unit runner excluded Archive integration files                       |       1 | Used the repository integration runner for filesystem coverage    |
| 2026-08-03 | Read Model treated random Marker UUID order as commit order          |       1 | Sort validated Markers by `createdAt` before rebuild and status   |
| 2026-08-03 | Temporary-directory CLI smoke could not resolve workspace `tsx`      |       1 | Exercised the CLI entrypoint in-process from integration tests    |
| 2026-08-03 | Playwright browser binaries were not installed                       |       1 | Installed the pinned Chromium and WebKit binaries                 |
| 2026-08-03 | Browser processes aborted inside the filesystem sandbox              |       1 | Re-ran E2E with scoped outside-sandbox execution; 11 passed       |
| 2026-08-03 | E2E server still constructed the removed static Library dependencies |       1 | Updated it to use `LibraryRuntime`; the complete E2E suite passed |
| 2026-08-04 | Direct workspace test excluded read model integration files          |       1 | Used the root integration Vitest config with the exact test path  |
| 2026-08-04 | Playwright browser launch was denied by the macOS sandbox            |       1 | Re-ran the scoped browser suite outside the sandbox               |
| 2026-08-04 | E2E Prompt Compare assertion used the removed hidden label           |       1 | Asserted visible `Compare` and reran Chromium and WebKit          |

## 5-Question Reboot Check

| Question             | Answer                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Where am I?          | Phase 17 core Purge vertical slice implemented and focused tests passing; hardening remains pending         |
| Where am I going?    | Add async maintenance progress, complete failpoint/security coverage, then run root verification            |
| What is the goal?    | Add safe, irreversible single-target Creation and Image Asset Purge to the local Asset Library              |
| What have I learned? | See `findings.md`                                                                                           |
| What have I done?    | Landed domain, schemas, shared replacement writer, CLI, API, Web Danger Zones and focused integration tests |
