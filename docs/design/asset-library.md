---
title: Asset Library Design
status: accepted
owner: project
last_updated: 2026-08-03
related:
  - ../../CONTEXT.md
  - ../adr/0001-use-the-filesystem-as-the-source-of-truth.md
  - ../adr/0003-share-image-assets-across-creations.md
  - ../adr/0004-use-a-content-addressed-library-layout.md
  - ../adr/0005-use-a-rebuildable-sqlite-read-model.md
  - ../adr/0006-commit-generations-atomically.md
  - ../adr/0007-separate-curation-from-provenance.md
  - ../adr/0009-keep-runtime-libraries-out-of-source-control.md
  - ../adr/0010-enable-web-controlled-library-hot-switching.md
---

# Asset Library 设计

## Context

Asset Library 是提示词、参考图、生成图片和 provenance 的本地事实来源. Web UI、CLI 与 Codex Skill 必须通过同一个 archive package 解释和修改它. SQLite 及缩略图只是派生 cache.

运行时 Library 不进入源码 Git 历史. 仓库必须跟踪本设计、versioned JSON Schema、合法与非法 fixtures、初始化器、validator 和迁移器, 让新用户可以从格式契约生成 Library.

## Invariants

1. 只有被有效 Commit Marker 覆盖的 object 才属于 Archive.
2. Commit Marker、Prompt Revision、Generation 与已提交 Image Asset 不可修改或删除.
3. Image Asset 的身份是 payload bytes 的 lowercase SHA-256 hex digest.
4. Generation 只引用已提交 Prompt Revision 和 Image Asset.
5. Prompt Revision 和 Generation 只属于一个 Creation; Image Asset 属于整个 Library.
6. Curation 可变, 但永远不能改变 Archive provenance.
7. `.cache/` 可以整体删除, 删除后不得丢失权威信息.
8. 所有 managed path 必须位于 canonical Library root 内, 且 managed tree 内不得包含 symlink.
9. 单个进程一次只打开一个 Library.
10. breaking format migration 不得原地重写源 Library.
11. Server 只发布一个 active Library context; runtime switch 必须在排空旧请求后原子替换.

## Library Resolution

仓库跟踪默认配置:

```json
{
  "library": "./library"
}
```

默认文件名为 `text-to-image.config.json`. 本机可以创建被 Git 忽略的 `text-to-image.local.json`:

```json
{
  "library": "/Users/example/Pictures/text-to-image-library"
}
```

解析优先级:

1. CLI `--library <path>`.
2. `text-to-image.local.json`.
3. `text-to-image.config.json`.
4. 内建默认值 `./library`.

相对路径始终相对 Git root 解析. 实现必须 canonicalize root, 允许 Library root 自身是 symlink, 但解析后所有后续路径检查都基于真实路径. 如果 Codex sandbox 无权访问仓库外目录, Skill 必须请求目标目录权限, 不得创建替代 Library.

`assetctl init --library <path>` 成功后原子创建或替换 `text-to-image.local.json`, 保存 resolved canonical absolute path. `assetctl library select --library <path>` 对已有 Library 执行 full validation 后使用相同写入路径. 任一操作失败时不得改变原配置.

## Git Boundary

根 `.gitignore` 使用精确规则忽略默认运行时实例与本机配置:

```gitignore
/library/
/text-to-image.local.json
```

以下内容必须进入 Git:

```text
schemas/asset-library/v1/
fixtures/asset-libraries/v1-minimal/
fixtures/asset-libraries/v1-invalid-*/
packages/archive/
docs/design/asset-library.md
```

fixtures 使用小型测试图片和虚构内容, 不包含用户数据.

## Directory Layout

```text
<library-root>/
  library.json
  inbox/
  archive/
    commits/
      <transaction-id>.json
  assets/
    sha256/
      <first-two-hex>/
        <sha256>.<extension>
  creations/
    <creation-id>/
      creation.json
      prompt-draft.md
      prompt-draft.json
      revisions/
        <revision-id>/
          prompt.md
          revision.json
      generations/
        <generation-id>/
          generation.json
  curation/
    creations/
      <creation-id>.json
    images/
      <sha256>.json
  .staging/
    <transaction-id>/
      transaction.json
      objects/
  .quarantine/
    <transaction-id>/
  .locks/
    archive.lock
  .cache/
    index.sqlite
    thumbnails/
```

