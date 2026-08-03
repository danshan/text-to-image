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
- 第一版不物理删除 Archive 内容, 仅通过 Curation 隐藏或归档.
- Web UI 默认使用 Image Asset 图片网格, Creation 是二级组织与历史视图.
- 第一版使用 SQLite 全文搜索和结构化过滤, 不实现语义或视觉相似度搜索.
- Web UI 不直接启动 Codex 或图片生成; 用户必须在 Codex 中显式调用仓库级 Skill.
- MVP 不包含多用户、远程访问、云同步、Purge、语义搜索、实时协作、批量调度或桌面封装.
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
- Settings 显示 resolved absolute Library path 并允许输入目标路径; Server 不提供通用 filesystem directory listing 或文件读取 endpoint.
- Web initialize、select 与 Retry 使用 single async transition; candidate full validation 与 Index rebuild 位于切换临界区外, transition 提供 monotonic stage/count progress.
- Transition commit 排空旧 Library 请求, 原子持久化 canonical path, 替换唯一 active context 并轮换 session token; 其他 tab 必须重新 bootstrap.
- 外部恢复原路径后必须显式 Retry. 初始化成功但后续切换失败时保留 detached Library, 不自动删除, 旧 context 与持久化选择不变.
- Stop Hook 对 `ARCHIVE_NOT_INITIALIZED` 允许结束并指向 Web Settings; 只有现存 Library 的真实完整性失败继续阻断.

## Phase 8 Implementation Findings

- `packages/archive/src/generation.ts` 原先在 commit 时从 staged Prompt Revision 读取 effective Prompt 并覆盖 `prompt-draft.md`; 这会把用户中文 Draft 替换成工具构造的英文. 正确边界是保留 Draft 正文和语言, 只在 hash 未变化时更新 `basedOnRevisionId`.
- Generation Issue 的安全信息必须在 Archive boundary 做 bounded validation, 在 read model/API 中 typed projection, 在 Web UI 中忽略未知 provider fields. 旧的 `{ code, summary, retryable }` records 仍显示摘要, 不要求补写 moderation.
- Latest Issue 查询以 active Creation 的最新 Generation 为窗口分区; succeeded 会移除全局 Issue, shelved Creation 不进入 Gallery region, 失败历史仍保留在 Creation Timeline.
- Web UI 的可读性问题不是单个颜色值或字号修补. Compact Editorial Workspace 需要固定 200 px sidebar、紧凑 header、统一 14 px body / 11 px metadata floor、260-320 px inspector 和独立深色 sidebar tokens; mobile drawer 不在当前 desktop scope.

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
