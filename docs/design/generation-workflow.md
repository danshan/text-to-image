---
title: Generation Workflow Design
status: draft
owner: project
last_updated: 2026-08-08
related:
  - ../../CONTEXT.md
  - asset-library.md
  - ../adr/0002-enforce-the-archive-with-repository-owned-controls.md
  - ../adr/0006-commit-generations-atomically.md
  - ../adr/0012-keep-workflow-telemetry-out-of-the-archive.md
  - ../adr/0014-use-provider-scoped-generations-with-heterogeneous-executors.md
  - purge-workflow.md
---

# Generation Workflow 设计

## Context

Generation Workflow 是仓库级 Codex Skill, 负责把 Creation 中的 Prompt Draft、Change Instruction 与 Reference Image 关系转换为一次可审计的 built-in image generation 调用, 再通过共享写入器归档所有输入、工具事实和 Output.

Workspace Ready 的普通 Generation 使用最小确定输入: Generation Skill contracts 与一次 Preflight snapshot. 只有修改项目行为时才读取完整项目计划、设计与进度文档, 只有异常时才加载 Recovery contract.

Skill 位于:

```text
.agents/skills/generate-and-archive/
  SKILL.md
  references/
  scripts/
```

Skill 编排 Codex built-in `image_gen` tool, 但不得自己实现 Asset Library 写入. 所有写操作通过 `assetctl` 或其共享 archive package 完成.

## Scope

MVP 只支持 built-in generate mode:

- 无参考图的新图片生成.
- 使用一个或多个 Reference Image 指导 subject、style、composition、palette 或其他说明.
- 用户要求多个 variant 时, 每个 built-in tool call 创建独立 Generation.

MVP 不支持:

- built-in edit mode 和 edit target.
- CLI/API fallback 或 `OPENAI_API_KEY` 管理.
- mask、inpainting、透明背景后处理与 derived-asset provenance.
- preview-only output. 通过本 Skill 产生的所有 Output 都必须进入 Archive.

这些能力未来需要独立 Schema 与 ADR, 不得通过 `other` role 偷渡.

## Invariants

1. 用户必须在 Codex 中显式调用 Generation Skill.
2. Web UI 不得代替用户启动 Codex 或 tool call.
3. 一次 built-in tool call 等于一个 Generation.
4. Generation 调用前必须冻结实际 Prompt Revision 与 Reference Image 关系.
5. `Change Instruction` 与实际执行 Prompt 分开保存.
6. Codex 不得编造未暴露的 model、seed、quality 或其他参数.
7. Tool call 开始前必须持久化 `invocation_started`, 让崩溃恢复采取保守语义.
8. built-in output 不得只留在 `$CODEX_HOME/generated_images/...`; 必须捕获进 staging 并提交到 Library.
9. 所有生成结果都进入历史, 主观不满意通过 Curation 标记, 不丢弃调用证据.
10. 自动 retry 禁止; Replay 和 retry 都需要新的显式 Generation.
11. Prepare 归档的 effective Prompt 与传入 built-in tool 的 Prompt 必须 UTF-8 byte-identical, 并在 invocation marker 前通过 SHA-256 gate.
12. Workflow telemetry 是可丢弃诊断数据, 不属于 Archive, 其失败不得影响 Generation terminal status 或 commit.

## Confirmed Multi-provider Contract

本节记录 Phase 19 已确认并实现的 multi-provider runtime 边界. 只有代码、Schema、Skill、测试与交叉文档全部通过验证后, 才能把本设计状态恢复为 `accepted`.