`inbox/` 与 `prompt-draft.md` 是仅有的用户直接编辑资产区域. `curation/` 是可变区域, 但应由 Web UI 或共享写入器修改. 其他目录均由工具管理.

## Common Conventions

- `schemaVersion` 是每个 JSON record 的正整数版本.
- `formatVersion` 是 `library.json` 的 Library 整体格式版本, MVP 为 `1`.
- 非 hash ID 使用 lowercase UUID string, 排序不得依赖 ID.
- 时间使用 UTC RFC 3339 string, 精确到 milliseconds.
- JSON 使用 UTF-8、2 spaces、LF 和 final newline.
- Archive JSON 的 digest 基于实际文件 bytes, 不是解析后的 object.
- Archive path 在 metadata 中使用相对 Library root 的 POSIX path, 不保存绝对路径.
- Image payload MVP 支持 `image/png`, `image/jpeg`, `image/webp`; extension 由 sniffed media type 决定, 不信任导入文件名.
- SVG、动画图片、损坏文件和 extension 与 bytes 不匹配的文件拒绝进入 Archive.
- 用户可见错误不得包含敏感路径之外的无关本机信息或 tool secrets.

## Model

### Library Manifest

`library.json` 由 `assetctl init` 创建:

```json
{
  "schemaVersion": 1,
  "formatVersion": 1,
  "libraryId": "1f447a49-0373-4d43-9cb4-f8d6ce35826a",
  "createdAt": "2026-08-02T12:00:00.000Z",
  "hashAlgorithm": "sha256"
}
```

`libraryId`, `createdAt` 和 `hashAlgorithm` 初始化后不可变. `formatVersion` 只允许显式兼容迁移修改.

### Creation Record

`creations/<creation-id>/creation.json` 是 Creation 的不可变身份记录:

```json
{
  "schemaVersion": 1,
  "id": "f69e912d-c504-4278-89d5-4558ba452df0",
  "createdAt": "2026-08-02T12:01:00.000Z"
}
```

标题、标签和状态不进入该 record, 而是位于 Curation.

### Prompt Draft

`prompt-draft.md` 保存可直接编辑的当前工作稿. `prompt-draft.json` 保存工具管理的协作 metadata:

```json
{
  "schemaVersion": 1,
  "basedOnRevisionId": "cd47f726-caf5-443d-bfd5-b566a6f1f4c3",
  "observedContentSha256": "d1697a1e6d7d2be36b8f81578a0f8377ed3c8853af5aaf3dcd5286436f510f90",
  "updatedAt": "2026-08-02T12:10:00.000Z"
}
```

直接编辑 Markdown 后 hash mismatch 表示外部合法编辑, 不是 Archive corruption. Web UI 必须重新加载内容, 保存时使用 optimistic concurrency check, 禁止静默覆盖.

Generation commit 不替换 Draft 正文. 当 prepare 期间的 Draft hash 仍保持不变时, writer 只更新 `basedOnRevisionId`; effective Prompt 仅属于不可变 Prompt Revision.

### Prompt Revision

`revisions/<revision-id>/prompt.md` 保存实际执行 Prompt. `revision.json` 保存关系:

```json
{
  "schemaVersion": 1,
  "id": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "creationId": "f69e912d-c504-4278-89d5-4558ba452df0",
  "parentRevisionId": "cd47f726-caf5-443d-bfd5-b566a6f1f4c3",
  "changeInstruction": "Use softer side lighting and preserve the subject identity.",
  "promptSha256": "24f87f891c2ca2cde1d90f5af5a715225fdca3adc186f9b73cfe3d824c7b37e8",
  "createdAt": "2026-08-02T12:12:00.000Z"
}
```

首个 Revision 的 `parentRevisionId` 为 `null`. Parent 必须属于同一 Creation. 图结构必须无环, 每个 Revision 最多一个 parent.

### Generation

`generation.json` 只保存终态调用:

```json
{
  "schemaVersion": 1,
  "id": "755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d",
  "creationId": "f69e912d-c504-4278-89d5-4558ba452df0",
  "promptRevisionId": "1567f72f-7a13-45cd-acd3-84a0090547e1",
  "replayOfGenerationId": null,
  "status": "succeeded",
  "outcomeKnown": true,
  "references": [
    {
      "assetSha256": "92b7b13cbeef65f8a258d705e19916a5917865543398eff786c749678a2d820a",
      "roles": ["subject", "composition"],
      "guidance": "Preserve the silhouette and framing, but ignore the background."
    }
  ],
  "outputs": [
    {
      "index": 0,
      "assetSha256": "89d3b6935c51f34d36b8f8ab8a884b02a71fba99f980e9f67352e6e2373bbf79",
      "mediaType": "image/png",
      "width": 1536,
      "height": 1024
    }
  ],
  "tool": {
    "name": "image_gen.imagegen",
    "model": null,
    "parameters": {}
  },
  "startedAt": "2026-08-02T12:12:05.000Z",
  "completedAt": "2026-08-02T12:13:12.000Z",
  "error": null
}
```

`roles` 非空、去重, 值限制为 `subject`, `style`, `composition`, `palette`, `other`. 仅使用 `other` 时 `guidance` 必填. `model` 和未知 parameters 必须保留 `null` 或缺失语义, 不得编造默认值.

`interrupted` 必须使用 `outcomeKnown: false`. `failed` 表示已知工具调用失败, `succeeded` 表示完整返回. 所有状态均允许零个或多个 Output, 但 validator 会对不寻常组合产生 diagnostic.

Safety Rejection 使用 stable error code 和可选 moderation metadata:

```json
{
  "code": "IMAGE_GENERATION_SAFETY_REJECTED",
  "summary": "The generated result was rejected by safety moderation.",
  "retryable": false,
  "moderation": {
    "stage": "output",
    "categories": ["sexual"]
  }
}
```

`moderation.stage` 限制为 `input`, `output`, `unknown`. `moderation.categories` 只保存工具明确暴露的去重 string values, 允许为空; 不保存 request ID、完整 provider payload 或 stack trace. `moderation` 为 optional, generic known failure 和旧 record 可以省略. Output-stage Safety Rejection 只证明生成结果被拒绝, 不证明 Prompt 本身违规.

### Image Asset

Image Asset 的权威 record 就是 content-addressed payload:

```text
assets/sha256/89/89d3b6935c51f34d36b8f8ab8a884b02a71fba99f980e9f67352e6e2373bbf79.png
```

media type、尺寸和 provenance 可以从 payload、Generation records 与 Commit Marker 重建. 外部导入 Image Asset 没有 producing Generation, 其首次提交时间来自引入它的 Commit Marker.

同一 bytes 再次导入或生成时复用已有 Image Asset. 已存在 payload 必须重新验证 digest, 不得覆盖.

### Commit Marker

`archive/commits/<transaction-id>.json` 是事务的唯一 visibility boundary:

```json
{
  "schemaVersion": 1,
  "id": "9f386ef3-b8ce-4197-ad14-a2fda4c19754",
  "operation": "generation",
  "createdAt": "2026-08-02T12:13:13.000Z",
  "records": [
    {
      "kind": "prompt",
      "path": "creations/f69e912d-c504-4278-89d5-4558ba452df0/revisions/1567f72f-7a13-45cd-acd3-84a0090547e1/prompt.md",
      "sha256": "24f87f891c2ca2cde1d90f5af5a715225fdca3adc186f9b73cfe3d824c7b37e8"
    },
    {
      "kind": "generation",
      "path": "creations/f69e912d-c504-4278-89d5-4558ba452df0/generations/755fc2f9-81a8-4d3a-89c4-3d60ca2ed21d/generation.json",
      "sha256": "069af11b4397176b5cd5f1649f54c9f31a1f10834ea4d19fdec4f0ba91686086"
    },
    {
      "kind": "image_asset",
      "path": "assets/sha256/89/89d3b6935c51f34d36b8f8ab8a884b02a71fba99f980e9f67352e6e2373bbf79.png",
      "sha256": "89d3b6935c51f34d36b8f8ab8a884b02a71fba99f980e9f67352e6e2373bbf79"
    }
  ]
}
```

