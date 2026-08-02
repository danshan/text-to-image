---
title: Generation Workflow Design
status: accepted
owner: project
last_updated: 2026-08-02
related:
  - ../../CONTEXT.md
  - asset-library.md
  - ../adr/0002-enforce-the-archive-with-repository-owned-controls.md
  - ../adr/0006-commit-generations-atomically.md
---

# Generation Workflow 设计

## Context

Generation Workflow 是仓库级 Codex Skill, 负责把 Creation 中的 Prompt Draft、Change Instruction 与 Reference Image 关系转换为一次可审计的 built-in image generation 调用, 再通过共享写入器归档所有输入、工具事实和 Output.

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

## Inputs

Skill 接受:

- `creationId`, 必填.
- `changeInstruction`, 可选; 新生成没有变化说明时可以为空字符串.
- Reference Image selections, 每项包含 `assetSha256`, `roles`, 可选 `guidance`.
- 可选 `basedOnRevisionId`, 未提供时使用 Draft metadata.
- 可选 variant count, 默认 `1`; Skill 逐次调用而不是把多个调用合并为一个 Generation.

Skill 必须从 canonical Library root 读取 Prompt Draft 和资产, 不接受未经导入的任意本地文件作为 Reference Image. 用户先通过 Inbox import 建立 Image Asset 身份.

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

1. 按统一优先级解析 Library root.
2. 运行 quick validation, 检查 format version、lock 和目标 Creation.
3. 列出未恢复 staging transactions; 存在异常不阻断无关 Generation, 但必须向用户显示 warning.
4. 读取 Prompt Draft、Draft metadata、selected Image Asset 和 Curation display data.
5. 对每个 Reference Image 验证已提交身份、payload hash 和 roles.

### 2. Build Effective Prompt

1. 读取用户 Change Instruction.
2. 根据 parent Revision 和 Draft 构造 effective prompt.
3. 把输入图片按 index 和 role 写入 prompt scaffolding.
4. 检查 material change; 必要时等待用户确认.
5. 计算 prompt SHA-256, 分配 transaction、Revision 和 Generation ID.

### 3. Prepare Transaction

Skill 调用:

```bash
assetctl generation prepare \
  --library <library-root> \
  --creation <creation-id> \
  --request-stdin
```

共享写入器在 staging 中写入 Prompt Revision candidate、Generation skeleton 和 transaction metadata, 返回 machine-readable result:

```json
{
  "transactionId": "9f386ef3-b8ce-4197-ad14-a2fda4c19754",
  "revisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "generationId": "755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d",
  "referencePaths": [
    "/canonical/library/assets/sha256/92/92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a.png"
  ]
}
```

CLI 从 stdin 读取一个完整 JSON request, 避免 Prompt 出现在 argv、process list 或 shell history. JSON stdout 是 Skill 与 writer 的接口. human diagnostics 写入 stderr, 不得混入 stdout.

### 4. Mark Invocation

在调用 built-in tool 之前执行:

```bash
assetctl generation mark-invocation-started \
  --library <library-root> \
  --transaction <transaction-id>
```

此操作完成后如果 Codex 消失, outcome 必须视为 unknown. 该保守选择可能记录一次实际上尚未开始的 interrupted Generation, 但不会错误重试一个可能已经执行的调用.

### 5. Invoke Built-in Image Generation

Skill 使用 built-in `image_gen` tool. Reference Image 都是已知本地 path, 按工具要求作为 referenced images 提供. 不传入不存在的 destination-path 参数.

系统 Skill 会把结果默认保存到 `$CODEX_HOME/generated_images/...`. 项目 Skill 必须取得返回的本地 output path. 如果 tool 成功但没有可解析本地 path, transaction 保持可恢复状态并报告错误, 不伪造 Output.

### 6. Capture and Inspect

每个 output 调用:

```bash
assetctl generation capture \
  --library <library-root> \
  --transaction <transaction-id> \
  --source <generated-image-path>
```

capture 复制 bytes 到 transaction staging, sniff media type, 解码尺寸并计算 SHA-256. 原 `$CODEX_HOME` 文件不自动删除.

Codex 使用 `view_image` 检查 staged output 的主体、风格、构图、文字和明确约束. 质量不满意不改变 tool execution status; Output 仍提交, 用户可随后隐藏或评分.

### 7. Finalize Result

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

result 和 error JSON 均从 stdin 读取. error record 只保存分类、短摘要和可恢复标识, 不保存 secret、完整 transcript 或不受控 stack dump.

### 8. Commit

```bash
assetctl generation commit \
  --library <library-root> \
  --transaction <transaction-id>
```

writer 按 Asset Library 逻辑提交协议发布 Commit Marker. Skill 不直接移动最终 objects.

### 9. Refresh Draft and Index

Commit 后, 如果当前 Draft hash 仍等于 prepare 时的 `draftContentSha256`, writer 把 effective prompt 写回 Draft, 并把 `basedOnRevisionId` 更新为新 Revision. 如果用户在生成期间修改 Draft, 不覆盖用户内容, 只报告 concurrent edit.

indexer 异步消费 Commit Marker. 索引失败记录 warning, 不回滚 Generation.

### 10. Report

Skill 最终报告:

- Creation、Revision、Generation 和 transaction ID.
- Generation terminal status.
- Archive 内 Output path 与 hash.
- 实际 Prompt Revision path.
- built-in tool mode.
- 任何未更新 Draft、索引失败或 recovery warning.

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
- Codex loses result after invocation: recovery 为 `interrupted`, outcome unknown.
- Output path inaccessible: 保留 transaction, 请求所需权限或显式 recovery.
- Reference Asset changed on disk: hash validation 失败, 拒绝调用并报告 Archive corruption.
- Draft concurrent edit: Generation 继续使用已冻结 Revision, commit 后不覆盖新 Draft.
- Commit lock conflict: 有界等待后返回 retryable error, 不重新调用图片生成工具.
- Index failure: Generation committed, UI 显示 index degraded 并允许 rebuild.

## Compatibility

Skill 的 supported Library format range 必须显式声明. 新 Schema 未被 Skill 支持时, Skill 拒绝生成, 不进行 best-effort 写入.

Skill 调用 CLI 时要求 machine-readable version handshake:

```bash
assetctl capabilities --format json
```

返回 supported format、commands 和 built-in generation workflow version. Skill 不根据 help text 猜测能力.

## Validation

- Prompt augmentation golden tests: 常规优化不改变核心意图.
- Material-change tests: 主体、构图、用途、风格方向变化必须要求确认.
- fake generator tests: success、known failure、lost result、multiple Output、Replay.
- fault injection: 每个 state transition 和 commit step 进程中断.
- Hook tests: protected/allowed path matrix, external Library path, symlink, shell indirection.
- real smoke: 无 Reference Image、带 Reference Image、Prompt branch 后各执行一次 built-in generation.
