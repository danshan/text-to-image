# CLI Contract

所有结构化敏感 payload 都通过 stdin 传递. Canonical framing 是在带 PTY 的 `npm run assetctl -- ...-stdin` 进程中写入单个 JSON value 并发送一个 `LF`; EOF-only input 仅作为兼容行为. CLI 检测 TTY 后自治切换到 non-canonical/no-echo raw mode, settled 后恢复原状态; Skill 不运行 `stty`. 不用 `echo`, `printf`, heredoc, pipe 或 argv 携带 Prompt 和 tool result.

## Capability and Resolution

```bash
npm run assetctl -- capabilities --format json
npm run assetctl -- library resolve --format json
```

Capabilities 必须声明支持 Library format `1`, Generation Workflow `1`, 以及本 reference 使用的 commands. Resolver stdout:

```json
{
  "libraryRoot": "/canonical/library/root"
}
```

## Generation Preflight

Command:

```bash
npm run assetctl -- generation preflight --creation <creation-id> --request-stdin --format json
```

The optional stdin request may contain `sessionImagePaths`, `references`, `basedOnRevisionId`, and already selected `providers`. The command resolves and validates capabilities and the Library once, then returns the fixed canonical `libraryRoot`, quick validation, Draft snapshot, `creationCuration` with Provider Preference and entity revision, `providerCapabilities`, pending recovery warning, and every source inspection result. It must not create a transaction, import an asset, or write a Commit Marker. Reuse this snapshot for the rest of the workflow; do not repeat resolver, recovery, Draft, or source inspection commands.

## Happy-path Begin Variant

Command:

```bash
npm run assetctl -- generation begin-variant --library <library-root> --creation <creation-id> --request-stdin
```

Begin Variant request 为每个 materialized Session Image 增加 Preflight 返回的 canonical `sourcePath` 与 expected hash, 并包含用户确认的 Provider invocations:

```json
{
  "prompt": "A complete effective prompt sent to the generation tool.",
  "changeInstruction": "Use softer side lighting while preserving identity.",
  "basedOnRevisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "references": [
    {
      "assetSha256": "92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a",
      "roles": ["subject"],
      "guidance": "Preserve subject identity."
    }
  ],
  "expectedCurationRevision": 3,
  "sessionImages": [
    {
      "sourcePath": "/canonical/source/reference.jpg",
      "expectedAssetSha256": "92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a"
    }
  ],
  "invocations": [
    {
      "provider": "openai",
      "tool": {
        "name": "image_gen.imagegen",
        "model": null,
        "parameters": {}
      }
    },
    {
      "provider": "xai",
      "tool": {
        "name": "xai.images.generate",
        "model": "grok-imagine-image-quality",
        "parameters": {}
      }
    }
  ]
}
```

Begin Variant 在任何 Archive write 前重新验证 Provider availability 与 Reference capability, 再以 `expectedCurationRevision` 更新 Provider Preference, 复用共享 importer, checkpoint 一个 Prompt Revision, 并为每个 Provider 创建独立 prepared Generation transaction. 任一 Session Image actual hash 与 expected hash 不同则返回 `SESSION_IMAGE_CHANGED`; 已提交 import 保留, 不调用 Provider. Response 包含共享 Revision fields、按 Provider 排列的 Generation transaction 与按 source index 排列的 imported/reused 结果.

## Low-level Prepare and Mark

Command:

```bash
npm run assetctl -- generation prepare --library <library-root> --creation <creation-id> --request-stdin
```

stdin request:

```json
{
  "prompt": "A complete effective prompt sent to the generation tool.",
  "changeInstruction": "Use softer side lighting while preserving identity.",
  "basedOnRevisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "references": [
    {
      "assetSha256": "92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a",
      "roles": ["subject", "composition"],
      "guidance": "Preserve the silhouette and framing, but ignore the background."
    }
  ],
  "replayOfGenerationId": null,
  "provider": "openai",
  "tool": {
    "name": "image_gen.imagegen",
    "model": null,
    "parameters": {}
  }
}
```

首个 Revision 使用 `basedOnRevisionId: null`. 普通生成使用 `replayOfGenerationId: null`. Replay 必须复制 source Generation 的全部已知 inputs 和 tool fields, 并设置 direct source ID.

stdout response:

```json
{
  "transactionId": "9f386ef3-b8ce-4197-ad14-a2fda4c19754",
  "revisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "generationId": "755fc2f9-81a8-4d3d-84a0-09c54b12ed21",
  "promptSha256": "da88d518f0c3b93057393511685b93423f2b350c2e4ac84f7b8b64346a54b552",
  "referencePaths": [
    "/canonical/library/root/assets/sha256/92/92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a.png"
  ]
}
```

`referencePaths` 的顺序必须与 request `references` 一致.

`generation prepare` 只用于 Replay、recovery、diagnostic 与 fault injection. Replay 必须固定复制 source Generation 的 `provider`, model、parameters、Prompt 与 References. OpenAI happy path 与所有 low-level invocation 都通过 marker command 执行 byte gate:

```bash
npm run assetctl -- generation mark-invocation-started --library <library-root> --transaction <transaction-id> --prompt-sha256 <prompt-sha256> --format json
```

The gate must fail closed while the transaction remains `prepared`; the image tool must not be called after a mismatch. `generation verify-prompt` remains available only as a standalone diagnostic or fault-injection command.

## Direct Provider Invocation

Command:

```bash
npm run assetctl -- generation invoke-provider --library <library-root> --provider xai --transaction <transaction-id> --format json
```

