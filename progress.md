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

## Test Results

| Test                                | Expected                                                                            | Actual                                                                                         | Status |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| Clean install                       | Lockfile can reproduce dependencies                                                 | `npm ci` installed 397 packages                                                                | pass   |
| Dependency audit                    | No known registry advisories                                                        | 0 vulnerabilities across 480 dependencies                                                      | pass   |
| Root build                          | Every production module compiles                                                    | API contract、Archive、read model、CLI、Server and 53-module Web build passed                  | pass   |
| Static quality                      | TypeScript、ESLint and Prettier are clean                                           | `typecheck`, `lint` and `format:check` passed                                                  | pass   |
| Unit and contract                   | Hook、Skill and Web behavior is stable                                              | 29 Hook/Skill tests and 23 Web tests passed                                                    | pass   |
| Integration                         | Archive、read model and HTTP security pass                                          | 4 files, 34 tests passed                                                                       | pass   |
| Browser E2E                         | Chromium and WebKit cover the accepted UI slice and desktop visual baselines        | 13 passed, 1 intentional WebKit mutation skip; Gallery 1024 and Creation 1440 snapshots passed | pass   |
| Warm thumbnail                      | First screen is interactive within 2 seconds                                        | Chromium 991 ms, WebKit 1.9 s                                                                  | pass   |
| Full-scale rebuild                  | 2,000 / 30,000 / 10,000 rebuild <= 60 s                                             | 12,326 ms                                                                                      | pass   |
| Warm Gallery query                  | p95 <= 200 ms                                                                       | 51.92 ms across 100 queries                                                                    | pass   |
| Fixture validation                  | Legal and illegal fixtures match expectations                                       | 2 of 2 matched                                                                                 | pass   |
| External Library                    | Resolver、Generation、Commit、validate and index rebuild work outside repo          | Temporary external Library reached lagCount 0 and full validation passed                       | pass   |
| Documentation structural validation | Links, JSON fences, frontmatter, ADR sequence, punctuation and whitespace are valid | 33 Markdown files and 11 ADRs passed                                                           | pass   |
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

## 5-Question Reboot Check

| Question             | Answer                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Where am I?          | Phase 12 completed                                                                                      |
| Where am I going?    | Publish the end-user guide and visual documentation                                                     |
| What is the goal?    | Build a documented local Asset Library, Codex generation workflow, and Web UI                           |
| What have I learned? | See `findings.md`                                                                                       |
| What have I done?    | Added the end-user guide, generated overview image, real Web UI screenshots, navigation, and validation |