实际 generation transaction 还必须列出 `revision.json`; 示例仅展示 record shape. Marker filename 必须等于 `id`. `operation` 支持 `initialize_creation`, `checkpoint_revision`, `import_asset`, `generation`, `merge_library`.

一个 path 最多由一个 Commit Marker 首次引入. 已存在 Image Asset 作为 dependency 使用时, 不在新 Marker 中重复声明.

### Curation

Creation Curation:

```json
{
  "schemaVersion": 1,
  "entityRevision": 4,
  "creationId": "f69e912d-c504-4278-89d5-4558ba452df0",
  "title": "Soft Light Portrait",
  "status": "active",
  "tags": ["portrait", "soft-light"],
  "favorite": true,
  "note": "Explore a warmer palette next.",
  "updatedAt": "2026-08-02T12:20:00.000Z"
}
```

Image Curation:

```json
{
  "schemaVersion": 1,
  "entityRevision": 2,
  "assetSha256": "89d3b6935c51f34d36b8f8ab8a884b02a71fba99f980e9f67352e6e2373bbf79",
  "tags": ["candidate"],
  "favorite": true,
  "rating": 4,
  "hidden": false,
  "note": "Strong composition, slightly cool skin tone.",
  "updatedAt": "2026-08-02T12:21:00.000Z"
}
```

`rating` 为 `null` 或 `1..5`. Curation 更新必须提交预期 `entityRevision`, 不匹配时返回 conflict 并要求重新加载.

## Flows

### Initialize

1. 解析并 canonicalize Library root.
2. 确认目标不存在或为空; 非空未知目录拒绝初始化.
3. 创建临时 sibling directory.
4. 写入 `library.json` 和基础目录, 完成 Schema 校验与 fsync.
5. 原子 rename 为目标 root.
6. 运行 full validator.

### Runtime Select

1. 用户从 Settings 输入 existing Library 的绝对路径, 或指定不存在或为空的 init target.
2. Server canonicalize path; init 拒绝 non-empty unknown target.
3. 单个内存态 transition 在旧 context 之外完成 candidate full validation 与 Index rebuild, 并报告 monotonic progress.
4. Candidate ready 后, Server 停止接收新 Library request 并排空旧 request.
5. Server 重新检查 candidate quick validation 与 Index lag, 原子持久化 canonical path, 再替换 active context.
6. 成功切换后关闭旧 Read Model 并轮换 session token; 旧 Browser tab 必须重新 bootstrap.

初始化成功但步骤 3 到 5 失败时, 新 Library 保留为 detached valid Library, 不自动删除. 持久化或切换失败不得改变旧 active context. 外部恢复原 root 后走同一 pipeline 的显式 Retry, 不自动打开.

### Import an Image

1. 从 Inbox 或显式 source path 读取 bytes, 不信任 extension.
2. sniff media type, 验证解码、尺寸与 MVP allowlist.
3. 计算 SHA-256 和 canonical destination.
4. 在 staging 中准备 payload 与 `import_asset` Marker.
5. 在全局锁内 install-if-absent, 最后发布 Marker.
6. source file 默认保留; 用户显式要求后才可移出 Inbox.

### Merge a Library

1. current Library 是 destination, `--source` 解析为只读 canonical source root; 两者 root 相同时拒绝.
2. full validate source 和 destination, 并拒绝 recovery、quarantine 或 lock state.
3. preflight 全部 committed records、Curation 和 Prompt Draft, 计算有界 report. `--dry-run` 在此结束, 不创建 staging 或 lock.
4. 相同 UUID/path 且 bytes 相同的 immutable record 与相同 hash 的 Image Asset 复用; 相同 UUID/path 的不同 bytes 使整次 merge 失败.
5. 新实体复制 source Curation 和 Prompt Draft; 已存在实体完整保留 destination mutable state.
6. staging 完成后重新核对 source optimistic snapshot. destination 在全局锁内重新检查 collision.
7. 按 deterministic path order 安装新增内容, 最后发布一个 `merge_library` Commit Marker. Marker 不保存 source path、Library identity 或 snapshot metadata.
8. `inbox/`、`.cache/`、SQLite、thumbnail 和 recovery state 不参与 merge.