- 一次 Generation 只调用一个 Image Provider. 同一次用户请求选择多个 provider 时, 直接创建多个 Generation, 不增加 `Generation Group` 或其他聚合实体.
- Generation 显式保存稳定 provider ID 与实际 Image Model identity. `xAI` 是 provider, `Grok Imagine` 是 model; 未知 model 保持未知, 不从 provider 或 tool name 推断.
- 同一个 Generation Variant 向多个 provider fan-out 时, 对应 Generation 共享一个 Prompt Revision 和同一组 Reference Image, 以保证 provider 接收 byte-identical effective Prompt 和相同输入关系. 多个 Variant 分别创建 Prompt Revision, 不共享 Generation lifecycle.
- 每个 Creation 保存可变 Provider Preference. 未明确 provider 时, Skill 以该偏好预选一个或多个 provider, 但仍要求用户确认; 当前指令已明确 provider 时不重复询问并更新偏好.
- 调用任何 provider 前, Workflow 必须完成所有已选 provider 的 capability、credential、Prompt、Reference 与 transaction preflight. 任一前置检查失败时不得调用任何 provider.
- 全部前置检查成功后并发调用已选 provider. 每个 Generation 在对应 provider 返回后立即独立 finalize 和 commit, 不等待其他 provider; 一个调用失败、超时或被 Safety Rejection 时, 不取消其他已开始的调用.
- Multi-provider 请求没有聚合终态. Workflow 分别报告每个 Generation 的 `succeeded`, `failed` 或 `interrupted` 状态.
- xAI adapter 在没有 Reference Image 时调用 text-to-image generation endpoint, 在存在一至三张 Reference Image 时调用 multi-reference edit endpoint. Endpoint 的 `edit` 命名不改变本项目的 Generation 领域语义.
- xAI Reference 输入使用已提交 Image Asset 的本地 bytes, 不创建 public URL 或长期 provider file. Adapter 按 Reference 的稳定顺序映射 provider image index, 并保留 roles 与 guidance 对 effective Prompt 的约束.
- xAI 当前最多接受三张 Reference Image. 超限时 capability preflight 失败; multi-provider 请求因此不得调用任何已选 provider, 直到用户减少 Reference 或取消 xAI.
- 普通生成只要求用户选择 Image Provider, 不要求每次选择 Image Model. 每个 provider adapter 必须解析一个显式配置的默认 model; 用户可以在当前请求中提供通过 capability validation 的高级 model override.
- xAI 调用必须发送已冻结的具体 model ID, 并在 Generation 中保存实际请求或 provider 明确返回的 model identity. 不依赖 provider API 的隐式默认值. Codex built-in tool 未暴露 model 时保持 `null`, 不从 provider 或 tool name 推断.
- xAI adapter 始终使用 `n = 1`. 用户请求的 variant count 展开为 `provider count × variant count` 个 Generation; 每个 Variant 对每个 provider 创建一次调用. 单个 Generation Schema 继续允许多个实际 Outputs, 但 Workflow 不使用 provider batch 参数合并用户请求的 Variant.
- Multi-provider 调度使用独立 provider lane. 不同 provider lane 并发运行; 首期同一 provider 最多一个 in-flight Generation, Variant 在该 lane 内串行执行. 一个 lane 的失败不阻塞其他 lane, 未来只有在明确配置 bounded `maxConcurrency` 后才能提高单 provider 并发度.
- 排队中的 Variant 不得提前写入 `invocation_started`. Workflow 只在对应 provider 调用即将开始且 Prompt hash gate 通过后标记 invocation, 使 crash recovery 只把真实可能已发出的调用归类为 uncertain outcome.
- Replay 固定使用源 Generation 的 provider 与全部已知 model fields, 不重新询问 provider, 不自动 fallback. 源 provider 当前 unavailable 时 fail closed.
- 使用同一 Prompt Revision 改由其他 provider 生成属于新的 Generation Variant, 进入正常 provider 选择流程并更新 Creation 的 Provider Preference; 它不设置 `replayOfGenerationId`.
- Format `1` 的 Generation Schema 以 optional 字段增加 provider provenance, 不重写既有 immutable records. 新 writer 必须显式写入 provider ID; legacy record 可以继续缺失.
- Read model 只允许通过严格 legacy tool allowlist 派生 provider 展示. `image_gen.imagegen` 派生为 `openai` 并标记 `legacy-derived`; 未知 tool 保持 unknown. 新记录标记为 `recorded`, 使 UI 不把派生事实伪装成 Archive 原始字段.
- 所有 Image Provider 实现统一 provider contract, 至少提供 capability check、invocation plan、normalized result 与 executor kind. Contract 允许 `codex_builtin`, `direct_api` 和未来的 host executor, 不要求所有 provider 共享一种 transport.
- OpenAI provider 继续由 Skill 调用 Codex built-in `image_gen.imagegen`, 项目不管理 OpenAI API key. xAI provider 由仓库内 adapter 通过 direct API 调用. 两者共享 preflight、Prompt hash、transaction、capture、finalize 与 recovery 语义; Archive writer 不依赖具体 SDK、HTTP endpoint 或 host.
- xAI credential 只允许从 `XAI_API_KEY` 解析. Provider preflight 和 invocation 优先读取当前 process environment, 未设置时读取 repository root 的 ignored `.env`; 其他 `assetctl` command 不因此加载 `.env`.
- API key 不得通过 CLI argv、Prompt、Codex 对话或 JSON config 传入, 也不得进入 Generation、transaction、telemetry、stdout、日志或用户错误详情. `.env.example` 只保存空占位. 缺少 credential 时 xAI capability 为 unavailable, 不影响 Codex built-in OpenAI provider.
- xAI direct executor 使用单个 repository-owned 高层 command 完成 `invocation_started`、API call、Output validation、Capture、Finalize、Commit Marker 发布与 incremental index catch-up. Skill 不运行 `curl`, 不接触 credential、raw provider response、base64 payload或临时 provider URL, 只接收 bounded normalized result.
- xAI 请求固定使用 `response_format: "b64_json"`. Adapter 在受控进程内逐个解码并通过共享图片检查器验证 media type、尺寸与 content hash, 再通过共享 Archive writer 写入当前 transaction staging. Base64 payload 不进入 stdin、stdout、telemetry 或临时脚本.
- xAI command 在 `invocation_started` 后中断时保留现有 recovery state. 已捕获 Output 可以从 `outputs_captured` 继续 finalize; 未获得可验证 Output 时保持 uncertain outcome, 不伪造 success 或再次调用 provider.
- xAI direct invocation 的默认 timeout 为十分钟, 只覆盖 provider HTTP span. Repository-local non-secret config 可以按 provider 覆盖, 首期限制为一至三十分钟.
- 明确的 HTTP `4xx`、`5xx` 与 provider Safety Rejection 是 `failed`, `outcomeKnown: true`; 其中 rate limit 和 server failure 可以标记 retryable, 但 Workflow 不自动 retry. 请求发出后的 client timeout、connection reset、response truncation, 以及缺少完整可验证 Output 的 `200` response 是 `interrupted`, `outcomeKnown: false`.
- xAI `interrupted` Generation 在 immutable Archive 中继续只保存 generic unknown-outcome error. `generation invoke-provider` 的 ephemeral result 额外返回 `diagnostic: { code, stage }`, bounded code 只允许 `XAI_TIMEOUT`, `XAI_TRANSPORT_FAILED`, `XAI_RESPONSE_READ_FAILED`, `XAI_RESPONSE_INVALID` 或 `XAI_OUTPUT_INVALID`; stage 只允许 `transport`, `response_read`, `response_validation` 或 `output_validation`. 该 diagnostic 不包含 raw error、response body、request ID、API URL、credential 或本机 path, 也不进入 Archive.
- provider uncertainty boundary 结束于 Output validation. 全部 Output 必须先通过 Image inspection, 再进入共享 Capture. Capture、Finalize、Commit 与 index error 属于 repository execution failure, 必须保留 recovery state 并向上返回, 不得被归一化为 provider `interrupted`.
- Provider failure 不触发 fallback 或取消其他已开始的 lane. 用户显式 retry 创建新的 Generation. 等待超过六十秒只报告 provider 与累计时间 heartbeat, 不生成百分比或 ETA.
- Web Generation Detail 显示 Provider、Model、Tool、Parameters 与 `recorded | legacy-derived` provenance source. Creation Timeline 使用紧凑 provider/model badge, Image Detail 在每条 produced-by Generation relation 上显示相同事实.
- Gallery query 增加 provider filter, model filter 继续使用实际 model identity. Gallery Image Card 不显示单一 provider badge, 因为一个 content-addressed Image Asset 可能具有多个 Output provenance. Legacy 和 unknown facts 必须明确标识, 不用当前默认 model 回填历史.
- Provider non-secret defaults 位于 tracked `text-to-image.config.json`, ignored `text-to-image.local.json` 可以覆盖. Model resolution precedence 为 current request override、local config、tracked config; 不使用 code-level implicit model fallback.
- Provider config 只接受代码中已注册的 adapter ID 与 bounded fields, 首期包括 `enabled`, `defaultModel` 和 `timeoutSeconds`. 未知 provider 或 field 是配置错误. Credential 不进入 JSON; Creation Provider Preference 保存在 Asset Library 的 mutable Creation metadata 中.
- Generation Archive 只保存 bounded provider provenance、实际 model、tool identity、输出相关 normalized parameters、status 与 normalized error. 不保存 provider request ID、API URL、response transport、cost、raw usage 或 raw provider metadata.
- 未来如需费用管理, 使用独立 optional Usage Record 或外部 billing projection, 不把 provider billing payload 塞入 Generation `tool.parameters`.
- 本期只实现 `openai` Codex built-in adapter 与 `xai` direct API adapter. Provider registry、adapter contract、executor kind 与 unknown-provider read model handling 保持通用, 但不实现 `google` adapter、Antigravity capability detection、Google credential、config placeholder 或 UI entry.
- Deterministic CI 使用 fake provider 与 mock xAI HTTP server. 真实 xAI smoke 是 opt-in external-cost test, 只有 `XAI_API_KEY` 存在且用户明确授权时执行, 不属于默认 CI gate. 真实 provider latency 只记录 observation, 不作为 deterministic pass/fail.