该 command 只接受由 `generation begin-variant` prepared 且 provider 为 `xai` 的 transaction. CLI 从 process environment 优先读取 `XAI_API_KEY`, 其次读取 ignored repository `.env`; secret 不进入 request payload、argv、Archive 或返回值. 无 Reference 时调用 xAI generations endpoint, 1–3 张时调用 edits endpoint, 固定 `n = 1` 与 `b64_json`, 并完整执行 mark、bounded response decode、Capture、terminal finalize、Commit 与 incremental index catch-up. 明确 HTTP failure 归档 `failed`; transport、timeout、truncated 或 invalid success payload 归档 `interrupted`; 不自动 retry 或 fallback.

Success 与 known HTTP failure 返回 `diagnostic: null`. `interrupted` 返回 non-Archive bounded diagnostic:

```json
{
  "committed": true,
  "generation": {
    "status": "interrupted",
    "outcomeKnown": false
  },
  "diagnostic": {
    "code": "XAI_RESPONSE_INVALID",
    "stage": "response_validation"
  }
}
```

`code` 只允许 `XAI_TIMEOUT`, `XAI_TRANSPORT_FAILED`, `XAI_RESPONSE_READ_FAILED`, `XAI_RESPONSE_INVALID` 与 `XAI_OUTPUT_INVALID`. `stage` 只允许 `transport`, `response_read`, `response_validation` 与 `output_validation`. Result 不返回 raw error、response body、request ID、API URL、credential 或本机 path. 全部 provider Output 必须先完成 Image inspection, 再进入共享 Capture; Capture、Finalize、Commit 与 index error 原样向上返回并保留 recovery state.

## Session Image Ingress

Session Image 具有可读本地 path 时, 先对全部 source 执行只读 inspection:

```bash
npm run assetctl -- asset inspect --library <library-root> --source <source-path> --format json
```

成功 stdout:

```json
{
  "sourcePath": "/canonical/source/reference.jpg",
  "assetSha256": "92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a",
  "byteLength": 145280,
  "mediaType": "image/jpeg",
  "extension": "jpg",
  "width": 1536,
  "height": 1024
}
```

只有全部 inspection 成功且 Reference roles 已明确时才调用 `generation begin`. Begin 内部逐个执行独立 committed import 并比较 hash. `IMAGE_SOURCE_MISSING` 表示 path 不存在, `IMAGE_SOURCE_UNREADABLE` 表示权限或文件类型无法读取, `IMAGE_UNSUPPORTED` 表示明确不支持的图片类型, `IMAGE_INVALID` 表示 payload 无效. opaque session handle 不进入 CLI, 由 Skill 报告 `SESSION_IMAGE_NOT_MATERIALIZED`.

## Complete

Command:

```bash
npm run assetctl -- generation complete --library <library-root> --transaction <transaction-id> --result-stdin
```

stdin request:

```json
{
  "toolResult": {
    "model": null,
    "parameters": {},
    "outputCount": 1
  }
}
```

`outputCount` 必须等于已成功 capture 的 Output 数量. 只保存 tool 确实暴露的 model 和 parameters.

## Known Failure

Command:

```bash
npm run assetctl -- generation fail --library <library-root> --transaction <transaction-id> --error-stdin
```

stdin request:

```json
{
  "error": {
    "code": "IMAGE_GENERATION_SAFETY_REJECTED",
    "message": "The generated result was rejected by safety moderation.",
    "retryable": false,
    "moderation": {
      "stage": "output",
      "categories": ["sexual"]
    }
  }
}
```

`message` 只保留短摘要. Safety rejection 使用 stable code; `moderation` 只保存工具明确暴露的 `input`, `output` 或 `unknown` stage 与最多 20 个去重 category. 不保存 provider transcript、request ID 或 evidence guess. 即使上游标记 `retryable`, Skill 也不自动 retry.

## Commit

```bash
npm run assetctl -- generation commit --library <library-root> --transaction <transaction-id>
```

只把 stdout 中 `committed: true` 且存在有效 Commit Marker 视为 Archive success. Commit 后保留用户 Prompt Draft 的原文和语言, hash 未变化时只更新 `basedOnRevisionId`; effective Prompt 只存在于 immutable Prompt Revision. Draft hash 冲突和 index failure 是 warning, 不回滚已经提交的 Generation.

## Happy-path Finalize

```bash
npm run assetctl -- generation finalize --library <library-root> --transaction <transaction-id> --result-stdin --format json
```

Success payload:

```json
{
  "outputSources": ["/local/generated/output.png"],
  "toolResult": {
    "model": null,
    "parameters": {},
    "outputCount": 1
  },
  "workflowRunId": "de305d54-75b4-431b-adb2-eb6b9e546014",
  "workflowElapsedMsBeforeFinalize": 183500,
  "preToolMs": 12500,
  "postToolMsBeforeFinalize": 800,
  "nonModelOverheadMs": null
}
```

This command composes source Capture, existing terminal finalize, Commit Marker publication, and incremental Read Model catch-up. `postToolMs` includes `postToolMsBeforeFinalize` plus command execution; when the caller did not observe the earlier span it remains `null`. `nonModelOverheadMs` is only supplied from authoritative Codex UI duration minus observed provider duration; otherwise it remains `null` and `overheadPass` is `null`.

Recovery and fault-injection commands remain the low-level interface. A returned `index.status` of `degraded` means the Generation is committed but the index is not ready. Built-in result inspection does not block commit; committed Output is read afterward only when the result was not already visible or committed bytes require explicit verification.
