# 发现与决策

## Requirements

- Codex 通过仓库级 Skill 调用图片生成能力并归档结果.
- Web UI 只依赖本地 Asset Library, 展示图片、Prompt、参考图与关联历史.
- Prompt 支持 Draft、不可变 Revision、变更说明与单父节点分支.
- Image Asset 内容寻址并允许跨 Creation 复用.
- Archive 不可变, Curation 可变, SQLite 仅是可重建 read model.
- 项目启用仓库级 Hook, 不修改全局 Codex 配置.
- 完整设计、研发、验证和演进文档必须持续落盘.
- 根目录必须提供 `README.md` 与 `AGENTS.md`, 后者描述全部文档路径和规范.
- MVP 必须交付从 Creation 准备、Codex Skill 生成、原子归档到 Web UI 浏览与恢复的完整闭环.

## Confirmed Decisions

- 项目采用 TypeScript monorepo, 包含 client-rendered Web UI、本地服务、CLI 与共享 packages.
- Web UI 使用 React + TypeScript + Vite, 本地服务使用 Fastify + TypeScript.
- SQLite read model 使用隔离的 Node.js 24 `node:sqlite` adapter.
- 文件系统是事实来源.
- Creation 是创作线聚合, Image Asset 是 Asset Library 级实体.
- Generation 等于一次工具调用, Replay 是 best-effort 新调用.
- Reference Image 用途记录在 Generation 关系上, 使用多选 `roles` 与可选 `guidance`.
- Creation 的 Curation 状态只使用可逆的 `active | shelved`.
- Archive 使用 JSON 元数据与 Markdown Prompt 正文.
- Generation 通过 `.staging/`、校验和原子 rename 提交.
- 中断事务按阶段显式恢复, 不自动重试; 无法验证的事务进入 `.quarantine/`.
- Archive 使用 append-only Commit Marker 作为跨目录事务的唯一逻辑可见性边界.
- 源码与正式文档进入 Git, Asset Library 整体忽略; 默认路径为 `./library/`, 可由本机配置或启动参数覆盖, 单进程只打开一个 Library.
- Asset Library 可以位于仓库外的任意本地目录; 路径优先级为 CLI 参数、本机忽略配置、仓库默认配置, 相对路径始终以 Git root 解析.
- Versioned JSON Schema、最小合法 fixtures、初始化器和迁移器进入 Git; `assetctl init` 根据契约创建运行时 Library.
- 多个生成可以并行, Archive 最终提交使用短时全局锁.
- 普通 mutation 不物理删除 Archive 内容; Phase 17 新增显式、不可恢复且经过两阶段确认的 Creation Purge 与 Image Asset Purge.
- Web UI 默认使用 Image Asset 图片网格, Creation 是二级组织与历史视图.
- 第一版使用 SQLite 全文搜索和结构化过滤, 不实现语义或视觉相似度搜索.
- Web UI 不直接启动 Codex 或图片生成; 用户必须在 Codex 中显式调用仓库级 Skill.
- MVP 不包含多用户、远程访问、云同步、批量或级联 Purge、自动 garbage collection、语义搜索、实时协作、批量调度或桌面封装.
- MVP 正式支持 macOS, Linux 为 best-effort, Windows 不支持; 实现仍避免不必要的 OS-specific 逻辑.
- MVP 验收覆盖 Archive 不变量、故障注入、并发提交、Skill 与 Hook、Web UI 安全、规模基准和文档一致性.
- Library root、manifest 或权限缺失统一为 Library Unavailable, 不等同于 Archive corruption 或 Index failure; Server 不自动创建 Library 或 fallback path.
- 显式 `assetctl init --library` 成功后持久化 canonical absolute path 到 Git root 的 `text-to-image.local.json`; 初始化失败或没有显式 `--library` 时不改写选择.
- 已存在 Library 通过 `assetctl library select --library` 接入, 命令只在 full validation 通过后更新本机配置, 不修改 Archive.
- Library Merge 使用 `assetctl library merge --source`, current Library 是 destination; `--library` 仍只覆盖 destination resolver.
- Library Merge 导入 source 的 committed immutable graph, 复用相同 bytes 或 image hash, 拒绝相同 UUID 不同内容; 已存在实体的 Curation 与 Draft 保留 destination 值.
- Library Merge 使用 staging、destination lock 与单一 `merge_library` Commit Marker 发布, 支持无写入 `--dry-run`; source 保持只读并在提交前进行 optimistic snapshot recheck.
- Library Merge 不导入 `inbox/`、cache、SQLite、thumbnail 或 recovery state, 也不持久化 source provenance metadata.
- Gallery 图片网格保持 Image Asset-only, Generation Issue 使用网格上方独立 region.
- 每个 active Creation 最多显示一个 Generation Issue, 只由最新 Generation 的终态决定; `shelved` Creation 不进入该区域.
- Safety Rejection 使用 `IMAGE_GENERATION_SAFETY_REJECTED` 和 optional `moderation.stage | categories`; output-stage rejection 不构成 Prompt violation 判定.
- Safety guidance 只使用 category-level 建议, 不推断或高亮具体触发词; 恢复路径为 Review Prompt、编辑 Draft、显式创建新 Generation.
- 当前 development Library 没有历史兼容负担. Safety Rejection contract 直接更新 format `1`, 不实现 migration、旧 reader compatibility 或 ADR; 必要时整体重新初始化 runtime Library.
- 会话中插入的图片使用 `Session Image` 描述; 它不是 Reference Image, 必须先物化原始 bytes 并导入当前 Asset Library.
- 明确生成请求授权 Skill 自动执行独立 `import_asset` 事务. 导入成功而后续生成失败时保留已提交 Image Asset.
- Reference roles 只根据用户明确措辞解析; 语义不足时询问, 不从图片内容猜测或设置隐式默认值.
- 多张 Session Image 使用 all-or-nothing Generation input: 全部预检成功后才导入, 任一失败时不准备 Generation 或调用图片工具.
- 只有 opaque session handle 且宿主无法提供原始 bytes 或本地路径时 fail closed; `image_gen` 能消费会话上下文不等于 Archive 能取得可持久化输入.
- 本次实际 Session Image path 可读取, source inspection 识别为 JPEG `1080x1080`, SHA-256 为 `35ebe9964144d179861de28cb797dff07f54d7fb56f87af41511cd9ebd2e9574`; 原错误属于会话 ingress 误分类, 不是 source missing.
- `asset inspect` 可以在目标 Library 尚不存在时保持无副作用, 因为它只解析和检查 source; Library validation 仍由 Generation Skill 的固定 preflight root 负责.
- Settings 显示 resolved absolute Library path 并允许输入目标路径; Server 不提供通用 filesystem directory listing 或文件读取 endpoint.
- Web initialize、select 与 Retry 使用 single async transition; candidate full validation 与 Index rebuild 位于切换临界区外, transition 提供 monotonic stage/count progress.
- Transition commit 排空旧 Library 请求, 原子持久化 canonical path, 替换唯一 active context 并轮换 session token; 其他 tab 必须重新 bootstrap.
- 外部恢复原路径后必须显式 Retry. 初始化成功但后续切换失败时保留 detached Library, 不自动删除, 旧 context 与持久化选择不变.
- Stop Hook 对 `ARCHIVE_NOT_INITIALIZED` 允许结束并指向 Web Settings; 只有现存 Library 的真实完整性失败继续阻断.
- Browser-facing listener 支持 `--host <ip>`, 接受具体 IPv4、IPv6、`0.0.0.0` 与 `::`, 但不接受 hostname.
- `--host` 同时适用于 production-like `npm start` 与 hot-reload `npm run dev`; 开发模式只暴露 Vite listener, Fastify proxy target 保持 loopback.
- Listen host precedence 是 CLI `--host`、`TEXT_TO_IMAGE_HOST`、默认 `127.0.0.1`.
- Wildcard bind 在启动时枚举 active interfaces, 输出 concrete URLs, 并只允许对应 IP literal 的 `Host` 与 `Origin`; interface 变化后需要重启.
- Non-loopback listener 只用于 trusted LAN, 保留现有 session token, 不增加 access secret、TLS 或公网支持.