## Inputs

Skill 接受:

- `creationId`, 必填.
- `changeInstruction`, 可选; 新生成没有变化说明时可以为空字符串.
- Reference Image selections, 每项包含 `assetSha256`, `roles`, 可选 `guidance`.
- 可选 `basedOnRevisionId`, 未提供时使用 Draft metadata.
- 可选 variant count, 默认 `1`; Skill 逐次调用而不是把多个调用合并为一个 Generation.
- 可选 Session Image source, 由 Codex 会话提供; 必须具有宿主暴露的原始 bytes 或可读本地 path.

Skill 必须从 canonical Library root 读取 Prompt Draft 和资产. 用户明确请求生成时, Skill 可以把已物化 Session Image 自动导入为 Image Asset; Generation 仍然不接受未经导入的任意本地文件作为 Reference Image.

## Prompt Policy

### Draft and Revision

Prompt Draft 是用户当前工作稿. Codex 根据 Draft、Change Instruction 和 Reference Image guidance 构造 structured effective prompt, 该完整文本成为 Prompt Revision 的 `prompt.md`.

Codex 可以:

- 规范结构和措辞.
- 补足有助于质量但不改变意图的构图、光线和实用约束.
- 把 Reference Image roles 与 guidance 明确映射到 prompt.
- 增加 no watermark、no unintended text 等常规质量约束.

