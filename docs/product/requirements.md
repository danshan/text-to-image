---
title: Product Requirements
status: accepted
owner: project
last_updated: 2026-08-04
related:
  - ../../CONTEXT.md
  - ../design/asset-library.md
  - ../design/generation-workflow.md
  - ../design/web-ui.md
  - ../adr/0010-enable-web-controlled-library-hot-switching.md
  - ../adr/0011-allow-configurable-trusted-lan-binding.md
  - ../adr/0012-keep-workflow-telemetry-out-of-the-archive.md
---

# 产品需求

## Goals

- 通过仓库级 Codex Skill 调用图片生成能力, 并按照可验证的本地文件协议归档输入、提示词历史、工具调用和图片产物.
- 通过本地 Web UI 以图片优先的方式浏览、搜索和整理 Creation、Prompt Revision、Reference Image、Generation 与 Image Asset.
- 让 Asset Library 脱离数据库和应用仍可检查、复制、备份、校验和迁移.
- 对并发、失败、中断和恢复建立明确语义, 避免出现看似成功但 provenance 不完整的历史.
- 把完整设计、实现、测试和运维文档作为持续交付物纳入 Git.

## Non-goals

- Web UI 不直接启动 Codex 或图片生成工具.
- MVP 不支持多用户、身份认证、权限模型、公网访问、云同步或移动端. 允许用户显式绑定 trusted LAN interface.
- MVP 不支持 Archive 物理删除、Purge、Git LFS 或 Library 导出包.
- MVP 不支持语义搜索、视觉相似度搜索、自动标签或图片聚类.
- MVP 不支持 Prompt 多父节点合并、实时协作或自动批量生成调度.
- MVP 不提供 Electron 或 Tauri 桌面封装.
- MVP 不承诺 Replay 产生像素级相同结果.
- MVP Generation Skill 只支持 built-in image generation 的 generate mode; CLI/API fallback、edit target、mask 和透明背景后处理不在范围内.

## Actors

**User**:
创建和整理 Creation, 编辑 Prompt Draft, 选择 Reference Image, 在 Codex 中显式调用生成 Skill, 并通过 Web UI 浏览结果.

**Codex Generation Skill**:
把 Change Instruction 和 Prompt Draft 转换为实际执行 Prompt Revision, 调用图片生成工具, 并通过共享写入器归档 Generation.

**Web UI**:
读取 Asset Library 的权威记录和 SQLite read model, 提供图库、历史、搜索、Curation 与恢复提示, 但不直接调用图片生成工具.

**Shared Writer**:
为 CLI、Skill 与本地服务提供唯一的 Archive 写入、Schema 校验、锁、事务、Commit Marker 和恢复实现.

## Use Cases

### UC-001: Initialize a Library

用户 clone 源码后, 选择默认 `./library/` 或仓库外目录, 通过 CLI 根据 versioned Schema 初始化一个空 Asset Library, 随后执行完整校验并启动 Web UI.

### UC-002: Prepare a Creation

用户创建 Creation, 设置 Curation 标题与标签, 编辑 `prompt-draft.md`, 从 Inbox、显式本地路径或 Codex 会话中的已物化 Session Image 导入外部图片, 并为本次生成选择 Reference Image 的 `roles` 与 `guidance`.

### UC-003: Generate an Image

用户在 Codex 中显式调用 Generation Skill. Codex 可以在不改变核心意图的前提下自动优化 Prompt, 归档原始 Change Instruction 与实际执行 Prompt Revision, 调用图片生成工具, 并把成功或失败结果作为一个不可变 Generation 提交.

### UC-004: Branch Prompt History

用户从历史 Prompt Revision 恢复到 Draft 并继续调整. 新 Revision 指向选定父版本, 形成单父节点分支, 不覆盖已有历史.

### UC-005: Reuse an Image