## Phase 8 Implementation Findings

- `packages/archive/src/generation.ts` 原先在 commit 时从 staged Prompt Revision 读取 effective Prompt 并覆盖 `prompt-draft.md`; 这会把用户中文 Draft 替换成工具构造的英文. 正确边界是保留 Draft 正文和语言, 只在 hash 未变化时更新 `basedOnRevisionId`.
- Generation Issue 的安全信息必须在 Archive boundary 做 bounded validation, 在 read model/API 中 typed projection, 在 Web UI 中忽略未知 provider fields. 旧的 `{ code, summary, retryable }` records 仍显示摘要, 不要求补写 moderation.
- Latest Issue 查询以 active Creation 的最新 Generation 为窗口分区; succeeded 会移除全局 Issue, shelved Creation 不进入 Gallery region, 失败历史仍保留在 Creation Timeline.
- Web UI 的可读性问题不是单个颜色值或字号修补. Compact Editorial Workspace 需要固定 200 px sidebar、紧凑 header、统一 14 px body / 11 px metadata floor、260-320 px inspector 和独立深色 sidebar tokens; mobile drawer 不在当前 desktop scope.

## Phase 10 Implementation Findings

- Production-like runtime 只有 Fastify listener; development runtime 的 Browser-facing listener 是 Vite, Fastify 只需要作为 loopback proxy target. 两种模式必须共享同一个 `--host` 用户语义, 但不能机械地暴露 development Fastify port.
- Wildcard bind 返回的 address 不能直接作为 Browser URL 或 exact Host allowlist. Server 必须在实际 port 已知后枚举对应 address family 的 active interfaces, 格式化 IPv6 bracket host, 再注册允许的 IP literal.
- 现有 config 只允许 `TEXT_TO_IMAGE_HOST=127.0.0.1`, 且 development Origin 只有单值. 实现需要把 listen host parsing 与 endpoint discovery 提取为可单测的纯边界, 同时保留原环境变量兼容入口.
- macOS `networkInterfaces()` 会返回需要 zone identifier 的 scoped IPv6 link-local address. 缺少 zone 的 Browser URL 不可用, 因而 wildcard discovery 只发布 `scopeid = 0` 的 IPv6 address.

