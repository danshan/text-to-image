# CLI Contract

所有结构化敏感 payload 都通过 stdin 传递. 在 Codex 中启动带 PTY 的 `npm run assetctl -- ...-stdin` 进程, 再把一个 JSON value 写入 stdin 并发送 EOF. 不用 `echo`, `printf`, heredoc, pipe 或 argv 携带 Prompt 和 tool result.

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

## Prepare

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
  "referencePaths": [
    "/canonical/library/root/assets/sha256/92/92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a.png"
  ]
}
```

`referencePaths` 的顺序必须与 request `references` 一致.

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
    "code": "IMAGE_GENERATION_FAILED",
    "message": "The built-in image generation tool returned a known failure.",
    "retryable": false
  }
}
```

`message` 只保留短摘要. 即使上游标记 `retryable`, Skill 也不自动 retry.

## Commit

```bash
npm run assetctl -- generation commit --library <library-root> --transaction <transaction-id>
```

只把 stdout 中 `committed: true` 且存在有效 Commit Marker 视为 Archive success. Draft hash 冲突和 index failure 是 warning, 不回滚已经提交的 Generation.
