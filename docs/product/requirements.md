---
title: Product Requirements
status: accepted
owner: project
last_updated: 2026-08-03
related:
  - ../../CONTEXT.md
  - ../design/asset-library.md
  - ../design/generation-workflow.md
  - ../design/web-ui.md
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
- MVP 不支持多用户、身份认证、权限模型、远程访问、云同步或移动端.
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

用户创建 Creation, 设置 Curation 标题与标签, 编辑 `prompt-draft.md`, 从 Inbox 导入外部图片, 并为本次生成选择 Reference Image 的 `roles` 与 `guidance`.

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
- `FR-LIB-009`: 缺少 `library.json` 时, Server 必须进入初始化诊断模式并显示 exact init command, 不得创建 Library、cache 或 fallback Library.

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

### Codex Controls

- `FR-CODEX-001`: 仓库级 Skill 位于 `.agents/skills/`.
- `FR-CODEX-002`: 项目级 Hook 位于 `.codex/`, 不修改全局 Codex 配置.
- `FR-CODEX-003`: `PreToolUse` 阻断 Codex 直接修改 Archive、staging、quarantine 和 lock.
- `FR-CODEX-004`: `Stop` 运行只读 validator, 发现本轮引入的完整性问题时阻止结束.
- `FR-CODEX-005`: Hook 不执行资产写入、自动修复或删除.

## Non-functional Requirements

- `NFR-001`: MVP 正式支持 macOS, Linux 为 best-effort, Windows 不支持.
- `NFR-002`: Node.js 24 是固定运行时.
- `NFR-003`: 本地 HTTP 服务只监听 loopback, 并验证 `Host`, `Origin` 与 session token.
- `NFR-004`: 所有 managed path 必须位于 canonical Library root 内, 禁止 path traversal 和内部 symlink.
- `NFR-005`: 所有正式行为、Schema、测试与恢复流程必须有仓库内文档.
- `NFR-006`: 应用在无外部字体和无云服务时可启动并使用已有 Library.

## Acceptance Criteria

- 所有 Archive Schema、不变量、哈希与引用校验通过.
- 对每个事务阶段执行故障注入后, 不出现部分可见提交.
- 至少 8 个并发 Generation 的最终提交不存在冲突、死锁或丢失更新.
- Hook 能阻断非法写入, validator 能发现哈希错误、悬空引用和未提交对象.
- fake generator 自动测试覆盖成功、失败、中断与 Replay; 发布验收包含真实 Codex 生成 smoke test.
- Web UI 端到端覆盖图库、详情、Prompt diff、Curation、搜索、过滤与恢复提醒.
- 2,000 Creation、30,000 Generation、10,000 Image Asset 的合成数据上, reference macOS machine 的全量索引重建不超过 60 秒, warm query p95 不超过 200 ms, warm thumbnail 首屏可交互不超过 2 秒.
- README、AGENTS、Schema、fixtures、设计、开发、测试和恢复文档完整且链接有效.