## Phase 12 Documentation Findings

- 普通用户主路径必须明确分开两个操作面: Codex 负责显式生成和归档, Web UI 负责 Draft 编辑, 历史比较, provenance 查看和 Curation.
- `Files mentioned` 是会话呈现, 不是持久输入契约. 只有宿主同时提供可读取本地路径或原始 bytes 时, Session Image 才能导入 Library 并成为 Reference Image.
- 参考图教学不能只说明如何附图. 用户还必须明确 `subject`, `style`, `composition`, `palette` 或带 guidance 的 `other`, 否则系统不应猜测用途.
- 面向用户的 Prompt 迭代应围绕单变量 change instruction, immutable Revision, independent Generation, Restore to Draft 和 explicit replay 展开, 避免把随机 variant 与 Prompt 修改混为一谈.
- 正式 Web UI 截图不应泄漏用户运行时 Library. 使用通过共享 writer 构建并完整校验的临时合成 Library, 可以同时保留真实界面和真实 provenance 关系.

## Phase 15 Implementation Findings

- Archive 与 Creation API 已包含 `Generation.promptRevisionId` 和每次调用的 `references`; Prompt History 与 Timeline 不可互查的根因是 UI 没有消费现有关系, 不是 provenance 缺失.
- Reference Image 属于 Generation usage, 不能直接挂到 Prompt Revision. 同一 Revision 可以没有 Generation, 也可以被多次调用并使用不同 Reference Images.
- Image Detail 的 existing used-as-reference relation 缺少 `promptRevisionId`; 该字段可以从 rebuildable Generation read model 派生, 无需修改 Archive Schema 或写入协议.
- 现有 Creation route 已支持 query-aware browser location. 使用 `revision` 与 `generation` 参数即可实现 refresh、copy、back/forward 与详情页返回, 无需新增 Prompt Revision route 或 router dependency.
- Prompt Compare 的双选状态与 provenance Focus 是不同用户意图. 共用 checkbox 会让多选后的 Timeline target 含糊, 因而必须保留独立控件与 accessible state.

