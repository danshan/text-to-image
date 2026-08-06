---
title: Testing Strategy
status: draft
owner: project
last_updated: 2026-08-06
related:
  - ../product/requirements.md
  - ../design/asset-library.md
  - ../design/generation-workflow.md
  - ../design/web-ui.md
  - guide.md
  - ../adr/0010-enable-web-controlled-library-hot-switching.md
  - ../adr/0011-allow-configurable-trusted-lan-binding.md
  - ../adr/0012-keep-workflow-telemetry-out-of-the-archive.md
  - ../design/purge-workflow.md
  - ../adr/0013-rebuild-and-replace-the-library-for-purge.md
---

# 测试策略

## Prerequisites

- Node.js 24.
- npm dependencies installed with `npm ci`.
- macOS local filesystem for release-gate filesystem tests.
- Playwright browser binaries for end-to-end tests.
- Codex built-in image generation only for explicit manual smoke tests.

自动测试禁止访问真实用户 Library. 所有 filesystem tests 使用显式 `mkdtemp` root, 测试结束后仅清理该已验证 temp root.

## Tools

- Vitest: TypeScript unit、Schema、integration、fake timer 与 coverage.
- Playwright: browser end-to-end、navigation、screenshots、trace 和 visual regression.
- fake image generator: deterministic Generation Workflow automation.
- shared `assetctl validate`: fixtures 与 end-to-end postcondition.

版本在实现 scaffold 时锁入 `package-lock.json`. 测试代码不得依赖未声明 global binary.

## Test Layers

### Unit Tests

覆盖 pure functions 和状态机:

- UUID、timestamp 与 relative path validation.
- SHA-256 path derivation.
- Reference Image roles 和 `other` guidance rule.
- Prompt Revision parent validation 与 cycle detection.
- Generation terminal status combinations.
- Safety Rejection error mapping、moderation stage 与 category preservation.
- Replay relation.
- transaction state transitions.
- lock ownership decision.
- Curation optimistic revision.
- config precedence 和 Git-root-relative resolution.
- error code mapping.
- Image source canonicalization、inspection metadata 与 missing、unreadable、unsupported、invalid error mapping.
- deterministic Purge Plan canonicalization、digest、boolean confirmation 与 stale snapshot comparison.
- Purge journal phase transition、Cutover boundary 与 restart recovery decision table.
- Image Asset Output / Reference blocker enumeration 与 single-target validation.

时间、ID、hostname 和 process liveness 通过 injectable adapters 控制, 避免 nondeterministic tests.

### Schema Tests

每个 Schema 至少具有:

- 最小合法 fixture.
- 完整合法 fixture.
- 缺少 required field.
- unknown enum.
- invalid timestamp、UUID、hash 和 path.
- cross-record dangling reference.
- future `schemaVersion`.
- Generation error without `moderation` and with valid input、output、unknown stages.
- invalid moderation stage、duplicate categories 与 unexpected provider fields.
- valid / invalid Purge Plan、journal、target union、phase、plan digest、abandonment transaction IDs 与 unknown field.

所有 `fixtures/asset-libraries/v1-invalid-*` 必须返回稳定 error code 和 precise relative path.

JSON examples embedded in正式文档必须被提取并解析; 标记为 illustrative partial example 时不做 full Schema validation.

### Filesystem Integration Tests

使用真实 temp filesystem, 不 mock `node:fs`:

