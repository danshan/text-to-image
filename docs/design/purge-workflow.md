---
title: Purge Workflow Design
status: draft
owner: project
last_updated: 2026-08-05
related:
  - ../../CONTEXT.md
  - ../product/requirements.md
  - system-architecture.md
  - asset-library.md
  - web-ui.md
  - generation-workflow.md
  - ../adr/0013-rebuild-and-replace-the-library-for-purge.md
---

# Purge Workflow 设计

## Context

Purge 为本地 Asset Library 提供两种不可恢复的单目标删除能力:

- Creation Purge 清除一个 Creation 的身份、Draft、Curation、Prompt Revision、Generation 与关系, 但保留所有 Library 级 Image Asset.
- Image Asset Purge 清除一个没有任何存续 Generation Output 或 Reference 关系的 Image Asset、Image Curation 与派生 cache.

Purge 不等同于 `shelved`、hidden、Recovery cancel、quarantine、cache rebuild 或 garbage collection. 它改变文件系统事实来源, 必须使用 shared Archive package, 不允许 Web handler、CLI 或人工 shell 直接删除 managed paths.

## Invariants

1. 第一版一个 Purge Plan 只包含一个 Creation 或一个 Image Asset.
2. Purge 强制执行只读 `prepare` 和 destructive `execute` 两阶段, 不提供跳过 prepare 的入口.
3. `execute` 必须提交匹配当前 snapshot 的 `planDigest`、精确确认短语和全部 Recovery Evidence Abandonment transaction IDs.
4. Snapshot 或请求范围变化时返回 `PURGE_PLAN_STALE`, 不执行删除.
5. Creation Purge 不删除任何 Image Asset payload 或 Image Curation.
6. Image Asset 存在任一存续 Output 或 Reference 关系时返回 `PURGE_REFERENCE_BLOCKED`.
7. Purge 不修改或级联删除存续 Generation.
8. 默认情况下, 任一相关 staging 或 quarantine evidence 都阻塞 Purge.
9. 只有 dry-run 已列出 exact transaction 且用户二次确认时, 才允许 Recovery Evidence Abandonment.
10. Purge 进入独占 Library Maintenance, 排空现有 Library request 并拒绝新的读取、写入和 Generation.
11. Active Library 不执行原地多文件删除; candidate 必须先通过 full validation.
12. Cutover 前失败保持原 Library 不变; Cutover 后只允许 roll forward.
13. Purge 完成后不得在 active Library、read model、thumbnail cache、retired root 或临时 journal 中留下可识别目标的数据.
14. `inbox/` 和 Library 外部 source file 不属于自动 Purge 范围.
15. 完成态不保留永久 tombstone、denylist 或 audit receipt.
16. Purge 只有在 retired root 已物理删除、replacement full validation 通过且 index ready 后才报告完成.

## Model

### Purge Target

Purge Target 是以下 tagged union 之一:

| Kind       | Identity       | Confirmation                  |
| ---------- | -------------- | ----------------------------- |
| `creation` | lowercase UUID | `PURGE CREATION <creationId>` |
| `image`    | SHA-256 hex    | `PURGE IMAGE <assetSha256>`   |

Target identity 必须通过 typed parser, 不得直接拼接 filesystem path.

### Purge Plan

Purge Plan 是只读、未持久化的 snapshot-bound response, 至少包含:

- `target.kind` 与 exact identity.
- `libraryId`、canonical Library root fingerprint 与 snapshot digest.
- 将删除的 Archive records、mutable files、cache entries 与 byte count.
- 将保留的 Image Asset identity 与原因.
- blocking Output / Reference relations, 每项包含 `creationId`, `generationId` 与 `relationType`.
- 相关 staging / quarantine transaction、状态、可验证归属与 byte count.
- 用户选定的 Recovery Evidence Abandonment transaction IDs.
- 内容相同但不会自动删除的 Inbox file warnings.
- hard-link capability、fallback copy bytes、最低临时空间估算.
- exact confirmation phrase 与 `planDigest`.