Codex 不可以在未确认时:

- 改变主体身份或新增未暗示的角色和物体.
- 改变构图目标、用途或风格方向.
- 引入品牌、slogan、palette 或叙事设定.
- 把 Reference Image 从一种角色解释成另一种角色.

若准备发生上述 material change, Skill 必须展示变更并等待确认. 用户明确要求“生成”已经授权常规优化, 不需要重复确认.

### Reference Roles

- `subject`: 主体身份、外形、结构或角色特征.
- `style`: 笔触、材质、摄影或渲染方式.
- `composition`: 镜头、视角、裁切、主体位置和留白.
- `palette`: 主色、辅色、色温和明暗关系.
- `other`: 前四项无法表达的用途, 必须通过 `guidance` 说明.

同一 Reference Image 可以有多个 roles. roles 表达意图, 不承诺底层模型一定遵守.

## State Machine

```text
prepared
  -> invocation_started
      -> outputs_captured
          -> ready_to_commit
              -> committed
      -> ready_to_commit(failed)
      -> interrupted

any non-committed state
  -> quarantined
```

`committed` 由 Commit Marker 是否存在决定, 不作为可变 staging field 继续写入.

### Transaction Record

`.staging/<transaction-id>/transaction.json` 是可变工作记录:

```json
{
  "schemaVersion": 1,
  "id": "9f386ef3-b8ce-4197-ad14-a2fda4c19754",
  "state": "invocation_started",
  "creationId": "f69e912d-c504-4278-89d5-4558ba452df0",
  "revisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "generationId": "755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d",
  "draftContentSha256": "d1697a1e6d7d2be36b8f81578a0f8377ed3c8853af5aaf3dcd5286436f510f90",
  "createdAt": "2026-08-02T12:12:00.000Z",
  "updatedAt": "2026-08-02T12:12:05.000Z"
}
```

每次 state transition 使用 atomic JSON replacement. transaction record 不是 Archive, 可以在 recovery 中修改或移动.

## Main Flow

### 1. Resolve and Validate