用户把某个 Generation 的 Output 作为同一或另一 Creation 的 Reference Image. Image Asset 保持全局唯一内容身份, 关系上记录本次使用的 `roles` 与 `guidance`.

### UC-006: Replay a Generation

用户尽力复用既有 Generation 的 Prompt Revision、Reference Image 关系和所有已知工具参数. Replay 创建新 Generation, 并记录 `replayOfGenerationId`.

### UC-007: Browse and Curate

用户在图片网格中浏览生成 Output, 进入 Image Asset、Generation 或 Creation 详情, 查看完整 provenance, 并设置标题、标签、收藏、评分、备注、隐藏与 `active | shelved` 状态.

### UC-008: Search the Library

用户通过全文搜索与结构化过滤定位 Image Asset、Prompt Revision 和 Generation. 搜索结果可以直接跳转到具体 Revision 与相关 Generation.

### UC-009: Recover Interrupted Work

系统发现 `.staging/` 中断事务后显示恢复提醒. 用户可以检查现场, 显式取消未调用事务、归档 outcome unknown 的中断 Generation、继续提交完整产物, 或把无法验证的事务移入 quarantine.

### UC-010: Rebuild Derived State

用户删除 `.cache/`, 重新扫描 Commit Marker 和 Curation, 重建 SQLite read model 与缩略图, 结果不丢失任何权威信息.

### UC-011: Select and Merge Libraries

用户通过 Settings 查看或输入绝对 Library path, 初始化或选择 Asset Library, 并在不重启 local service 的情况下切换 active Library. 用户也可以通过 CLI 选择 Library, 或把一个只读 source Library 的完整已提交历史原子合并到 current destination Library.

### UC-012: Review a Generation Issue

用户在 Gallery 图片网格上方发现 active Creation 最新一次 Generation 的失败或中断提示. Safety Rejection 显示 moderation stage 与 category-level guidance; 用户检查不可变 Prompt Revision, 修改 Prompt Draft, 再显式创建新的 Generation.

## Functional Requirements

### Asset Library

- `FR-LIB-001`: Library 路径可以是仓库内相对路径或仓库外绝对路径.
- `FR-LIB-002`: 路径解析优先级为 CLI 参数、本机忽略配置、仓库默认配置.
- `FR-LIB-003`: 相对路径始终以 Git root 解析, 不以进程当前目录解析.
- `FR-LIB-004`: 单个 CLI 或服务进程一次只打开一个 Library.
- `FR-LIB-005`: Library 包含独立 `formatVersion`, 新代码必须验证兼容性后才能写入.
- `FR-LIB-006`: 用户运行时 Library 整体不进入源码 Git 历史; Schema、fixtures、实现和文档必须进入 Git.
- `FR-LIB-007`: Archive records、Image Asset 与 Commit Marker 不可原地修改或删除.
- `FR-LIB-008`: 只有被有效 Commit Marker 覆盖的记录才属于已提交 Archive.
- `FR-LIB-009`: Library root、`library.json` 或访问权限缺失时, Server 必须进入统一的 `LIBRARY_UNAVAILABLE` 状态, 不得创建 Library、cache 或 fallback Library.
- `FR-LIB-010`: CLI 或 Web 初始化、选择成功后必须原子保存 canonical absolute path 到本机忽略配置; 失败不得改变 active Library 或当前选择.
- `FR-LIB-011`: 用户可以 full validate 并通过 CLI 或 Web 选择已有 Library, 无需重新初始化或重启 Server.
- `FR-LIB-012`: Library Merge 必须保持 source 只读, 以 current Library 为 destination, 并通过单个 Commit Marker 原子发布新增 committed graph.
- `FR-LIB-013`: Library Merge 对相同 identity 和 bytes 去重, 对相同 UUID 的不同内容 fail closed, 对既有 Curation 和 Draft 保留 destination 状态.
- `FR-LIB-014`: Library Merge 不复制 `inbox/`、cache 或 recovery state, 并提供无写入的 `--dry-run` preflight.
- `FR-LIB-015`: Server 必须在每个 Library request boundary 检查 active root 与 manifest; 外部删除后首个后续请求进入 `LIBRARY_UNAVAILABLE`.
- `FR-LIB-016`: Settings 必须显示 resolved absolute Library path, 并允许用户输入 Server 账号可访问的绝对目标路径; API 不得提供通用 filesystem directory listing 或文件读取.
- `FR-LIB-017`: 同时只允许一个异步 Library transition; candidate validation 与 Index rebuild 在切换临界区外完成并提供 monotonic progress.
- `FR-LIB-018`: 切换时必须拒绝新 Library 请求、排空旧请求、重新验证 candidate、持久化选择、原子替换 active context 并轮换 session token.
- `FR-LIB-019`: 原路径恢复后必须由用户显式 Retry, 不得自动打开可能仍在复制的 Library.
- `FR-LIB-020`: 初始化成功但后续切换失败时保留新 Library, 不自动删除; active context 与旧持久化选择保持不变.
- `FR-LIB-021`: CLI 必须提供无写入的 Image source inspection, 返回 canonical source path、content identity、media type、尺寸与 byte length, 并区分 source missing、unreadable、unsupported 与 invalid.

