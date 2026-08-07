# 兼容扩展 Generation Platform provenance

## Background

Generation 已保存实际 tool name、model 与 parameters, 但这些字段不能稳定表达用户选择的生成平台. `image_gen.imagegen` 当前可以推断 OpenAI, 未来 Grok 则会使用不同工具与传输方式; 如果把平台等同于工具、模型或 API, Replay 与跨平台生成的语义会随 adapter 变化.

现有 format `1` Archive 已包含没有平台字段的 Generation. 原地回写或批量迁移会改变不可变 record 与 Commit Marker digest, 与 Archive 事实来源和兼容扩展目标冲突.

## Decision

Generation 增加可选 machine ID `platform`. 当前受支持的值只有 `openai`, 当前 built-in OpenAI Writer 在所有成功、失败和中断终态中显式写入该值. `platform` 与 `tool.name`、`tool.model`、`tool.parameters` 并列保存, 互不替代.

Reader 对缺少 `platform` 的旧 Generation 使用单一兼容规则: `tool.name` 等于 `image_gen.imagegen` 时投影为 `openai` 且标记 `legacy_inferred`; 其他缺失情况投影为 `unknown`. 显式 record 标记为 `recorded`. Incremental catch-up 与 full rebuild 共用该 projection, 不修改 Archive, 不创建 migration 或 backfill.

Replay 尽力保留源 Generation Platform、输入和已知参数. 当前只存在 OpenAI execution slice, 因而 Replay 仍通过 OpenAI Writer 产生显式 `openai`; 未来选择不同平台属于基于既有 Prompt Revision 的新 Generation, 不是 Replay.

本决定只建立 provenance 字段、兼容读取和展示边界. 不引入 Batch、provider framework、adapter registry 或 Grok execution path.

## Consequences

- 新 OpenAI Generation 可以不依赖 tool name 推断平台身份.
- 历史 Archive 保持 byte-identical, Commit Marker 与 digest 不变化.
- Web UI 可以区分 `OpenAI`、`OpenAI (legacy inferred)` 与 `Unknown`, 同时继续展示 Tool、Model 和 Parameters.
- Read model Schema 变化只触发可重建 cache replacement, 不属于 Archive migration.
- 新平台需要显式扩展受支持 machine ID、Writer、验证、Replay 和 UI label, 不能只复用 `tool.name` 猜测.

## Rejected Alternatives

### 使用 tool name 作为平台

工具名是执行机制, 可能随宿主或 adapter 改变. 它不能稳定表达用户选择, 也会让相同平台的不同 transport 变成不同 provenance.

### 回写历史 Generation

回写会修改不可变 record 与 Commit Marker digest, 引入高风险 migration, 而兼容 projection 已能满足浏览和 rebuild.

### 立即建立 provider abstraction

当前只有 OpenAI execution slice. 提前增加统一 provider interface、registry 或 Batch contract 没有第二个真实实现约束, 会扩大 API 和恢复状态机而不增加当前能力.