1. Skill 通过单个只读 `generation preflight` command 解析 Library root, 并在本次工作流中固定返回的 canonical path.
2. Preflight 返回 capability、Library format、quick validation、未恢复 transaction 摘要、目标 Creation、Prompt Draft、Draft metadata、selected Image Asset 与全部 Session Image inspection 结果.
3. Preflight 不导入图片、不创建 Generation transaction、不修改 Archive; 任一 inspection 失败时整体失败.
4. 未恢复 transaction 不阻断无关 Generation, 但必须向用户显示 warning.
5. 对已有 Reference Image 验证已提交身份与 payload hash; 对全部输入验证 roles 已从用户明确措辞或已保存 selection 得出.
6. 后续 command 显式使用 Preflight 返回的 canonical Library root, 不重新解析或切换 Library.

### 2. Ingress Session Images

1. 按用户提供或会话出现顺序稳定编号 Session Image. 只有 opaque handle 且宿主无法暴露原始 bytes 或本地 path 时, 以 `SESSION_IMAGE_NOT_MATERIALIZED` 停止.
2. 复用 Preflight 返回的全部 source inspection. 不重复调用 `asset inspect`; 任一 source missing、unreadable、unsupported 或 invalid 时, 不导入任何图片, 不创建 Generation transaction.
3. sandbox permission denial 先请求 scoped read access 并有限重试一次, 不得误报为 source missing.
4. 全部 inspection 成功后, 把 canonical source path 与 expected `assetSha256` 交给高层 `generation begin`. Begin 逐个复用 `asset import`, 每次 import 创建独立 transaction, 已提交 Image Asset 不因后续失败回滚.
5. import 返回的 `assetSha256` 必须与 inspection 相同; 不同返回 `SESSION_IMAGE_CHANGED`, 停止 Generation.
6. 任一 import 失败时不静默删除该输入或使用其余图片继续. 重试依靠内容寻址复用已提交资产.
7. 使用全部 import 结果构造 Reference relations, 然后进入 effective Prompt 构造.

### 3. Build Effective Prompt

1. 读取用户 Change Instruction.
2. 根据 parent Revision 和 Draft 构造 effective prompt.
3. 把输入图片按 index 和 role 写入 prompt scaffolding.
4. 检查 material change; 必要时等待用户确认.
5. 在内存中只构造一次 effective Prompt, 计算原始 UTF-8 bytes 的 SHA-256, 不执行 Unicode 或换行规范化.
6. 同一个 byte-identical Prompt 同时用于 Prepare request 与 built-in tool call. Prepare 后不得重新生成、重排或复制 Prompt.
7. 并发 workflow 使用 transaction-scoped key 保存内存 Prompt; commit、known failure 或显式 recovery 后立即清除.

### 4. Begin Generation

Skill 调用:

```bash
assetctl generation begin \
  --library <library-root> \
  --creation <creation-id> \
  --request-stdin
```

高层 command 复用 Session Image import、Prepare、Prompt hash gate 与 Mark primitives, 返回 machine-readable result:

```json
{
  "transactionId": "9f386ef3-b8ce-4197-ad14-a2fda4c19754",
  "revisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "generationId": "755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d",
  "promptSha256": "da88d518f0c3b93057393511685b93423f2b350c2e4ac84f7b8b64346a54b552",
  "referencePaths": [
    "/canonical/library/assets/sha256/92/92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a.png"
  ],
  "sessionImages": []
}
```

CLI 从 stdin 读取一个 JSON request, 避免 Prompt 出现在 argv、process list 或 shell history. Canonical framing 是以首个 `LF` 结束的单行 JSON; EOF 先到时继续兼容. JSON string 内的正文换行使用标准转义, payload 上限为 1 MiB, 第二个 JSON value 或尾随非空内容必须拒绝. JSON stdout 是 Skill 与 writer 的接口, human diagnostics 写入 stderr, 不得混入 stdout.

CLI 检测 TTY 后保存原 raw state, 临时进入 non-canonical/no-echo mode, settled 后恢复. Skill 不执行 `stty`.

带 hash gate 的 invocation marker 在写入 marker 前验证内存 Prompt SHA-256 与 Prepare 返回的 `promptSha256` 一致. 验证失败时 transaction 保持 `prepared`, 不调用图片工具. `generation prepare`, `generation mark-invocation-started` 与 `generation verify-prompt` 仅保留为 recovery、diagnostic 或 fault-injection commands.

