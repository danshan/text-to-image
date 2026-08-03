---
name: generate-and-archive
description: Generate images for a Creation and archive every invocation, effective prompt, reference relation, result, and failure in the configured local Asset Library. Preserve the user-authored Prompt Draft while storing the effective Prompt only in the immutable Prompt Revision. Use this workflow when the user explicitly invokes this skill to generate variants, replay a Generation, or recover an interrupted image-generation transaction. Do not use it for unarchived image generation, image editing, masks, or Web UI actions.
compatibility: Requires the repository assetctl npm script, built-in image_gen tool, view_image, and local filesystem access to the configured Asset Library.
---

# Generate and Archive

把一次 built-in image generation 调用变成可恢复, 可审计的 Generation. Archive 的唯一写入入口是 `npm run assetctl -- ...`; 不直接修改 `assets/`, `revisions/`, `generations/`, `.staging/` 或 Commit Marker.

## Boundaries

- 仅在用户显式调用本 Skill 时执行图片生成.
- 仅使用 built-in `image_gen.imagegen` generate mode. 不使用 edit target, mask, CLI/API fallback 或透明背景后处理.
- 每次 tool call 创建一个 Generation. 多个 variant 重复完整事务, 不把多个 tool call 合并到同一 Generation.
- 所有 Output 都归档. 主观质量不佳也不能丢弃, 后续通过 Curation 整理.
- 不编造 model, seed, quality 或未暴露参数. 未知值使用 `null` 或省略.
- 不自动 retry. Replay 与 retry 都必须是新的显式 Generation.

## Load References

1. 标准生成或 Replay 前读取 [CLI contract](references/cli-contract.md).
2. 构造 effective prompt 或处理 Reference Image 时读取 [Prompt policy](references/prompt-policy.md).
3. 发现未完成 transaction, 结果丢失或 commit 失败时读取 [Recovery](references/recovery.md).

## Workflow

### 1. Preflight

1. 从 repository root 工作, 不修改任何全局 Codex 配置.
2. 运行 `npm run assetctl -- capabilities --format json`, 要求 Library format `1` 与 Generation Workflow `1`.
3. 运行 `npm run assetctl -- library resolve --format json`, 只使用返回的 canonical `libraryRoot`.
4. 运行 `npm run assetctl -- recover list --library <library-root> --format json`. 向用户报告未恢复 transaction, 但不自动处理或阻断无关 Creation.
5. 在本次工作流中固定 resolver 返回的 `libraryRoot`; 后续命令不得重新解析、切换或使用会话中的旧 Library path.
6. 验证 `creationId`, Prompt Draft、可选 parent Revision 与 Reference roles. 已提交 Image Asset 可以直接作为 Reference; Session Image 必须先按下一节完成 ingress.

### 2. Import Materialized Session Images

会话中 attach、paste 或 drag 的图片称为 Session Image. 它不是 Reference Image; 只有原始 bytes 已物化为可读取本地文件并导入当前 Library 后, 才能参与 Generation.

1. 按用户提供或会话出现顺序稳定编号 Session Image. 根据用户明确措辞解析 `roles` 与可选 `guidance`; 不能只根据图片内容猜测 role. 意图不足时先询问, 不设置默认 role.
2. 如果 Session Image 只有 opaque session handle, 且宿主没有暴露原始 bytes 或可读取本地 path, 以 `SESSION_IMAGE_NOT_MATERIALIZED` 停止. 不调用 `image_gen`, 不创建 Generation transaction, 不要求用户重复保存一个其实已经具有可读路径的文件.
3. 对全部 materialized Session Image 先执行只读 inspection, 此阶段不导入任何图片:

```bash
npm run assetctl -- asset inspect --library <library-root> --source <session-image-path> --format json
```

4. 任一 inspection 失败时整体停止, 不忽略失败图片后继续. 区分 `IMAGE_SOURCE_MISSING`, `IMAGE_SOURCE_UNREADABLE`, `IMAGE_UNSUPPORTED` 与 `IMAGE_INVALID`; sandbox permission denial 不能误报为 missing, 应请求目标文件的 scoped read access 后有限重试一次.
5. 全部 inspection 成功后, 按相同顺序逐个导入:

```bash
npm run assetctl -- asset import --library <library-root> --source <canonical-source-path> --format json
```

6. 比较 import 与 inspection 返回的 `assetSha256`. 不一致表示 source 在两步之间发生变化; 以 `SESSION_IMAGE_CHANGED` 停止, 不创建 Generation transaction. 已经提交的独立 `import_asset` transaction 保留, 不删除或回滚.
7. 使用 import 返回的 `assetSha256` 构造 Reference relation. 内容寻址复用不是错误; `reused: true` 与新导入都可以继续.
8. 任一 import 失败时整体停止 Generation. 已提交 Image Asset 保留; 重试依靠内容寻址去重.

