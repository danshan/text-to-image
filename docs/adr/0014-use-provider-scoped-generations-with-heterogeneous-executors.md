# 使用 provider-scoped Generation 与 heterogeneous executor

## Background

Generation 原本只编排 Codex built-in `image_gen.imagegen`. 引入 xAI direct API 后, 同一次用户请求可能同时调用多个 Image Provider, 但不同 provider 具有不同 credential、transport、capability、Reference 限制和失败模式. 把多个 provider 合并进一个 Generation 会使 status、recovery、Replay 与 provenance 无法表达部分成功; 把 Codex built-in 强行包装为 repository HTTP client 又会越过 host capability 边界.

## Decision

一次 Generation 只代表对一个 Image Provider 的一次调用. Multi-provider 请求直接 fan-out 为多个独立 Generation, 不增加 `Generation Group` 或聚合终态. 所有 provider 实现统一的 capability、invocation plan 与 normalized result contract, 但允许 `codex_builtin`, `direct_api` 和未来 host executor. OpenAI 继续通过 Codex built-in tool 调用, xAI 通过 repository-owned direct API adapter 调用.

同一个 Generation Variant 的 provider fan-out 共享一个 Prompt Revision 和同一组 Reference Image. Workflow 在全量 provider preflight 成功后, 先通过独立 checkpoint transaction 提交共享 Prompt Revision, 再为每个 provider 创建独立 Generation transaction. Provider 调用开始后, 每个 Generation 独立 finalize 和 commit; 一个 provider 失败、超时或被 Safety Rejection 不取消其他已开始的调用. Crash 恰好发生在 Revision commit 与 provider invocation 之间时, 允许保留没有 Generation 的合法 Prompt checkpoint.

Format `1` 以 optional 字段接纳 provider provenance, 不改写已有 immutable Generation. 新 writer 必须显式保存稳定 provider ID; read model 仅能通过严格 legacy tool allowlist 派生旧记录的 provider, 并把派生值标记为 `legacy-derived`. 未知 legacy tool 保持 unknown.

## Consequences

- Generation 的 status、Replay、recovery、model 与 error 始终属于一个 provider invocation.
- Multi-provider 部分成功不需要新增聚合状态机, 未来 Google AI 可以增加新 adapter 或 executor 而不改变 Generation 语义.
- 共享 Prompt Revision 需要把现有 Generation transaction 中的 Revision staging 拆成 checkpoint 与 provider-scoped transaction 两个阶段.
- Prompt checkpoint commit 后的 crash window 会留下无 Generation 的 Revision, 但不会留下不合法或结果不确定的 provider invocation.
- Legacy provider 展示不是原始 Archive provenance, UI 必须明确区分 `recorded` 与 `legacy-derived`.
- 首期只实现 Codex built-in OpenAI 与 direct API xAI adapter. Google AI 和 Antigravity 只复用抽象边界, 不提供未验证的 adapter、credential 或 capability placeholder.

## Rejected Alternatives

### 一个 Generation 包含多个 provider

该方案减少 record 数量, 但必须增加 provider 级子状态、部分成功、子错误与子恢复协议, 并使 Replay 无法保持单一调用语义.

### 持久化 Generation Group

用户不需要把同一次 fan-out 作为可查询聚合展示. 新增 Group 会引入没有业务收益的 identity、Schema、状态与导航成本.

### 重写旧 Generation 补充 provider

原地修改会改变 immutable record digest 并破坏 Commit Marker. 升级整个 Library format 也与本次 additive provenance 需求不成比例.