### 5. Invoke Built-in Image Generation

Skill 使用 built-in `image_gen` tool. Reference Image 都是已知本地 path, 按工具要求作为 referenced images 提供. 不传入不存在的 destination-path 参数.

系统 Skill 会把结果默认保存到 `$CODEX_HOME/generated_images/...`. 项目 Skill 必须取得返回的本地 output path. 如果 tool 成功但没有可解析本地 path, transaction 保持可恢复状态并报告错误, 不伪造 Output.

### 6. Capture, Finalize, Commit, and Index

Tool 明确成功后, Skill 把全部本地 output paths 作为 `outputSources` 一次交给高层 command:

```bash
assetctl generation finalize \
  --library <library-root> \
  --transaction <transaction-id> \
  --result-stdin
```

高层 command 依次复用 Capture、Complete、Commit 与 incremental index catch-up. 任一步失败时保留现有合法 recovery state, 不创建第二套事务语义. 原 `$CODEX_HOME` 文件不自动删除.

built-in result 已在会话中可见时, Skill 直接记录质量观察, 不在 commit 前重复读取 staged Output. 只有结果不可见或需要验证 committed bytes 时, 才在 commit 后读取 Archive Output. 质量不满意不改变 tool execution status; Output 仍提交, 用户可随后隐藏或评分.

图片工具返回可解析的本地 Output 后, Skill 的下一动作必须启动高层 Finalize. progress commentary、质量分析和其他非必要工具调用必须在 Finalize command 启动后执行, 避免把 Codex 编排重新放回 post-tool critical path.

### 7. Low-level Finalize Result

Tool success:

```bash
assetctl generation complete \
  --library <library-root> \
  --transaction <transaction-id> \
  --result-stdin
```

Tool known failure:

```bash
assetctl generation fail \
  --library <library-root> \
  --transaction <transaction-id> \
  --error-stdin
```

result 和 error JSON 均从 stdin 读取. error record 只保存 stable code、短摘要、可恢复标识和工具明确暴露的 bounded metadata, 不保存 secret、完整 transcript 或不受控 stack dump.

Skill happy path 使用一个高层 post-tool command 完成 terminal record、Commit Marker 发布与增量 index catch-up. 该 command 复用现有 `complete | fail`、`commit` 与 Read Model primitives; 低层命令继续用于 recovery、fault injection 和状态机测试. command 在任一步中断时必须留下现有合法 recovery state, 不创建第二套事务语义.

图片工具明确返回 safety moderation rejection 时, Skill 使用 `IMAGE_GENERATION_SAFETY_REJECTED`. 若工具暴露 moderation stage 与 categories, error request 增加 optional `moderation`; 未暴露 stage 时使用 `unknown`, 未暴露 categories 时使用空数组. Request ID 与完整 provider payload 不进入 Archive. Safety Rejection 是 known failure, 不自动 retry; output-stage rejection 不得表述成 Prompt violation.

### 8. Low-level Commit

```bash
assetctl generation commit \
  --library <library-root> \
  --transaction <transaction-id>
```

writer 按 Asset Library 逻辑提交协议发布 Commit Marker. Skill 不直接移动最终 objects.

### 9. Refresh Draft Metadata and Index

Commit 后, 如果当前 Draft hash 仍等于 prepare 时的 `draftContentSha256`, writer 保留 Draft 的原始正文和语言, 仅把 `basedOnRevisionId` 更新为新 Revision. Generation 成功、失败或中断都不得把 effective Prompt 写回 Draft. 如果用户在生成期间修改 Draft, 不覆盖用户内容, 也不更新其 based-on metadata, 只报告 concurrent edit.

正常路径只增量投影尚未处理的 Commit Marker. 每个 Marker 在单个 SQLite transaction 中应用, 成功后原子更新 `last_indexed_marker`. 全量 rebuild 只用于 cache 缺失、Schema 变化、confirmed SQLite corruption 或显式 recovery. Catch-up 与 rebuild 先竞争同一个跨进程 Index Writer coordinator, 最多等待 8 秒; 获锁后重新读取 Marker 与 cursor, 禁止使用等待前 snapshot 或因 contention 启动第二个 rebuild.