## Phase 16 Implementation Findings

- mise task runner 本身不提供 detached process、PID 或 stop/status lifecycle. `mise.toml` 应保持 npm-backed 薄封装, daemon lifecycle 由单一 project script 负责.
- mise `[env] _.file` 会让文件值覆盖已有 shell environment, 与确认的 precedence 相反. Node.js 24 `--env-file-if-exists` 保持 shell environment 优先, 且缺失文件不阻断启动.
- Vite build 与 dev server 都加载 `vite.config.ts`. development-only port validation 必须按 Vite `command` 隔离, 否则合法 production-like port `0` 会错误阻断 Web build.
- detached Server 不能只用 PID 判定 owner, 否则 stale metadata 遇到 PID reuse 可能向无关进程发送信号. 唯一 `argv0` process identity 与 PID liveness 共同校验后才能执行 stop.
- daemon readiness 必须来自真实 Server entrypoint. Parent-child IPC 可以在不增加公开 HTTP contract 或 readiness file 的情况下传递 PID 与 concrete URLs.
- daemon 的 test runtime directory 必须由 test-owned temp root 注入, 避免测试读取、停止或删除开发者当前 `.runtime/daemon/`.

## Phase 17 Purge Design Findings

- Creation 的私有历史与 Library 级 Image Asset 必须分开删除. Creation Purge 删除身份、Draft、Curation、Revision、Generation 与关系, 但不级联删除任何 Image Asset.
- Image Asset Purge 必须从权威 Generation graph 枚举全部 Output 与 Reference blocker. References 是存续 usage 的派生视图, 不是“曾经引用”的永久历史.
- 现有 Commit Marker 直接要求 listed path 存在且 digest 匹配, 因此原地删除会产生可见 corruption window. verified replacement 先构建并完整校验 surviving Library, 再进入不可逆 Cutover.
- 完整物理删除与永久 tombstone 冲突. 本阶段选择完成态不保留目标 identity, 接受显式 Library Merge 可以重新引入相同 identity 或 content.
- Cutover 前可以清理 candidate 并保持 original Library; Cutover 后不得 rollback 到包含目标的 retired root, restart recovery 只能 roll forward.
- `inbox/` 是用户直接管理的输入区, 不具备受控资产所有权. Image Asset Purge 可以报告 exact-content match, 但不能自动删除 Inbox 或外部 source.
- staging 与 quarantine 默认保留 recovery evidence. Purge 只有在 dry-run 列出 exact transaction 且用户二次确认 Recovery Evidence Abandonment 后才能清除; live owner 不能绕过.
- Purge Plan 使用单目标、whole-snapshot digest、显式 boolean confirmation 与 execute-time recheck, 避免 TOCTOU 和无上下文批量误删. 手动输入 Creation UUID 或 Image Asset SHA-256 不提供额外完整性保证, 因而由常规最终确认对话框和 CLI `--confirm` 取代.
- 完成态 Library 继续符合 format `1`; Purge Plan 与 durable journal 使用独立临时 Schema, 不增加永久 Archive record kind 或 Commit Marker operation.
- Fastify `onResponse` 只覆盖 response 已发送的终止路径. Client abort 或 socket timeout 可能绕过该 hook; Library request lease 必须同时跟踪 handler completion 与 response closure, 并在两者都成立后幂等释放.
- Purge drain 不能无限等待 active request. 30 秒 deadline 在 journal 创建前返回 `LIBRARY_DRAIN_TIMEOUT`, 因而不会触碰 active Library, 同时避免 Web 永久停留在 maintenance 提示.

## Phase 18 Read Model Coordination Findings