`planDigest` 对 canonical plan bytes 使用 SHA-256. Canonical bytes 不包含展示顺序不稳定的字段; 所有 path、relation 与 transaction list 使用 deterministic sort. `execute` 在进入 maintenance 和获取锁后重新计算同一计划, 比较 digest 后才能创建 destructive journal.

### Blocking Relations

Image Asset Purge 的阻塞关系来自全部存续 Generation:

- `output`: Generation output 的 `assetSha256` 等于目标.
- `reference`: Generation reference 的 `assetSha256` 等于目标.

Prepare 必须返回全部关系, 不只返回首个 blocker. 关系只从权威 Generation record 重建, 不信任 SQLite 计数. 用户必须先 Purge 对应 Creation; Image Asset Purge 不提供 cascade override.

Creation Purge 删除 Generation 后, 对应 Generation Issue 与 Reference Image 关系不再存在. 其 Output 和 Reference Image Asset 均继续作为 Library 级资产存在, 直到用户分别执行合法的 Image Asset Purge.

### Recovery Evidence Abandonment

相关 recovery evidence 包括能够证明属于目标的 `.staging/` 或 `.quarantine/` transaction. 默认 prepare 把它们列为 blocker. 用户可以重新 prepare 并传入 exact transaction IDs, 使计划显式包含 Recovery Evidence Abandonment.

无法解析 metadata 的 quarantine 不得按目录名、年龄或内容猜测归属. 用户只有在明确选择 exact transaction ID 后才能把它纳入计划. 存活 owner 或仍在执行的图片工具调用始终阻塞, 不能用 abandonment 绕过.

### Ephemeral Purge Journal

`execute` 在 canonical Library root 的同级目录创建 durable journal、candidate 与 retired path. 名称只包含随机 operation ID, 不包含 Creation ID、asset hash 或标题. Journal 保存恢复所需的目标与 phase, 但属于临时高敏感状态, 成功后必须删除.

Journal phases 至少区分:

1. `preparing_candidate`.
2. `candidate_ready`.
3. `original_retired`.
4. `replacement_active`.
5. `retired_removed`.
6. `index_ready`.

`original_retired` 是 Purge Cutover 开始. 从该状态起不得恢复 retired Library 为 active root.

## Flows

### Prepare Creation Purge

1. Resolve canonical Library root, 执行 full validation 并拒绝 existing Purge journal.
2. 读取目标 Creation identity、Draft、Curation、全部 Revision 与 Generation.
3. 计算应从 Commit Marker 中移除的 Creation-owned record paths.
4. 把同一 Marker 中的 Image Asset record 列为 retained records.
5. 扫描 staging 与 quarantine, 返回 blockers 或确认的 abandonment scope.
6. 计算 cache、临时空间、candidate 与 retired root plan.
7. 返回 deterministic Purge Plan 和 exact confirmation phrase, 不写 filesystem.

### Prepare Image Asset Purge

1. Resolve canonical Library root 并执行 full validation.
2. 读取目标 payload、Image Curation 和所有权威 Generation records.
3. 收集全部 Output 与 Reference blockers; 任一存在时计划不可执行.
4. 扫描 recovery evidence 与 `inbox/` exact-content matches. Inbox matches 只警告, 不进入 delete set.
5. 定位首次引入目标 payload 的 Commit Marker entry.
6. 返回 deterministic Purge Plan; 不写 filesystem.

### Execute

