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

## Test Results

| Test                                | Expected                                                                            | Actual                                                                        | Status |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Clean install                       | Lockfile can reproduce dependencies                                                 | `npm ci` installed 397 packages                                               | pass   |
| Dependency audit                    | No known registry advisories                                                        | 0 vulnerabilities across 480 dependencies                                     | pass   |
| Root build                          | Every production module compiles                                                    | API contract、Archive、read model、CLI、Server and 53-module Web build passed | pass   |
| Static quality                      | TypeScript、ESLint and Prettier are clean                                           | `typecheck`, `lint` and `format:check` passed                                 | pass   |
| Unit and contract                   | Hook、Skill and Web behavior is stable                                              | 27 Hook/Skill tests and 14 Web tests passed                                   | pass   |
| Integration                         | Archive、read model and HTTP security pass                                          | 3 files, 17 tests passed                                                      | pass   |
| Browser E2E                         | Chromium and WebKit cover the accepted UI slice                                     | 11 passed, 1 intentional WebKit mutation skip                                 | pass   |
| Warm thumbnail                      | First screen is interactive within 2 seconds                                        | Chromium 655 ms, WebKit 1.4 s                                                 | pass   |
| Full-scale rebuild                  | 2,000 / 30,000 / 10,000 rebuild <= 60 s                                             | 12,326 ms                                                                     | pass   |
| Warm Gallery query                  | p95 <= 200 ms                                                                       | 51.92 ms across 100 queries                                                   | pass   |
| Fixture validation                  | Legal and illegal fixtures match expectations                                       | 2 of 2 matched                                                                | pass   |
| External Library                    | Resolver、Generation、Commit、validate and index rebuild work outside repo          | Temporary external Library reached lagCount 0 and full validation passed      | pass   |
| Documentation structural validation | Links、JSON fences、frontmatter、ADR sequence、punctuation and whitespace are valid | 30 Markdown files and 9 ADRs passed                                           | pass   |

## Error Log

| Timestamp  | Error                                                                | Attempt | Resolution                                                       |
| ---------- | -------------------------------------------------------------------- | ------: | ---------------------------------------------------------------- |
| 2026-08-02 | DNS resolution failed while fetching the Codex manual in the sandbox |       1 | Re-ran with approved network access                              |
| 2026-08-02 | Initial Markdown prose violated the required document language       |       1 | Rewrote existing glossary and ADR content in Simplified Chinese  |
| 2026-08-02 | Documentation patch failed because section markers were malformed    |       1 | Split the patch into smaller valid sections                      |
| 2026-08-02 | Cross-file documentation patch used the wrong hunk context           |       1 | Split updates by target file and validated each context          |
| 2026-08-02 | `tsx` IPC socket was denied by the Codex sandbox                     |       1 | Re-ran scoped CLI and E2E commands with explicit approval        |
| 2026-08-02 | Initial npm audit found vulnerable static and image packages         |       1 | Upgraded packages; final registry audit reports zero issues      |
| 2026-08-02 | SPA route returned `INVALID_SESSION` before bootstrap                |       1 | Required tokens only for protected API routes                    |
| 2026-08-02 | Full-scale FTS test exceeded timeout due repeated subqueries         |       1 | Materialized one FTS hit set; p95 dropped to 51.92 ms            |
| 2026-08-02 | Gallery query raced with read model rebuild                          |       1 | Kept old snapshot live until replacement opened and swapped      |
| 2026-08-02 | Server workspace production build crossed its `rootDir`              |       1 | Added project references and included Server in root build       |
| 2026-08-02 | WebKit omitted ordinary links from default macOS Tab focus ring      |       1 | Split browser-independent activation from Chromium Tab ordering  |
| 2026-08-03 | Server build emitted JavaScript and declarations into package source |       1 | Removed exact generated artifacts and corrected project refs     |
| 2026-08-03 | Documentation check traversed nested dependency and eval workspaces  |       1 | Excluded generated and dependency directories from traversal     |
| 2026-08-03 | Strict Skill eval assertions required real execution evidence        |       1 | Kept offline scores at zero and documented a future fake harness |

## 5-Question Reboot Check

| Question             | Answer                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| Where am I?          | Phase 5 completed                                                             |
| Where am I going?    | Final handoff                                                                 |
| What is the goal?    | Build a documented local Asset Library, Codex generation workflow, and Web UI |
| What have I learned? | See `findings.md`                                                             |
| What have I done?    | Implemented and verified the complete MVP slice                               |