### 3. Freeze Effective Inputs

1. 读取 Creation 的 `prompt-draft.md` 与 `prompt-draft.json`.
2. 根据 Draft, `changeInstruction` 和 Reference guidance 构造完整 effective prompt.
3. 常规质量补足可以直接执行. 若推断会改变主体, 构图目标, 用途或风格方向, 先展示具体变化并等待用户确认.
4. 保留 `changeInstruction` 与 effective prompt 的区别. 后者是实际发送给图片生成工具并归档的 Prompt Revision.
5. 对每个 Reference 验证 `roles` 非空且去重. `other` 必须具有明确 `guidance`.

### 4. Prepare Through Stdin

按 [CLI contract](references/cli-contract.md) 构造 prepare request. 启动下面的命令, 再通过该进程 stdin 发送一个 JSON value 和 EOF. Prompt 或 tool result 不得放入 argv, shell pipeline, temporary shell script 或 shell history.

```bash
npm run assetctl -- generation prepare --library <library-root> --creation <creation-id> --request-stdin
```

保存 stdout 返回的 `transactionId`, `revisionId`, `generationId` 和 `referencePaths`. stdout 必须是单个 JSON value; diagnostic 只从 stderr 读取.

### 5. Mark Before Invocation

在调用图片工具前运行:

```bash
npm run assetctl -- generation mark-invocation-started --library <library-root> --transaction <transaction-id>
```

从这一刻起, 不确定结果必须保守归类为 `interrupted`; 不得自动重试.

### 6. Invoke Built-in Image Generation

直接调用 built-in `image_gen.imagegen`:

- 新图片且没有 Reference 时, 只传 `prompt`.
- 存在 Reference 时, 传 `prompt` 和 prepare 返回的 `referenced_image_paths`.
- 不传 destination path, `num_last_images_to_include`, edit target 或其他未归档输入.

一次调用只对应当前 `generationId`. 如果用户要求多个 variant, 当前事务完成或留下明确 recovery 状态后, 再创建下一事务.

### 7. Capture and Inspect

对 tool 返回的每个本地 output path 分别运行:

```bash
npm run assetctl -- generation capture --library <library-root> --transaction <transaction-id> --source <generated-image-path>
```

使用 `view_image` 检查每个 staged Output. 记录可见质量问题用于最终报告, 但仍归档全部 Output. 不删除 built-in tool 的原始输出.

如果 tool 成功但没有可解析的本地 path, 停止流程并按 recovery reference 报告 transaction; 不伪造 Output 或 success.

### 8. Finalize and Commit

Tool 明确成功时, 通过 stdin 发送 complete payload:

```bash
npm run assetctl -- generation complete --library <library-root> --transaction <transaction-id> --result-stdin
```

Tool 明确失败时, 通过 stdin 发送精简 fail payload, 然后提交该 failed Generation:

```bash
npm run assetctl -- generation fail --library <library-root> --transaction <transaction-id> --error-stdin
```

不要归档 secret, 完整 transcript 或不受控 stack trace. Finalize 成功后运行:

```bash
npm run assetctl -- generation commit --library <library-root> --transaction <transaction-id>
```

Commit 失败时不再次调用图片工具. 使用 recovery inspection 判断幂等 commit 或 quarantine.

如果图片工具明确返回 safety rejection, 使用 `IMAGE_GENERATION_SAFETY_REJECTED` 和可选 bounded `moderation` metadata. Output-stage rejection 必须表述为生成结果被拒绝, 不得断言 Prompt violation. Generation 成功、失败或中断后都不得用 effective Prompt 覆盖用户 Draft; commit 只在 Draft hash 未变化时更新 `basedOnRevisionId`.

### 9. Report

最终报告必须包含:

- Creation, transaction, Revision 与 Generation ID.
- 终态 `succeeded`, `failed` 或 `interrupted`.
- Prompt Revision 的 Archive relative path.
- 每个 Output 的 Archive relative path, SHA-256, media type 与尺寸.
- tool name `image_gen.imagegen`, 已知 model/parameters 或明确 unknown.
- Reference Image roles 与 guidance 摘要.
- 每个 Session Image 的 source index、imported 或 reused 状态与最终 Image Asset SHA-256; 不暴露 opaque internal handle.
- Draft concurrent edit, index degraded, quality observation 或 recovery warning.
- Draft 正文保持用户编写的原文和语言; effective Prompt 仅通过 Prompt Revision 报告.

不要把 tool success 等同于 Archive success. 只有有效 Commit Marker 发布后才能报告 committed.