### Prompt and Generation

- `FR-GEN-001`: Prompt Draft 可变且可以直接编辑, Prompt Revision 不可变.
- `FR-GEN-002`: Prompt Revision 保存实际发送给图片生成工具的完整 Prompt.
- `FR-GEN-003`: Change Instruction 与实际 Prompt 分开保存.
- `FR-GEN-004`: Prompt Revision 最多一个父版本, 允许分支, 不支持合并.
- `FR-GEN-005`: 一次图片生成工具调用对应一个 Generation.
- `FR-GEN-006`: Generation 固定绑定 Prompt Revision、Reference Image 关系与全部已知工具参数.
- `FR-GEN-007`: Reference Image 关系支持多选 `subject`, `style`, `composition`, `palette`, `other` 和可选 `guidance`.
- `FR-GEN-008`: Generation 终态是 `succeeded`, `failed` 或 `interrupted`.
- `FR-GEN-009`: Retry 和 Replay 永远创建新 Generation.
- `FR-GEN-010`: Codex 可以自动执行常规 Prompt 优化, 核心意图变化必须二次确认.
- `FR-GEN-011`: Safety Rejection 使用 stable error code 与可选 `moderation.stage`、`moderation.categories` 归档工具明确暴露的分类.
- `FR-GEN-012`: Output-stage Safety Rejection 只表示生成结果被拒绝, 不构成 Prompt violation 判定.
- `FR-GEN-013`: 明确生成请求授权 Skill 把具有可读本地 path 的 Session Image 通过独立 `import_asset` transaction 自动导入当前 canonical Library.
- `FR-GEN-014`: 多张 Session Image 必须全部 inspection 成功后才开始导入; 任一 inspection 或 import 失败时不得创建 Generation transaction、调用图片工具或静默丢弃失败输入.
- `FR-GEN-015`: Reference roles 只从用户明确措辞或已保存 selection 解析; 意图不足时必须在 prepare 前询问, 不得根据图片内容设置隐式默认 role.
- `FR-GEN-016`: 只有 opaque session handle 且宿主无法提供原始 bytes 或可读本地 path 时, Skill 必须以 `SESSION_IMAGE_NOT_MATERIALIZED` fail closed, 不得通过未归档会话输入绕过 provenance.
- `FR-GEN-017`: Skill 必须通过单个只读 Generation Preflight 固定 canonical Library root, 返回 capability、recovery warning、Draft snapshot 与全部 Session Image inspection 结果; Preflight 不导入图片或创建 Generation transaction.
- `FR-GEN-018`: 所有结构化 stdin command 必须支持以首个 `LF` 或 EOF 结束的单一 JSON value, payload 上限为 1 MiB; Prompt 不得进入 argv、process list、shell history 或临时脚本. CLI 必须在 TTY 下自治进入并恢复 non-canonical/no-echo raw mode.
- `FR-GEN-019`: Prepare 归档的 effective Prompt 与传入图片工具的 Prompt 必须 UTF-8 byte-identical. Skill 必须在 `mark-invocation-started` 前验证 SHA-256, 且不得在 Prepare 后重新生成或改写 Prompt.
- `FR-GEN-020`: Generation happy path 必须收敛为只读 `preflight`、高层 `begin`、built-in image generation 与高层 `finalize`. Begin 复用 import、prepare、Prompt hash gate 与 mark primitives; Finalize 复用 capture、terminal finalize、commit 与 incremental index primitives. Recovery、fault injection 与精确状态检查继续使用低层命令, 两者不得形成第二套 Archive 写入逻辑.
- `FR-GEN-021`: built-in result 已在会话中可见时, 视觉质量检查不得阻塞 Commit Marker 与 index ready. 图片工具返回可解析的本地 Output 后, Skill 的下一动作必须启动高层 Finalize; 只有结果不可见或需要验证 committed bytes 时, 才在 commit 后读取 Archive Output.
- `FR-GEN-022`: Workspace Ready 的普通 Generation 只加载 Generation Skill contracts 与一次 Preflight snapshot. 完整项目计划、设计与进度文档只用于修改项目行为或异常恢复, 不属于每次生成前置条件.