- init empty target.
- reject non-empty unknown target.
- import PNG、JPEG、WebP.
- reject extension mismatch、SVG、animated or corrupt image.
- content deduplication.
- create Creation、checkpoint Revision、Generation success/failure/interrupted.
- Commit Marker publication 和 reader visibility.
- uncommitted final object detection.
- cache delete/rebuild.
- missing manifest does not create Library root、`.cache/` 或 SQLite index.
- 运行中的 active Library 被删除后, next request boundary 返回 `LIBRARY_UNAVAILABLE`.
- Initialize/select transition 在持久化与切换前 full validate 并重建 candidate.
- Transition commit 排空旧请求, 保持一个 active context, 后续失败时保留已初始化 candidate.
- external Library absolute path.
- root symlink canonicalization 与 internal symlink rejection.
- Curation/Draft atomic update conflict.
- 普通 mutation 不执行 physical Archive deletion; Purge 只能通过 shared verified replacement protocol.
- init 和 select 仅在成功后原子持久化 canonical Library path.
- Library Merge dry run、same-root rejection、identity conflict、destination-wins、deduplication 和重复执行.
- interrupted Library Merge 在 Marker 前不可见, 并可通过既有 recovery commit 完成.
- read model 启动时按 Marker `createdAt` 检测 lag, 不依赖随机 UUID filename order.
- Creation Purge 删除完整 owned graph 与 Curation, 保留全部 Image Asset payload 与 Image Curation.
- Image Asset Purge 对全部 Output / Reference blocker fail closed, 无 blocker 时删除 payload、Curation、thumbnail 与 index row.
- A 作为 B 的 Reference Image 时, 先 Purge B 所属 Creation 后 References 不再显示 A; A 仍作为资产存在, 直到其 producing relation 清除并独立 Purge.
- Purge candidate 重写 affected Marker, 保留同 Marker 中 surviving Image Asset entry, 删除 empty Marker 并通过 full validation.
- `inbox/` exact-content match 只产生 warning, Purge 不删除 Inbox 或 external source.
- 显式 Library Merge 可以重新引入已 Purge identity 或 content.

每个测试结束先断言 temp target 位于 test-owned root, 再删除. 禁止使用 workspace root、`$HOME` 或 unresolved variable 作为 cleanup target.

### Fault Injection

Archive writer 提供仅测试可用 failpoint interface:

```text
after_staging_record
after_payload_flush
after_lock_acquired
after_object_install:<index>
before_marker_flush
before_marker_rename
after_marker_rename
before_lock_release
```

每个 failpoint 在 child process 中触发 abrupt exit. Parent process 重新打开 Library 并验证:

- Marker 前没有 partial visible transaction.
- Marker 后 transaction 完整可见.
- uncommitted objects 可恢复或 quarantine.
- rerun commit 幂等.
- lock 不因 timeout 自动抢占.

Purge 增加独立 failpoints:

```text
after_purge_journal_flush
after_candidate_materialized
after_candidate_validated
after_original_retired
after_replacement_activated
during_retired_cleanup:<index>
before_index_rebuild
after_index_rebuild
before_purge_journal_removal
```

Parent process 必须证明 Cutover 前清理 candidate 并保持 original Library, Cutover 后保持 maintenance 并只 roll forward. 任一阶段都不得同时发布两个 active root, 不得在完成后留下 retired root、journal、target identity、cache row 或 target-owned bytes.

### Concurrency Tests

至少启动 8 个独立 child processes, 每个完成不同 Generation 的 staging 和 final commit. 验证:

- 所有 Commit Marker 唯一.
- shared Image Asset 正确 deduplicate.
- 没有 lost update、deadlock 或 duplicate path ownership.
- lock hold time 只覆盖 commit critical section.
- indexer 在 commit 后异步追平.

另外测试两个进程更新同一 Draft 或 Curation, 只允许一个 expected revision 成功, 另一个返回 conflict.

Purge concurrency 使用 Server request drain 与多个独立 child process 验证:

- Prepare 期间允许只读查询, 但 execute recheck 可以使旧 plan stale.
- Maintenance 开始后新的 read、Curation、Generation、Merge、Recovery 与第二个 Purge 均被拒绝.
- 已进入的 request 在 Cutover 前完成或被有界排空, 不持有 retired-root file handle.
- live Generation owner 不能通过 Recovery Evidence Abandonment 绕过.

### Generation Skill Tests

自动测试使用 fake generator 返回受控 local output paths:

- no-reference success.
- multi-reference roles and guidance.
- known tool failure.
- input、output 与 unknown-stage Safety Rejection.
- Safety Rejection 只归档 stable code、summary、retryable 和 bounded moderation metadata.
- invocation result lost.
- output capture failure.
- multiple Outputs.
- multiple variants as separate Generations.
- Prompt branch.
- Replay chain.
- material Prompt change confirmation.
- Draft concurrent edit during generation.
- index failure after Archive commit.
- materialized Session Image 在固定 Library root 中先 inspection、后 import、再 prepare.
- 多张 Session Image 在任一 inspection 失败时不执行任何 import 或 Generation prepare.
- opaque handle 报告 `SESSION_IMAGE_NOT_MATERIALIZED`, sandbox denial 不误报为 missing.
- Reference roles 只从明确措辞解析, 语义不足时询问且不设置默认值.
- inspection 与 import hash 不一致时停止 Generation, 已提交 import 不执行回滚.
- `generation preflight` 一次返回 capability、canonical Library、recovery warning、Draft snapshot 与全部 source inspection, 且不修改 Archive.
- stdin request 在首个 `LF` 或 EOF 完成, 覆盖精确 1 MiB boundary、oversize、严格 invalid UTF-8、第二个 JSON value、尾随非空内容, 以及 child process 在未发送 EOF 时于 `LF` 后返回.
- effective Prompt 对 Prepare 与 fake generator byte-identical, hash mismatch 不执行 `mark-invocation-started`.
- capture 返回 staged Output path, fake Skill 不再通过 recovery request 或 staging scan 定位图片.
- 高层 happy-path command 复用低层状态机, 在每个内部 transition 中断后仍能通过现有 recovery command 处理.
- 增量 Marker catch-up 原子更新 `last_indexed_marker`; projection failure 保留 committed Generation 并返回 index degraded.
- 使用 deterministic barrier 启动至少 4 个真实 Node.js child process, 混合竞争 incremental catch-up 与 full rebuild, 断言同一时间只有一个 Index Writer 且最终 Marker lag 为零.
- Index Writer owner 被终止后, 下一 process 依靠 OS release 获取 coordinator, 不删除 stale lock file; production 8 秒 timeout 使用缩短的 test-only option 验证 `INDEX_WRITER_BUSY`.
- 并发打开 confirmed-corrupt index 时只有首个 lock holder 实际 rebuild, 其余 process 获锁后复用 replacement; legacy WAL index 自动 replacement 为 `DELETE` journal mode.
- Archive record digest mismatch 返回 `INDEX_PROJECTION_FAILED` 并 fail closed, 不被 automatic SQLite rebuild 掩盖.
- progress 只包含真实阶段与累计耗时, provider 没有事件时不生成百分比或 ETA.
- telemetry payload 不包含 Prompt、Reference guidance、文件路径、provider transcript 或 opaque handle, telemetry failure 不影响 commit.

fake generator 只模拟 tool boundary, 不绕过 staging、capture、commit 与 validator.

### Hook Tests

以官方 Hook stdin JSON fixture 驱动 repo-local script:

- `apply_patch` write to Archive denied.
- Bash direct write、move、overwrite or delete denied.
- Draft、Inbox、Curation 和 source edit allowed.
- exact `assetctl` command allowed.
- external Library path protected.
- symlink、relative path、quoted path 和 shell indirection adversarial cases.
- `Stop` validator success and block response.
- Hook never changes filesystem.

Hook 是 guardrail, 测试还必须证明 writer 独立拒绝同类违规.

### API Tests

Fastify injection 或 local server 覆盖:

- request/response Schema.
- stable error codes.
- Generation Issues latest-per-active-Creation derivation, including `shelved` exclusion and later success.
- cursor pagination.
- search/filter/sort combination.
- Curation expected revision conflict.
- read-only degraded mode.
- unavailable bootstrap、`503 LIBRARY_UNAVAILABLE` data API guard 与 always-available Library control plane.
- Library transition 接受绝对目标路径, 且不存在通用 filesystem directory listing endpoint.
- Library switch 轮换 session token 并拒绝 stale Browser tab.
- invalid Host、Origin、token 与 CORS preflight.
- path traversal、encoded traversal、invalid hash 和 arbitrary path parameters.
- session token rotates on restart.
- listen host precedence、IPv4/IPv6 parsing、hostname rejection 与 missing option value.
- concrete interface、`0.0.0.0` 与 `::` bind contract.
- wildcard interface URL discovery、scoped IPv6 exclusion 与 IP literal Host/Origin allowlist.
- development listener 暴露 Vite, Fastify proxy target 保持 loopback.
- Purge prepare / execute / status Schema、session security、required `confirmed: true` 与 `PURGE_PLAN_STALE`.
- maintenance allowlist 与其他 Library API 的 `503 LIBRARY_MAINTENANCE`.
- blocking relations 返回完整 `creationId`, `generationId`, `relationType` list.
- Purge 完成后 Generation Issue、References、detail 与 content endpoint 不暴露目标.

### Runtime Entry Point Tests

- optional `.env` 存在、缺失与 shell override precedence.
- npm scripts 保持 Server `.env` loading 与 daemon implementation 的权威入口.
- mise task validation、task listing 与 dry-run command expansion.
- development Server / Web port defaults、override、Vite proxy target 与 build command boundary.
- daemon 真实 child process readiness、dynamic URL health、single-instance idempotency 与 metadata publication.
- status process identity validation、Node log follow、`SIGTERM` stop、stopped / stale exit semantics.
- Web build failure 不创建 foreground 或 daemon Server listener.