### Logical Commit

1. staging 写完全部 object, Schema 和 cross-reference validation 通过.
2. 对每个 staged file 执行 flush, transaction 进入 `ready_to_commit`.
3. 获取 `.locks/archive.lock`.
4. 重新读取 Library version、现有 path、dependency 和 expected draft state.
5. 按 deterministic path order 执行 create-if-absent install.
6. 写入临时 Commit Marker, flush 后 atomic rename 到最终 marker path.
7. flush parent directories where supported, 释放 lock.
8. indexer 在锁外消费 Marker; index 失败不影响 commit.

## Concurrency

图片生成和 staging 可以并行. Archive lock 只覆盖最终 install 与 Marker publication. Lock 使用 exclusive create, 内容包括随机 owner token、PID、hostname 与 `createdAt`.

禁止仅凭 timeout 抢锁. 同 host 必须确认 PID 不存在且 owner 没有活跃 transaction; 跨 host 或无法确认时要求显式 recovery. MVP 正式支持本机文件系统, network filesystem 和 cloud-synced folder 不承诺 lock 或 atomicity.

Draft 与 Curation 不使用 Archive lock, 采用 expected hash 或 `entityRevision` 的 optimistic concurrency.

## Failure Handling

- Marker 存在但任一 listed record 缺失或 digest 不同: Archive corruption, 拒绝写入并报告 repair requirement.
- Final path 存在但没有任何 Marker 覆盖: uncommitted object, 根据 staging transaction 恢复或 quarantine.
- Staging 存在但 transaction metadata 缺失或损坏: quarantine, 不猜测意图.
- Cache 损坏: 关闭连接, 删除 cache, 从 Commit Marker 全量重建.
- Curation JSON 损坏: 保留原文件, 报告局部错误; 不影响 Archive 读取.
- Library version 高于 reader: read-only diagnostic 后拒绝写入.
- Library version 低于 writer: 要求显式 migration, 不自动执行.
- Runtime root 或 manifest 消失: 首个后续 request 返回 `LIBRARY_UNAVAILABLE`; Index rebuild 不属于可用 recovery action.
- Transition prepare 失败: 关闭 candidate handles, 保留旧 context 与持久化选择.
- Transition commit 失败: 在持久化前保持旧 context; 已完成初始化的 candidate 不自动删除.

## Compatibility and Migration

Schema 位于 `schemas/asset-library/v<formatVersion>/`. 每次写入都使用当前 Library version 对应 validator.

当前 development baseline 不承担既有 runtime Library 的兼容负担. Safety Rejection contract 直接更新 format `1` Schema; 已符合新 validator 的旧 record 因 optional `moderation` 仍可读取, 但不提供 migration 或旧 reader compatibility guarantee. 发生不兼容时整体重新初始化 runtime Library; `.cache/` rebuild 仍只重建 derived state, 不替代 Library reinitialization.

兼容的 reader 扩展可以读取旧 record 而不修改 Archive. Breaking migration 使用:

```bash
assetctl migrate --source <existing-library> --destination <new-library> --dry-run
assetctl migrate --source <existing-library> --destination <new-library>
```

迁移创建新的 destination Library, 逐个验证并写入新格式, source 保持只读. 完成后比较语义计数、hash identity 和关系图, 用户再显式切换配置. MVP 不支持 in-place breaking migration.

## Validation

validator 分为:

- `quick`: Library manifest、最新 Marker、显式目标记录和 lock 状态.
- `full`: 全部 Marker、record digest、JSON Schema、引用图、asset hash、duplicate path、uncommitted object 和 symlink scan.
- `rebuild-check`: 删除临时 cache, 重建 read model, 比较权威计数和查询 fixture.

`assetctl validate` 默认只读. repair、recover、quarantine 和 migrate 必须是独立显式命令, validator 本身不得修改文件.