### Transaction and Recovery

- `FR-TXN-001`: 每个写事务拥有独立 staging 目录和 transaction ID.
- `FR-TXN-002`: 图片生成期间不持有全局 Archive 锁.
- `FR-TXN-003`: 最终提交在短时全局锁内重新验证并安装 immutable objects.
- `FR-TXN-004`: Commit Marker 是跨目录事务唯一的逻辑可见性边界.
- `FR-TXN-005`: 中断事务不得自动删除或自动重试.
- `FR-TXN-006`: `prepared`, `invocation_started`, `outputs_captured`, `ready_to_commit` 均具有确定恢复动作.
- `FR-TXN-007`: 无法验证的事务进入 `.quarantine/`.
- `FR-TXN-008`: Draft 与 Curation 更新使用原子替换和 optimistic concurrency check.

### Web UI and Curation

- `FR-UI-001`: 默认入口是按时间倒序的可见生成 Image Asset 网格.
- `FR-UI-002`: 外部导入且从未作为 Output 的 Image Asset 默认只在参考图库或显式筛选中出现.
- `FR-UI-003`: Image Asset 详情展示生产来源、后续引用、相关 Generation 与 Curation.
- `FR-UI-004`: Generation 详情展示 Prompt、Change Instruction、Reference Image roles、Output、已知参数和错误摘要.
- `FR-UI-005`: Creation 页面展示 Prompt Revision 分支和 Generation 时间线.
- `FR-UI-006`: Curation 与 Archive 分离, 修改 Curation 不改变 provenance.
- `FR-UI-007`: 第一版提供全文搜索、组合过滤、URL 可恢复筛选和确定排序.
- `FR-UI-008`: SQLite 和 thumbnail cache 可以完全删除并重建.
- `FR-UI-009`: Web UI 只准备输入和展示结果, 不直接启动 Codex.
- `FR-UI-010`: Server 启动时必须检测 read model marker lag 并在提供当前 Library 查询前完成 rebuild.
- `FR-UI-011`: Gallery 图片网格只展示 Image Asset; Generation Issue 位于网格上方的独立区域, 不伪装成占位图片.
- `FR-UI-012`: 每个 active Creation 最多展示一个 Generation Issue, 仅由最新 Generation 的终态决定; `shelved` Creation 不进入该区域.
- `FR-UI-013`: Safety Rejection 只提供 category-level guidance 与 `Review Prompt` 路径, 不自动高亮触发词、不自动改写 Prompt、不提供一键重试.
- `FR-UI-014`: Creation 页面在 Prompt History 与 Generation Timeline 之间提供 URL 可恢复的双向 Focus; Prompt Compare 保持独立状态.
- `FR-UI-015`: Reference Image 只按 Generation usage 关联 Prompt Revision; Focused Revision 按 Generation 分组展示实际 Reference Image、roles 与 guidance.
- `FR-UI-016`: Generation 与 Image Asset 详情提供返回精确 Creation、Prompt Revision 与 Generation 上下文的 links, 不新增独立 Prompt Revision 页面.