- 多个 Generation process 会分别创建 `ReadModel`; `#catchUpPromise` 与 `#rebuildPromise` 只约束单个实例, 不能阻止跨进程 writer 同时操作 `.cache/index.sqlite`.
- 增量 catch-up 使用 `BEGIN IMMEDIATE`, full rebuild 则 rename replacement 到同一主文件. 在其他进程仍持有旧主文件及其 WAL/SHM 时替换主文件, 会造成短暂主库与 WAL generation 不一致并触发 `database disk image is malformed`.
- 独立 `.cache/index-writer.sqlite` 可以通过 SQLite transaction 提供 OS-managed cross-process lock. Owner crash 时 kernel 自动释放锁, 不需要不安全的 PID、mtime 或 stale lock deletion heuristics.
- Node.js 24 `DatabaseSync` constructor 支持 busy `timeout`, `database.isTransaction` 可以确认 transaction state. 当前 runtime 的 busy error 为 `code=ERR_SQLITE_ERROR`, `errcode=5`, `errstr=database is locked`.
- Coordinator 应使用短 SQLite timeout 加 async backoff, 避免在 Server process 内同步阻塞 event loop 达 8 秒. Production 总等待上限固定为 8 秒, tests 通过内部 option 缩短.
- 只串行化 writers 仍不足以让 WAL main-file replacement 安全, 因为其他 process 可以继续持有旧 reader 与旧 WAL/SHM. Read model 改用 `DELETE` journal mode 后, rebuild replacement 只发布单个主文件, 旧 reader 继续使用旧 inode.
- CLI 中的 degradation 不能直接被长期 Server process 观察. `.cache/index-degradation.json` 原子保存 stable code、bounded error 与 timestamp, successful catch-up/rebuild 清除; Server 只在 Marker 仍 lagging 时把它映射为 bounded health diagnostic.
- Empty Library 没有 `last_indexed_marker`, 但仍必须持久化 `indexed_marker_ids = []`. Reopen validation 依赖显式空 cursor 区分合法空 index 与不完整 replacement.
- 获锁后必须重新打开 index 并重新读取 Marker cursor. Lock contention、Archive corruption 与 rebuildable SQLite corruption 必须使用不同稳定 reason code, 且 contention 不能触发 rebuild.
- 已提交 transaction 的 `.staging/` 目录不是 recovery evidence, Purge blocker 扫描必须用 Commit Marker 排除它们.
- Purge 必须复用现有 `archive.lock`; 另建 lock 无法排除共享 writer. Durable sibling journal 还必须让所有 writer 在 maintenance 期间 fail closed.
- macOS sibling containment 需要比较 parent `realpath`, 否则 `/var` 与 `/private/var` 会被误判为越界.
- 两次 rename 与 journal 更新之间存在真实 crash window. Recovery 不能只信 phase, 还必须核对 active、candidate 与 retired exact path 的存在组合, 并在 cutover 已开始时 roll forward.

## Research Findings

