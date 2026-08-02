---
title: Documentation Standard
status: accepted
owner: project
last_updated: 2026-08-02
---

# 文档规范

## Principles

- 文档与代码、Schema 和测试同属交付物, 必须在同一变更中保持一致.
- 每个事实只设一个权威位置, 其他文档使用链接, 不复制整段内容.
- 文档描述当前有效状态. 历史理由放入 ADR, 工作过程放入 `progress.md`.
- 尚未确认的内容标记为 `planned` 或 `draft`, 不得写成既定事实.
- 所有相对链接必须从所属文档位置解析, 不使用本机绝对路径.

## Document Types

| Type                  | Canonical Location  | Responsibility                         |
| --------------------- | ------------------- | -------------------------------------- |
| Entry point           | `README.md`         | 项目概览、状态与导航                   |
| Repository rules      | `AGENTS.md`         | 工作约束、必读文档与路径地图           |
| Domain glossary       | `CONTEXT.md`        | 领域术语及禁用同义词, 不含实现细节     |
| Product requirements  | `docs/product/`     | 用例、范围、非目标与验收标准           |
| Design                | `docs/design/`      | 数据模型、协议、状态机、边界与恢复策略 |
| Development           | `docs/development/` | 环境、命令、测试、发布与故障排查       |
| Architecture decision | `docs/adr/`         | 难以逆转、出人意料且经过真实权衡的决定 |
| Working memory        | Root planning files | 计划、发现、执行记录和错误             |

## Standard Frontmatter

除 `README.md`、`AGENTS.md`、`CONTEXT.md`、ADR 与持续计划文件外, 正式文档使用以下 frontmatter:

```yaml
---
title: Asset Library Design
status: draft
owner: project
last_updated: 2026-08-02
related:
  - ../adr/0001-use-the-filesystem-as-the-source-of-truth.md
---
```

允许的 `status`:

- `planned`: 已知需要, 尚未开始形成内容.
- `draft`: 正在讨论或实现, 不可作为稳定契约.
- `accepted`: 已确认且作为当前契约.
- `deprecated`: 仍可阅读, 但不应继续采用.
- `superseded`: 已由其他文档替代, 必须提供替代链接.

## Required Structure

产品文档至少包含 `Goals`, `Non-goals`, `Use Cases`, `Requirements`, `Acceptance Criteria`.

设计文档至少包含 `Context`, `Invariants`, `Model`, `Flows`, `Failure Handling`, `Compatibility`, `Validation`.

研发文档至少包含 `Prerequisites`, `Commands`, `Configuration`, `Verification`, `Troubleshooting`.

标题可以使用 English canonical names, 正文必须使用简体中文和 English punctuation. 代码块、JSON 字段、命令、标识符和文件名必须使用 English.

## ADR Rules

只有同时满足以下条件才创建 ADR:

1. 决定难以逆转.
2. 未来读者仅看代码会难以理解原因.
3. 存在经过权衡的真实替代方案.

ADR 文件名使用 `NNNN-kebab-case-slug.md`, 序号单调递增. 正文至少说明背景、决定与理由, 不强制套用冗长模板.

## Change Workflow

1. 在实现前更新相关文档为 `draft`, 明确不变量和验收标准.
2. 在实现过程中同步更新 Schema、示例、失败路径和命令.
3. 实际运行验证命令, 把结果写入 `progress.md`.
4. 检查 `README.md`、`AGENTS.md` 与 `docs/README.md` 的导航是否完整.
5. 只有当行为、测试和文档一致时, 才把文档状态改为 `accepted`.

## Definition of Done

- 新增或改变的行为具有权威文档位置.
- `CONTEXT.md` 与代码命名不存在领域冲突.
- 所有文档内路径和链接有效.
- 示例通过对应 Schema 或测试验证.
- 实际执行过的测试与结果已记录.
- 不存在仅存于 SQLite cache 而无法从文件恢复的信息.