### Codex Controls

- `FR-CODEX-001`: 仓库级 Skill 位于 `.agents/skills/`.
- `FR-CODEX-002`: 项目级 Hook 位于 `.codex/`, 不修改全局 Codex 配置.
- `FR-CODEX-003`: `PreToolUse` 阻断 Codex 直接修改 Archive、staging、quarantine 和 lock.
- `FR-CODEX-004`: `Stop` 运行只读 validator, 发现本轮引入的完整性问题时阻止结束.
- `FR-CODEX-005`: Hook 不执行资产写入、自动修复或删除.

## Non-functional Requirements

- `NFR-001`: MVP 正式支持 macOS, Linux 为 best-effort, Windows 不支持.
- `NFR-002`: Node.js 24 是固定运行时.
- `NFR-003`: Browser-facing listener 默认绑定 `127.0.0.1`, 可以通过 `--host` 或环境变量显式绑定具体 IP、`0.0.0.0` 或 `::`; 服务必须验证 `Host`, `Origin` 与 session token.
- `NFR-004`: 所有 managed path 必须位于 canonical Library root 内, 禁止 path traversal 和内部 symlink.
- `NFR-005`: 所有正式行为、Schema、测试与恢复流程必须有仓库内文档.
- `NFR-006`: 应用在无外部字体和无云服务时可启动并使用已有 Library.
- `NFR-007`: Web UI 第一版只承诺桌面 viewport `1024x768` 及以上; 使用固定 200 px sidebar、紧凑 page header、统一可读字号和不产生横向 overflow 的 detail 两栏布局.
- `NFR-008`: Non-loopback listener 只面向 trusted LAN, 不提供 TLS、额外身份认证或公网安全承诺. Wildcard bind 只允许启动时发现的 usable active interface IP literal, interface 变化后必须重启.
- `NFR-009`: Workspace Ready 后, 新 Codex task 的第一次 Generation 也必须满足用户端到端耗时为图片模型耗时加不超过 30 秒可控非模型开销; `request -> invocation_started` p95 不超过 20 秒, `tool_returned -> committed and index-ready` p95 不超过 10 秒.
- `NFR-010`: 用户体验 SLO 与仓库执行 SLO 分层记录并通过同一个 `workflowRunId` 关联. Codex UI duration 是用户端到端权威值; 未暴露时结果保持 `unknown`, 仓库计时不得替代或推测.
- `NFR-011`: Generation Workflow 必须显示真实阶段与累计耗时. 没有 provider progress event 时不得编造百分比或 ETA; 只有 Commit Marker 有效且 index ready 后才能报告完成.
- `NFR-012`: 正常路径必须增量投影尚未处理的 Commit Marker 并原子更新 `last_indexed_marker`. 全量 index rebuild 只用于 cache 缺失、Schema 变化、corruption 或显式 recovery.
- `NFR-013`: Workflow performance telemetry 不属于 immutable Archive, 不得包含 Prompt、Reference guidance、文件路径、provider transcript 或 opaque handle. Telemetry failure 不得影响 Generation commit.
- `NFR-014`: Server 启动命令必须支持可选 root `.env`; daemon lifecycle 正式支持 macOS 与 Linux, 每个 Git checkout 最多一个实例, Windows 不在支持范围.