- Codex 官方手册说明 `AGENTS.md` 是持久仓库指令, 仓库内较近层级覆盖较远层级.
- Codex 官方手册说明 repo-scoped Skill 位于 `.agents/skills/`.
- 项目级 Hook 可以在工具调用前阻断操作, 但需要项目信任和 Hook 审核.
- 项目级 Hook 只执行事前阻断和结束前只读校验, 不承担任何资产写入或自动修复.
- Context7 返回的 Vite 官方资料确认, 当前标准模板直接支持 React + TypeScript, 并以 `tsc -b && vite build` 作为生产构建基础.
- Context7 返回的 Fastify 官方资料确认, 当前版本支持 TypeScript typed routes、JSON Schema validation、Schema type providers 与官方静态文件插件.
- Context7 返回的 Node.js 24 官方资料显示, 内置 `node:sqlite` 已默认可用并提供同步 API, 但稳定性仍标记为 release candidate.
- Revision、Generation 与全局 Image Asset 位于不同目标目录, 文件系统无法通过一次 rename 物理原子发布所有记录; 需要单一 visibility boundary.
- 正式目录 Schema 需要明确 Asset Library 与 Git 的关系; 大型 Image Asset 不应在没有明确策略时进入源码历史.
- UI/UX 数据库建议 generative art gallery 使用 content-first minimal frame、masonry grid、neutral canvas 与 dark mode.
- 图库高优先级 UX 约束包括缩略图、lazy loading、超过 300 ms 的 loading feedback、键盘导航、focus 管理和可恢复的 no-results state.
- 本地应用不使用远程 Google Fonts; 采用系统 font stack 保证离线启动. Masonry-like grid 必须保持 DOM 与键盘阅读顺序.
- 当前 built-in image generation 默认把输出保存在 `$CODEX_HOME/generated_images/...`, 不接受项目 destination-path contract; Generation Skill 必须先生成再 capture 到 Library staging.
- MVP Generation Workflow 只使用 built-in generate mode; edit、CLI fallback 和透明背景后处理需要未来扩展 provenance model.
- Context7 返回的 npm 官方资料确认 root `workspaces` 与 `-w` 可以管理和定向执行 monorepo packages.
- Context7 返回的 Vitest 官方资料确认其原生支持 TypeScript、fake timers、reporters 与 coverage.
- Context7 返回的 Playwright 官方资料确认其支持动态本地服务端口、screenshots 和 trace artifacts.
- 当前 npm audit 曾识别旧版 `@fastify/static` 与 Sharp 的已知漏洞范围; 升级到 `@fastify/static` 10.1.2 与 Sharp 0.35.3 后, 2026-08-02 的 registry audit 为 0 vulnerabilities.
- SPA shell 与静态资源必须在 session bootstrap 前可读取; rotating token 只保护 `/api/` 下的非公开 routes, `Host` 与 `Origin` 校验仍覆盖全部请求.
- 在完整规模数据集上, 把多个 FTS5 `MATCH` subquery 直接放入 Gallery 的 `OR` 条件会触发重复求值计划. 使用 `AS MATERIALIZED` 固定一次命中集后, 同一语义恢复到目标延迟范围.
- Read model rebuild 不能先关闭当前 connection. 新 SQLite 文件必须完成构建并成功打开后再 swap, 从而让并发 Gallery 请求持续读取旧快照.
- TypeScript workspace 的 root no-emit typecheck 不等价于 package production build. Server 必须声明 project references, root build 必须显式覆盖 API contract、Archive、read model、CLI、Server 与 Web.
- macOS WebKit 的默认 Tab focus ring 受系统 Full Keyboard Access 偏好影响. 自动化在 Chromium 验证 Tab 顺序, 在 WebKit 显式 focus 后验证同一 skip-link 的 keyboard activation.
- Read Model 在验证 manifest 前创建 `.cache` 会把不存在的配置路径变成不完整 Library. manifest presence check 必须位于任何 SQLite 或 cache 写入之前, Server setup mode 不能调用 read model open/rebuild.
- Initialization mode 必须从真实 process entrypoint 验证. 只测试 `createApp` 会遗漏 factory eager-read; npm workspace 还会把 process `cwd` 改为 workspace 目录, 因而 Server 默认路径必须通过 `.git` 向上解析, 不能直接使用 `process.cwd()`.
- Commit Marker 文件名是随机 UUID, 不能代表提交顺序. Read Model 必须按 Marker `createdAt` 排序, 并在启动时检测 marker lag 后从文件系统重建.
- Browser E2E 在受限文件系统沙箱内会因 Chromium 与 WebKit 进程启动失败而产生全量假失败; 相同 suite 在 scoped outside-sandbox execution 中通过.
- Context7 返回的 Vite 7.3.1 官方资料确认 `vite --host 0.0.0.0` 是受支持的 CLI contract, `server.host` 接受 wildcard, 且 `server.proxy` 可以继续把 `/api` 转发到独立 loopback target.

## Resources

- https://learn.chatgpt.com/docs/agent-configuration/agents-md.md
- https://learn.chatgpt.com/docs/build-skills.md
- https://learn.chatgpt.com/docs/hooks.md
- https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts
- https://github.com/fastify/fastify/blob/main/docs/Reference/Type-Providers.md
- https://github.com/fastify/fastify/blob/main/docs/Reference/TypeScript.md
- https://nodejs.org/docs/latest-v24.x/api/sqlite.html
- https://github.com/npm/cli/blob/latest/docs/lib/content/using-npm/workspaces.md
- https://github.com/vitest-dev/vitest/tree/main/docs
- https://github.com/microsoft/playwright/tree/main/docs/src
- `CONTEXT.md`
- `docs/adr/`