daemon integration 必须使用 test-owned Library 与 runtime directory, 不读取、停止或删除开发者当前 daemon. macOS 是 release gate, Linux 验证同一 POSIX contract; Windows 不配置 daemon job.

### Web UI Tests

Vitest 覆盖 pure UI state 和 components; Playwright 覆盖真实 browser flow:

- Gallery loading、empty、no-results、error 和 degraded states.
- Gallery Generation Issues region 与 Image Asset grid 保持分离.
- Safety Rejection 显示 stage、categories、非归罪文案和 `Review Prompt` action.
- 后续 succeeded Generation 移除同一 active Creation 的 Issue, Timeline 仍保留历史失败.
- unavailable flow 导航到 Settings, 显示 resolved absolute path、Initialize、Select 与 Retry, 且不请求 Gallery.
- Library transition 显示 monotonic stage/count progress, 成功后 reload, 失败保留 actionable target path.
- filter URL round-trip 与 browser back/forward.
- Gallery -> Image -> Generation -> Creation provenance navigation, 包括详情页返回精确 Revision/Generation Focus.
- Prompt branch Focus 与 Compare 独立状态、URL round-trip、默认最新 Generation、同 Revision 多 Generation 高亮与 Reference usage 分组.
- Generation Timeline 的 Prompt link、Reference thumbnails 与完整 Timeline 保留语义.
- Image used-as-reference relation 同时返回真实 Generation 与 Prompt Revision, 不丢失 roles 或 guidance.
- Prompt branch selection 与 diff labels.
- Curation success/conflict/retry.
- Recovery dry-run 与 state-specific actions.
- Creation Detail 与 Image Detail Danger Zone 是唯一 Purge 入口, card 与 list 不提供快捷删除.
- Plan impact、retained assets、Inbox warning、逐项 abandonment 授权与常规最终确认对话框.
- maintenance progress reload、Cutover 后 failure、success navigation 与 old deep link typed `404`.
- 真实 loopback client abort 后 request lease 被释放, 后续 Purge 可以进入 maintenance; 未结束的 request 超过 drain deadline 时在 journal 创建前返回 typed failure.
- external Draft edit conflict.
- light/dark/system theme.
- Desktop layout snapshots at `1024x768`, `1280x720`, `1366x768`, `1440x900` and `1920x1080`.
- fixed 200 px sidebar, compact page header, readable type scale and two-column detail inspector at the minimum desktop width.
- keyboard-only navigation、skip link、dialog focus return 和 visible focus.

Playwright failure artifact 保留 screenshot、trace 和 server log. 默认 retry 不得掩盖 deterministic failure; CI retry policy 必须单独记录 flaky reason.

### Accessibility Tests

- 所有 routes 有唯一 `h1`, landmarks 和 skip link.
- form control 有 visible label.
- icon-only button 有 accessible name.
- status 不只依赖颜色.
- Prompt diff 有 insertion/deletion text.
- keyboard focus order 与 DOM/visual order一致.
- dialog trap/return focus.
- light/dark contrast 达到 WCAG 2.2 AA.
- reduced-motion 模式禁用非必要 transition.

Automation 不能替代 manual screen reader 和 keyboard smoke test. Release checklist 记录使用的 browser 与结果.

## Real Image Generation Smoke Tests

只在显式 release verification 中执行, 不属于普通 `npm test`:

1. 无 Reference Image 的 built-in generate.
2. 带 `subject` 与 `composition` Reference Image 的 built-in generate.
3. 会话中插入的 materialized Session Image 自动导入后作为 Reference Image generate.
4. 从旧 Prompt Revision 分支后 generate.

每次验证:

- tool output 从 `$CODEX_HOME/generated_images/...` capture 到 Library.
- actual Prompt、Change Instruction、Reference relation 和 Output 完整.
- Commit Marker valid.
- Web UI 可以浏览完整 provenance.
- 原 default output 是否保留符合报告, 不影响 Archive identity.

测试不得自动切换 CLI fallback 或请求 API key.

## Performance Tests

Synthetic dataset:

- 2,000 Creations.
- 30,000 Generations.
- 10,000 Image Assets.
- realistic Prompt lengths、branching、tags 和 reference edges.

Release baseline:

- full index rebuild <= 60 seconds.
- warm Gallery/search API p95 <= 200 ms.
- warm thumbnail first screen interactive <= 2 seconds.
- 8 concurrent commit test completes without deadlock.
- fake generator Workspace Ready `request -> invocation_started` p95 <= 20 seconds.
- fake generator Workspace Ready `tool_returned -> committed and index-ready` p95 <= 10 seconds.
- fake generator Workspace Ready non-model end-to-end overhead <= 30 seconds.

结果必须记录 macOS model、CPU、memory、filesystem、Node version、dataset seed 和 command. 每项报告 p50、p95 与 max, 并分别输出 orchestration、CLI、Archive、index 和 model duration. Benchmark 使用固定 seed, 不把 image generation latency 计入 Archive commit performance.

确定性 CI gate 使用 fake generator 和 release-scale Library, 每个 focused workflow gate 至少运行 12 次. long Prompt 回归必须覆盖 CLI raw-mode 状态恢复, 并通过 Codex 实际 PTY smoke 发送大于 4 KiB 的 UTF-8 request. 完成 deterministic gate 后执行一次真实 Workspace Ready `image_gen` observation, 记录 model latency 与 Codex UI 权威用户端到端时间; 单个真实样本不宣称 provider p95, provider latency 不作为 CI pass/fail 条件. 仓库 span 与 Codex UI 时间通过相同 `workflowRunId` 关联; UI duration 未暴露时结果保持 `unknown`, 不允许用仓库 span 推测或替代.

## Coverage Policy

Coverage 作为遗漏信号, 不替代行为验证.

- transaction state transitions、path containment、Commit Marker validation 和 recovery decision table 要求每个 branch 都有显式测试.
- 新 public error code 必须有触发测试.
- 新 Schema keyword 和 enum value 必须有 valid/invalid fixtures.
- 变更不得无解释降低相关 package coverage baseline.
- 不通过低价值 snapshot 或 unreachable branch 排除来追求数字.

具体 percentage baseline 在首次完整实现后根据实际模块建立并记录, 不能在没有代码时虚构.

## Documentation Tests

`npm run docs:check` 必须验证:

- Markdown relative links 存在.
- `AGENTS.md` 中列出的文档路径存在.
- `docs/README.md` 与正式文档状态一致.
- frontmatter required fields 和 status enum.
- ADR number 唯一且递增.
- fenced JSON 能解析.
- shell command 不包含 unresolved destructive target.
- Purge 文档中的 recursive cleanup 只描述 typed operation, 不提供手工 `rm`、glob 或 unresolved target command.
- `CONTEXT.md` 格式与 duplicate term.

`npm run fixtures:validate` 验证所有 versioned Library fixtures 与 Schema 预期一致.

## Commands

```bash
npm test
npm run test:integration
npm run test:e2e
npm run test:performance
npm run docs:check
npm run fixtures:validate
mise tasks validate
```

Targeted workspace execution使用 npm `-w`:

```bash
npm test -w @text-to-image/archive
npm test -w @text-to-image/web
```

实际 workspace names 在 scaffold 时固定, 此处 names 是目标 contract.

## Verification Record

每次测试运行在 `progress.md` 记录:

- exact command.
- commit or worktree state.
- expected result.
- actual result.
- pass/fail.
- failure artifact path.
- skipped case 与原因.

未运行命令不得标记为 pass. 部分测试通过不得概括为完整 suite 通过.

## Troubleshooting

### Flaky filesystem test

检查 test-owned temp root、并发进程退出、open handle 和错误的 timeout assumption. 禁止简单增加 sleep 掩盖竞态.

### Playwright server startup failure

记录 configured host、动态 port 与 server stderr, 确认 Library fixture 初始化完成. 不复用开发者真实 Library.

### Performance regression

先比较 dataset seed、Node version、machine、cache state 和 query plan. 使用 profiler 确认瓶颈后再优化.

### Real image smoke failure

区分 built-in tool failure、output path capture、Archive commit 和 Web UI index 四层. 不自动切换 CLI fallback.

## Compatibility

- macOS release gate 必须通过全部自动化与 manual smoke.
- Linux best-effort 可以运行 non-release suite, 失败不标记为 macOS regression.
- Windows suite 不配置为 MVP required job.
- Node.js 24 是唯一 required runtime matrix; future Node versions 进入支持范围前必须通过 filesystem、SQLite 和 Hook suite.