索引失败记录 warning, 不回滚已 committed Generation. 高层 command 返回 `index: degraded`、stable `code` 与实际 `lagCount`; `INDEX_WRITER_BUSY`、`INDEX_COORDINATOR_FAILED`、`INDEX_PROJECTION_FAILED` 和 `INDEX_REBUILD_FAILED` 不属于 Generation failure. 后续运行从最后一个已应用 Marker 继续 catch up; 不重新调用图片工具.

### 10. Report

Skill 最终报告:

- Creation、Revision、Generation 和 transaction ID.
- Generation terminal status.
- Archive 内 Output path 与 hash.
- 实际 Prompt Revision path.
- built-in tool mode.
- 任何未更新 Draft、索引失败或 recovery warning.
- `workflowRunId`、用户端到端耗时、各可观测阶段 duration 与 SLO 判断.

## Performance and Progress Contract

Generation Workflow 同时维护用户体验 SLO 与仓库执行 SLO. 两层使用同一个 `workflowRunId` 关联, 但仓库计时不得代替 Codex UI 从请求到最终回复的端到端时间.

Workspace Ready 不要求当前 Codex task 已执行过 Generation, 也不依赖文档或 Prompt 缓存. 此状态下的 workflow 目标:

- 用户端到端耗时为图片模型耗时加不超过 30 秒非模型开销.
- `request -> invocation_started` p95 不超过 20 秒.
- `tool_returned -> committed and index-ready` p95 不超过 10 秒.

Skill 只显示真实阶段与累计耗时:

```text
Preflight
Reference ingress
Prompt frozen
Waiting for image model
Output captured
Archive committed
Index ready
```

provider 没有暴露 progress event 时不显示百分比或 ETA. 等待超过 60 秒可以显示 heartbeat 与已等待时长. 只有 Commit Marker 有效且 index ready 后才能报告完成; committed 但 index degraded 时报告 `Committed, index degraded`.

Workflow telemetry 不写入 immutable Archive. 同一个 `workflowRunId` 关联 Codex UI 权威 duration 与 repository spans; UI duration 未暴露时用户端到端结果为 `unknown`, 不从 repository timings 推测. Telemetry 只包含 IDs、阶段名、monotonic duration、terminal status 与 stable error code, 不包含 Prompt、Reference guidance、文件路径、provider transcript 或 opaque handle. Telemetry failure 不得影响 Generation commit.

## Replay

Replay 读取源 Generation 的 Prompt Revision、Reference Image relation 和全部已知 tool fields, 创建新 transaction 和 Generation. 不复制未知参数, 不保证相同像素.

`replayOfGenerationId` 只指向直接 Replay source, 允许形成链. UI 可以追溯链, validator 要求 source Generation 已提交.

## Recovery

| State                | Evidence                    | Allowed Recovery                                                 |
| -------------------- | --------------------------- | ---------------------------------------------------------------- |
| `prepared`           | 没有 invocation marker      | 显式 cancel, 不创建 Generation                                   |
| `invocation_started` | 调用结果不完整或未知        | finalize 为 `interrupted`, `outcomeKnown: false`; 禁止自动 retry |
| `outputs_captured`   | staged Output 完整          | 重新 inspect、finalize 并继续 commit                             |
| `ready_to_commit`    | terminal records 完整       | 幂等重试 commit                                                  |
| malformed            | Schema、hash 或引用无法验证 | 移入 `.quarantine/`                                              |

Recovery commands:

```bash
npm run assetctl -- recover list --library <library-root>
npm run assetctl -- recover inspect --library <library-root> --transaction <transaction-id>
npm run assetctl -- recover cancel --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover cancel --library <library-root> --transaction <transaction-id> --confirm
npm run assetctl -- recover finalize-interrupted --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover finalize-interrupted --library <library-root> --transaction <transaction-id> --confirm
npm run assetctl -- recover commit --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover commit --library <library-root> --transaction <transaction-id> --confirm
npm run assetctl -- recover quarantine --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover quarantine --library <library-root> --transaction <transaction-id> --confirm
```

所有 destructive recovery 都先显示 exact target 和 dry-run result. Cancel 仅适用于没有 invocation evidence 的 `prepared` transaction. quarantine 是可恢复 move, 不是 delete.

