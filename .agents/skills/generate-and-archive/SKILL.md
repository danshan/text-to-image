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

Workspace Ready 的普通 Generation 使用最小确定输入. 只读取本 Skill、CLI contract、Prompt policy 与一次 Preflight snapshot; 不重新读取 `task_plan.md`、全部设计文档、`findings.md` 或 `progress.md`. 只有修改项目行为时才执行 repository Required Reading, 只有异常或显式 recovery 才读取 Recovery.

1. 标准生成或 Replay 前读取 [CLI contract](references/cli-contract.md).
2. 构造 effective prompt 或处理 Reference Image 时读取 [Prompt policy](references/prompt-policy.md).
3. 发现未完成 transaction, 结果丢失或 commit 失败时读取 [Recovery](references/recovery.md).

## Workflow

### 1. Preflight

1. 从 repository root 工作, 不修改任何全局 Codex 配置.
2. 运行一次只读的 `generation preflight --creation <creation-id> --request-stdin --format json`:

```bash
npm run assetctl -- generation preflight --creation <creation-id> --request-stdin --format json
```

该 command 一次完成 capability check、Library resolution、quick validation、recovery listing、Draft snapshot、Reference 校验与全部 Session Image inspection, 并返回 canonical `libraryRoot`. 它不创建 transaction、不导入 Image Asset、不修改 Archive.

3. 保存这次 preflight 的完整 snapshot 与 canonical `libraryRoot`; 后续命令必须复用它, 不得再次运行 capabilities、resolver、recover list、Draft read 或 asset inspection.

4. 向用户报告 snapshot 中的未恢复 transaction, 但不自动处理或阻断无关 Creation. 验证 `creationId`, Prompt Draft、可选 parent Revision 与 Reference roles. 已提交 Image Asset 可以直接作为 Reference; Session Image 必须先按下一节完成 ingress.

### 2. Import Materialized Session Images

会话中 attach、paste 或 drag 的图片称为 Session Image. 它不是 Reference Image; 只有原始 bytes 已物化为可读取本地文件并导入当前 Library 后, 才能参与 Generation.

1. 按用户提供或会话出现顺序稳定编号 Session Image. 根据用户明确措辞解析 `roles` 与可选 `guidance`; 不能只根据图片内容猜测 role. 意图不足时先询问, 不设置默认 role.
2. 如果 Session Image 只有 opaque session handle, 且宿主没有暴露原始 bytes 或可读取本地 path, 以 `SESSION_IMAGE_NOT_MATERIALIZED` 停止. 不调用 `image_gen`, 不创建 Generation transaction, 不要求用户重复保存一个其实已经具有可读路径的文件.
3. 复用 Preflight snapshot 中与 source 顺序对应的 inspection 结果. 不重复调用 `asset inspect` 或重新读取同一 source.
4. 任一 inspection 失败时整体停止, 不忽略失败图片后继续. 区分 `IMAGE_SOURCE_MISSING`, `IMAGE_SOURCE_UNREADABLE`, `IMAGE_UNSUPPORTED` 与 `IMAGE_INVALID`; sandbox permission denial 不能误报为 missing, 应请求目标文件的 scoped read access 后有限重试一次.
5. 使用 inspection 返回的 `assetSha256` 构造 Reference relation, 并把 canonical `sourcePath` 与 expected hash 交给后续 `generation begin`. 不单独调用 `asset import`.
6. `generation begin` 复用共享 importer 按稳定顺序导入, 比较 expected 与 actual `assetSha256`, 再 prepare 与 mark. 不一致时以 `SESSION_IMAGE_CHANGED` 停止; 已提交的独立 `import_asset` transaction 保留, 不删除或回滚.

### 3. Freeze Effective Inputs

1. 使用 Preflight 返回的 Draft snapshot, 不重新读取 `prompt-draft.md` 或 `prompt-draft.json`.
2. 根据 Draft, `changeInstruction` 和 Reference guidance 构造完整 effective prompt.
3. 常规质量补足可以直接执行. 若推断会改变主体, 构图目标, 用途或风格方向, 先展示具体变化并等待用户确认.
4. 保留 `changeInstruction` 与 effective prompt 的区别. 后者是实际发送给图片生成工具并归档的 Prompt Revision.
5. 对每个 Reference 验证 `roles` 非空且去重. `other` 必须具有明确 `guidance`.

### 4. Begin Through Stdin

创建 `workflowRunId`, 记录 Workflow start 和真实阶段时间. 按 [CLI contract](references/cli-contract.md) 构造 begin request. 启动下面的命令, 再通过该进程 stdin 发送一个 JSON value 和单个 `LF`. Prompt 或 tool result 不得放入 argv, shell pipeline, temporary shell script 或 shell history.

```bash
npm run assetctl -- generation begin --library <library-root> --creation <creation-id> --request-stdin
```

