# Repository Guidance

## Project Goal

本项目通过仓库级 Codex Skill 执行图片生成和归档, 并通过 Web UI 浏览与整理本地 Asset Library. 文件系统是权威事实来源, SQLite 仅是可重建 read model.

## Required Reading

开始设计或实现前, 按顺序阅读:

1. `task_plan.md`: 当前阶段、剩余工作和已知错误.
2. `CONTEXT.md`: 领域统一语言.
3. `docs/README.md`: 正式文档索引与状态.
4. 与改动相关的 `docs/adr/` 和设计文档.
5. `findings.md` 与 `progress.md`: 调研依据和实际执行记录.

## Documentation Map

- `README.md`: 项目入口、状态和导航, 不承载详细设计.
- `CONTEXT.md`: 纯领域 glossary, 不写实现细节.
- `docs/README.md`: 正式文档清单、状态和所有权.
- `docs/standards/documentation.md`: 文档分类、格式、生命周期和完成标准.
- `docs/user/guide.md`: 面向普通用户的图片生成、参考图、Prompt 迭代、整理与恢复手册. 当前为 `accepted`.
- `docs/product/requirements.md`: 产品目标、用例、范围和验收标准. 当前为 `accepted`.
- `docs/design/system-architecture.md`: 运行时组件、所有权、依赖、数据流和安全边界. 当前为 `accepted`.
- `docs/design/asset-library.md`: 文件夹 Schema、身份、引用和演进规则. 当前为 `accepted`.
- `docs/design/generation-workflow.md`: Codex Skill、事务、失败与恢复流程. 当前为 `accepted`.
- `docs/design/web-ui.md`: 信息架构、查询与 Curation 交互. 当前为 `accepted`.
- `docs/development/guide.md`: 本地开发、构建与运行方式. 当前为 `accepted`.
- `docs/development/testing.md`: 测试分层、用例和验证命令. 当前为 `accepted`.
- `docs/adr/`: 难以逆转且存在真实权衡的架构决定.
- `schemas/asset-library/v1/`: 已跟踪的 Library format contract.
- `fixtures/asset-libraries/`: clone 后可验证的合法与非法 Library 示例.
- `.agents/skills/generate-and-archive/`: 仓库级 Generation Skill、参考资料与 eval cases.
- `.codex/`: 仅作用于本项目的 Hook 配置和 guard implementation.
- `task_plan.md`: 持续更新的阶段计划.
- `findings.md`: 调研事实、约束和设计发现.
- `progress.md`: 修改、验证结果和错误日志.

## Working Rules

- 修改已接受行为前, 先把受影响文档切回 `draft`, 完成代码、测试和交叉检查后再恢复为 `accepted`.
- Archive 只能通过共享写入器修改; 禁止直接编辑 `assets/`、`revisions/` 或 `generations/`.
- 允许直接编辑的资产区仅为 `prompt-draft.md` 与 `inbox/`.
- 所有 Codex 配置、Skill 和 Hook 必须位于仓库内; 禁止为本项目修改全局 Codex 配置.
- 源码、Schema、fixtures 和正式文档进入 Git; 用户运行时 Asset Library 整体不进入 Git.
- Library 路径必须通过共享 resolver 获取, 支持仓库外目录; 相对路径统一以 Git root 解析.
- 设计或行为变化必须在同一改动中更新对应正式文档, 必要时增加 ADR.
- AI 修改任何项目逻辑时, 必须在同一改动中同步更新对应正式文档、测试与 `progress.md`; 仅修改代码不得视为完成.
- 新术语或术语含义变化必须立即更新 `CONTEXT.md`.
- 每次实现必须同时更新测试与 `progress.md`; 不得声称未实际运行的命令已经通过.
- root command contract 见 `docs/development/guide.md`; Archive、Schema、Hook 与 recovery 修改必须运行对应 integration tests.
- 所有 Markdown 正文使用简体中文和 English punctuation. 代码、代码块、注释、标识符、文件名和提交信息使用 English.

## Documentation Contract

文档写作与维护必须遵循 `docs/standards/documentation.md`. 如果代码、Schema 与文档冲突, 工作不得视为完成; 必须修正其中一方并记录验证结果.