## Acceptance Criteria

- 所有 Archive Schema、不变量、哈希与引用校验通过.
- 对每个事务阶段执行故障注入后, 不出现部分可见提交.
- 至少 8 个并发 Generation 的最终提交不存在冲突、死锁或丢失更新.
- Hook 能阻断非法写入, validator 能发现哈希错误、悬空引用和未提交对象.
- fake generator 自动测试覆盖成功、失败、中断与 Replay; 发布验收包含真实 Codex 生成 smoke test.
- Web UI 端到端覆盖图库、详情、Prompt diff、Curation、搜索、过滤与恢复提醒.
- Web UI 和 API integration 覆盖运行时删除 active Library、绝对路径输入、初始化或选择、transition progress、原子切换和 stale session rejection.
- `npm start` 与 `npm run dev` 都支持 `--host <ip>`. CLI 参数覆盖 `TEXT_TO_IMAGE_HOST`, 默认值为 `127.0.0.1`; invalid hostname 必须 fail fast.
- `npm run dev`、`npm start`、`npm run daemon` 与对应 mise tasks 自动加载可选 `.env`; precedence 为 CLI、shell environment、`.env`、mode default, 且 `.env` 不影响 CLI、build、test、lint 或文档命令.
- `npm start` 与 daemon 在监听前完成 Web build; daemon 只有在 60 秒内收到真实 Server readiness 后才成功, status、logs 与 10 秒 `SIGTERM` stop 均可独立验证.
- Wildcard bind 输出每个 active interface 的 concrete URL, 接受对应 IP literal 的 `Host` 与 same-host `Origin`, 并继续拒绝任意 hostname、unknown interface、invalid Origin 与 CORS wildcard.
- Safety Rejection 能归档 input、output 与 unknown moderation stage 及零到多个 categories, 旧的无 `moderation` Generation record 仍通过 Schema 校验.
- Gallery 对每个 active Creation 只展示最新 failed 或 interrupted Generation Issue; 后续 succeeded Generation 会移除该 Creation 的全局提示, 历史仍可从 Timeline 访问.
- Generation Detail 对 output-stage rejection 使用非归罪文案和 category-level guidance, 不把建议描述为已确认的触发词.
- Creation provenance Focus 在无 URL 参数时选择最新 Generation, 在 deep link、刷新、复制链接和 browser back/forward 后恢复对应 Prompt Revision 与 Generation; 同一 Revision 的全部 Generation 保持可见并被共同高亮.
- Image Asset 的每条 used-as-reference relation 同时暴露 Generation 与该 usage 使用的 Prompt Revision, 不把多个 Generation 合并为虚假的直接 Reference Image -> Prompt Revision 关系.
- Web UI 在 `1024x768`, `1280x720`, `1366x768`, `1440x900` 和 `1920x1080` 下完成 Light、Dark、System theme 与 keyboard/focus 验收; Sidebar 在所有主题下保持深色且文字、边框和 focus ring 可读.
- 2,000 Creation、30,000 Generation、10,000 Image Asset 的合成数据上, reference macOS machine 的全量索引重建不超过 60 秒, warm query p95 不超过 200 ms, warm thumbnail 首屏可交互不超过 2 秒.
- fake generator 在 release-scale Library 上验证 `preflight -> invocation-ready` p95 不超过 20 秒, `tool-returned -> committed and index-ready` p95 不超过 10 秒, 且非模型端到端开销不超过 30 秒.
- 真实图片生成 smoke 分别报告 Codex orchestration、CLI、Archive、index 与 model duration, 但 provider latency 不作为 deterministic CI gate.
- Generation progress 只显示可观测阶段和累计耗时; committed 但 index degraded 时不得报告 `100%` 或 index ready.
- README、AGENTS、Schema、fixtures、设计、开发、测试和恢复文档完整且链接有效.