1. 验证 target、`planDigest`、confirmation phrase 与 abandonment IDs.
2. Runtime 进入 Library Maintenance, 阻断新 data request, 排空现有 request 并停止新的 Generation preflight. Request lease 必须在 response completion、client abort 与 socket timeout 路径幂等释放; drain 超过 30 秒时在创建 journal 前安全失败, 不得无限保持 maintenance.
3. 获取全局 Archive lock, 再次 full validate 和重算 Purge Plan. 不匹配时释放状态并返回 `PURGE_PLAN_STALE`.
4. 创建并 fsync sibling journal 与 candidate root.
5. Preserve `library.json`, `inbox/`、无关 recovery state、Curation 与所有存续 Archive records. 不复制 `.cache/`、thumbnail 或 lock.
6. 对存续不可变 Image Asset 优先创建同文件系统 hard link; capability 或 link 失败时按计划使用 byte copy. Mutable files 始终复制.
7. 重写每个受影响 Commit Marker, 删除目标 record entry; 保留 surviving entry、marker ID、operation 与 `createdAt`. 空 Marker 不进入 candidate.
8. 对 candidate 执行 full validation, 并额外断言目标 identity、owned path、Curation 和 selected recovery evidence 均不存在.
9. 持久化 `candidate_ready`, fsync parent, 然后进入 Cutover.
10. 将 active root rename 为 retired root, fsync parent, 记录 `original_retired`; 再把 candidate rename 为 active root, fsync parent, 记录 `replacement_active`.
11. 递归物理删除经过 exact path validation 的 retired root. 不跟随 symlink, 任一 locked file、permission 或 I/O failure 立即停止.
12. 删除 retired root 后重建新的 SQLite index 与必要 thumbnail cache, 验证 Generation Issue、References 与 detail query 不再暴露目标.
13. 再次 full validate active Library, 删除临时 journal, 释放 lock, 恢复 runtime 并轮换 session token.
14. Creation Purge 导航到 `/creations`; Image Asset Purge 导航到 `/gallery`.

### Restart Recovery

启动时在打开 Library data context 前检查与 resolved root 匹配的 sibling Purge journal:

- `preparing_candidate` 或 `candidate_ready`: cutover 尚未开始, 删除 candidate 与 journal, 保持原 Library.
- `original_retired`: root 可能暂时不存在, 使用 journal 中的 exact candidate / retired path 完成 replacement activation.
- `replacement_active`: 验证 active replacement, 继续删除 retired root.
- `retired_removed`: 重建 index 并 full validate.
- `index_ready`: 删除 journal, 恢复服务并轮换 session token.

Restart recovery 是已确认 Purge 的确定性继续执行, 不是新的自动删除决定. 如果路径、identity、symlink、permission 或 journal Schema 无法验证, runtime 保持 maintenance diagnostics, 不猜测、不 rollback、不升级删除手段.

## Read Model and UI Semantics

- Generation Issue 不是独立持久化实体. Creation 从 replacement Archive 消失并完成 index rebuild 后, Issue 同时消失.
- References 页面只查询存续 `generation_references`. 删除 Generation 后, 原 Reference Image 不再因该关系显示.
- Creation Purge 后保留的 Image Asset 仍可在 Gallery 或 Image Detail 中显示, 但 producing Generation 为 `null`.
- Image Asset Purge 后 content endpoint、Image Detail 与旧 deep link 返回 typed `404`.
- 旧 Creation deep link 返回 typed `404`, 不显示已删除标题、缩略图或摘要.
- Maintenance 期间只有 bootstrap、health、Purge status 与必要 diagnostics control plane 可访问; 其他 Library API 返回 `503 LIBRARY_MAINTENANCE`.

## CLI and API Contract

Root CLI contract:

```bash
npm run assetctl -- purge creation prepare --creation <creation-id> --library <library-root> --format json
npm run assetctl -- purge creation execute --creation <creation-id> --library <library-root> --plan-digest <sha256> --confirmation "PURGE CREATION <creation-id>" --format json
npm run assetctl -- purge image prepare --asset <sha256> --library <library-root> --format json
npm run assetctl -- purge image execute --asset <sha256> --library <library-root> --plan-digest <sha256> --confirmation "PURGE IMAGE <sha256>" --format json
npm run assetctl -- purge status --operation <operation-id> --library <library-root> --format json
```

Recovery Evidence Abandonment 使用可重复的 exact transaction option, 不接受 glob、目录 path 或 `all`.

HTTP API 使用 typed target-specific prepare / execute endpoint 与 operation status endpoint. Server handler 只负责 request validation、session security、maintenance orchestration 和 response mapping; plan、digest、candidate、cutover 与 recovery 全部来自 shared packages.