Begin 依次复用 Session Image import、Prepare、Prompt hash gate 与 Mark primitives. 保存 stdout 返回的 `transactionId`, `revisionId`, `generationId`, `promptSha256`, `referencePaths` 和每个 Session Image 的 imported/reused 结果. stdout 必须是单个 JSON value; diagnostic 只从 stderr 读取. stdin payload 以首个 `LF` 或 EOF 结束, 最大 1 MiB. CLI 在 TTY 下自治切换并恢复 raw mode; Skill 不运行 `stty`.

Begin 失败时不调用图片工具. 已完成的独立 import 保留; `prepared` 或 `invocation_started` transaction 按 Recovery 处理. `generation prepare`, `generation mark-invocation-started` 与 `generation verify-prompt` 仅用于 recovery、diagnostic 或 fault injection, 不属于 happy path.

从这一刻起, 不确定结果必须保守归类为 `interrupted`; 不得自动重试.

### 5. Invoke Built-in Image Generation

直接调用 built-in `image_gen.imagegen`:

- 新图片且没有 Reference 时, 只传 `prompt`.
- 存在 Reference 时, 传 `prompt` 和 prepare 返回的 `referenced_image_paths`.
- 不传 destination path, `num_last_images_to_include`, edit target 或其他未归档输入.

一次调用只对应当前 `generationId`. 如果用户要求多个 variant, 当前事务完成或留下明确 recovery 状态后, 再创建下一事务.

### 6. Finalize, Commit, and Inspect

记录 tool returned 时间. Tool 明确成功时, 把每个本地 output path 放入 `outputSources`, 并通过 stdin 发送 success payload. 高层 command 依次复用 Capture、Complete、Commit 与增量 index catch-up:

图片工具返回可解析的本地 output path 后, 下一动作必须启动 `generation finalize`; 不在两者之间发送 progress commentary、执行质量分析或调用其他工具. Finalize command 启动后再报告状态.

```bash
npm run assetctl -- generation finalize --library <library-root> --transaction <transaction-id> --result-stdin --format json
```

payload 同时发送 `workflowRunId`, `workflowElapsedMsBeforeFinalize`, `preToolMs` 与 `postToolMsBeforeFinalize`. Codex UI duration 不可观测时不发送 `nonModelOverheadMs`, 最终 SLO 保持 `unknown`. 不用 repository span 推测 UI duration.

Tool 明确失败时发送 bounded error payload, 不归档 secret、完整 transcript 或不受控 stack trace. Safety rejection 使用 `IMAGE_GENERATION_SAFETY_REJECTED` 与工具明确暴露的 moderation metadata.

如果 tool 成功但没有可解析的本地 path, 停止流程并按 Recovery 报告 transaction; 不伪造 Output 或 success. 任一 Capture 失败时保留已有 transaction evidence, 不再次调用图片工具.

高层命令返回 `index.status: "degraded"` 时 Generation 已提交但不得报告 `index ready`; 后续只追平 Commit Marker, 不重复调用图片工具. Recovery、fault injection 和精确状态检查继续使用 `generation capture | complete | fail | commit` 等低层 commands.

built-in image result 已在会话中可见时, 直接用它记录质量观察, 不在 commit 前重复调用 `view_image`. 只有结果未在会话中可见或需要验证 committed bytes 时, 才在 commit 后读取 Archive Output. 主观质量不改变 Generation status, 所有 Output 仍归档.

Commit 失败时不再次调用图片工具. 使用 recovery inspection 判断幂等 commit 或 quarantine.

Output-stage Safety Rejection 必须表述为生成结果被拒绝, 不得断言 Prompt violation. Generation 成功、失败或中断后都不得用 effective Prompt 覆盖用户 Draft; commit 只在 Draft hash 未变化时更新 `basedOnRevisionId`.

### 7. Report

最终报告必须包含:

- Creation, transaction, Revision 与 Generation ID.
- 终态 `succeeded`, `failed` 或 `interrupted`.
- Prompt Revision 的 Archive relative path.
- 每个 Output 的 Archive relative path, SHA-256, media type 与尺寸.
- tool name `image_gen.imagegen`, 已知 model/parameters 或明确 unknown.
- Reference Image roles 与 guidance 摘要.
- 每个 Session Image 的 source index、imported 或 reused 状态与最终 Image Asset SHA-256; 不暴露 opaque internal handle.
- Draft concurrent edit, index degraded, quality observation 或 recovery warning.
- `workflowRunId`, observed stage durations and the two-layer SLO result. Codex UI duration 是用户端到端权威值; 未暴露时报告 `unknown`, 不从 repository spans 推测. Report real stages and elapsed time only; without provider progress events, do not print percentage or ETA. A wait longer than 60 seconds may print a heartbeat with elapsed duration.
- Draft 正文保持用户编写的原文和语言; effective Prompt 仅通过 Prompt Revision 报告.

不要把 tool success 等同于 Archive success. 只有有效 Commit Marker 发布后才能报告 committed.