Purge 默认不删除 staging 或 quarantine evidence. 如果相关 evidence 阻塞 Creation Purge 或 Image Asset Purge, 用户可以在 Purge Plan 中逐个选择 exact transaction ID 并二次确认 Recovery Evidence Abandonment. 存活 owner 或仍在执行的图片工具调用始终阻塞; malformed quarantine 不根据 age 或内容猜测归属. 详细协议见 [Purge Workflow](./purge-workflow.md).

## Project-level Hook

`.codex/hooks.json` 配置:

- `PreToolUse` 匹配 `Bash` 和 `apply_patch`.
- guard script 解析 canonical Library root 与 tool input.
- 阻断直接修改 Archive、assets、staging、quarantine 和 lock 的操作.
- 允许 Draft、Inbox、Curation、源码和明确的 `assetctl` subcommands.
- `Stop` 执行只读 quick/full scoped validation; 检测到本轮引入错误时返回 block reason.

Hook 永远不写资产、不自动 repair、不清理 staging. 因为某些工具路径可能绕过 Hook, 共享写入器和 validator 仍是权威边界.

## Failure Handling

- built-in tool unavailable: finalize known failure if tool明确返回失败; 不自动切换 CLI fallback.
- safety moderation rejection: 使用 stable error code 和 optional moderation metadata 归档 `failed`; 保留 Prompt Revision, 不自动改写或重试.
- xAI transport、response read、response validation 或 Output validation failure: 归档 `interrupted`, 并在当前 CLI result 返回 bounded diagnostic code 与 stage; 不持久化底层异常.
- xAI Capture、Finalize、Commit 或 index failure: 保留当前 repository recovery evidence 并返回原有 typed error; 不用 `GENERATION_OUTCOME_UNKNOWN` 覆盖.
- Codex loses result after invocation: recovery 为 `interrupted`, outcome unknown.
- Output path inaccessible: 保留 transaction, 请求所需权限或显式 recovery.
- Reference Asset changed on disk: hash validation 失败, 拒绝调用并报告 Archive corruption.
- Draft concurrent edit: Generation 继续使用已冻结 Revision, commit 后不覆盖新 Draft.
- Commit lock conflict: 有界等待后返回 retryable error, 不重新调用图片生成工具.
- Index failure: Generation committed, UI 显示 index degraded 并允许 rebuild.
- Prepare 后内存 Prompt 丢失: transaction 保持 `prepared`, 禁止根据摘要重构并继续调用; 只能显式 cancel 后重新开始.
- Prompt hash mismatch: 在 invocation marker 前 fail closed, 不调用图片工具.

## Compatibility

Skill 的 supported Library format range 必须显式声明. 新 Schema 未被 Skill 支持时, Skill 拒绝生成, 不进行 best-effort 写入.

当前 development baseline 直接更新 format `1` 的 Safety Rejection contract, 不提供 migration 或旧 reader compatibility guarantee. Existing Library 不符合新 validator 时整体重新初始化; 不把 `.cache/` rebuild 当作 Archive migration.

Skill 调用 CLI 时要求 machine-readable version handshake:

```bash
assetctl capabilities --format json
```

返回 supported format、commands 和 built-in generation workflow version. Skill 不根据 help text 猜测能力.

## Validation

- Prompt augmentation golden tests: 常规优化不改变核心意图.
- Material-change tests: 主体、构图、用途、风格方向变化必须要求确认.
- fake generator tests: success、generic known failure、input/output/unknown Safety Rejection、lost result、multiple Output、Replay.
- stdin framing tests: `LF`、EOF compatibility、精确 1 MiB boundary、oversize、严格 invalid UTF-8、第二个 JSON value 与尾随非空内容, 以及 child process 在未发送 EOF 时于 `LF` 后返回.
- Prompt identity tests: Prepare Prompt 与 tool argument UTF-8 byte-identical, hash mismatch 不写 invocation marker.
- Preflight tests: 单次只读返回、multi-source all-or-nothing inspection、fixed Library root 与 no-write assertion.
- incremental index tests: ordered Marker catch-up、atomic `last_indexed_marker`、degraded result 与 full rebuild recovery.
- performance contract tests: fake generator 下 warm pre-tool p95、post-tool p95 与非模型端到端 budget.
- fault injection: 每个 state transition 和 commit step 进程中断.
- Hook tests: protected/allowed path matrix, external Library path, symlink, shell indirection.
- real smoke: 无 Reference Image、带 Reference Image、Prompt branch 后各执行一次 built-in generation.