## Failure Handling

| Failure              | Before Cutover                  | At or After Cutover                                      |
| -------------------- | ------------------------------- | -------------------------------------------------------- |
| Plan stale           | 删除 candidate, 原 Library 不变 | 不适用, digest 必须在 cutover 前通过                     |
| Insufficient disk    | 原 Library 不变                 | 不适用, candidate 不得 ready                             |
| Candidate validation | 删除 candidate, 原 Library 不变 | 不适用                                                   |
| Rename or fsync      | 根据 journal 保持 maintenance   | roll forward, 不恢复 retired root                        |
| Retired deletion     | 不适用                          | 保持 maintenance, 报告 exact path, 不强制删除            |
| Index rebuild        | 不适用                          | active Archive 已 Purge, 保持 maintenance 并重试 rebuild |
| Final validation     | 不适用                          | 保持 maintenance diagnostics, 不 rollback                |
| Process crash        | 启动时删除 candidate 与 journal | 启动时按 phase roll forward                              |

Purge error 使用 stable code, 至少包括 `PURGE_PLAN_STALE`, `PURGE_REFERENCE_BLOCKED`, `PURGE_RECOVERY_BLOCKED`, `PURGE_CONFIRMATION_MISMATCH`, `PURGE_INSUFFICIENT_SPACE`, `PURGE_MAINTENANCE_ACTIVE`, `PURGE_RECOVERY_REQUIRED` 与 `PURGE_CLEANUP_FAILED`.

## Security

- 所有 filesystem target 必须从 canonical root、sibling parent 和 typed operation ID 推导.
- Execute 前枚举并核对 exact delete target, 禁止 unresolved variable、glob 或 prefix-only check.
- Candidate、retired root 与 journal 不得是 symlink; recursive cleanup 不跟随 symlink 或 mount boundary.
- Purge Plan 与 API response 不包含 Prompt 正文、Image bytes 或无关本机路径.
- Server 日志只记录 operation ID、target kind、phase、count 与 stable error code. Purge 成功后日志不得保留 target identity.
- Session token、Host、Origin 与 trusted-LAN boundary 与其他 destructive Web mutation 相同.

## Compatibility

Purge 完成后的 Library 继续满足 format `1`; 不增加永久 record kind、Commit Marker operation 或 tombstone. Purge Plan 与 ephemeral journal 使用独立 versioned Schema, 不是 Asset Library 的长期事实记录.

不支持 Purge 的旧 reader 可以读取完成后的 replacement Library. 任何 writer 在 durable Purge journal 或 maintenance lock 存在时都必须拒绝 mutation. 第一版支持 macOS, Linux best-effort, Windows 不支持.

## Validation

- Schema tests 覆盖 Purge Plan、journal phase、confirmation 和 typed error details.
- Archive integration 覆盖 Creation-owned graph removal、Image Asset retention、unreferenced asset removal 与 Marker rewrite.
- Reference tests 覆盖 Output、Reference、跨 Creation reuse、A 作为 B reference 后的顺序删除.
- Recovery tests 覆盖 staging、quarantine、malformed metadata、live owner 与 exact abandonment IDs.
- Failpoint tests 覆盖每个 journal phase、两个 rename、retired deletion、index rebuild 与 final validation.
- Restart tests 证明 cutover 前 rollback cleanup 与 cutover 后 roll-forward.
- Security tests 覆盖 sibling path containment、symlink、hard-link fallback、locked file、permission 和无更强重试.
- Read-model tests 证明 Generation Issue、References、detail、search、FTS 与 thumbnails 无残留.
- API、Web 与 E2E 覆盖 Danger Zone、plan review、typed confirmation、stale plan、maintenance progress、success navigation 和 old deep link `404`.
- Full residual scan 证明 active root、retired root、journal、cache 与 logs 不包含 target identity 或受管理目标内容.
- Merge integration 证明其他 source Library 可以显式重新引入已 Purge identity 或 content.
