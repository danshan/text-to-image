---
title: Testing Strategy
status: accepted
owner: project
last_updated: 2026-08-03
related:
  - ../product/requirements.md
  - ../design/asset-library.md
  - ../design/generation-workflow.md
  - ../design/web-ui.md
  - guide.md
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
- Replay relation.
- transaction state transitions.
- lock ownership decision.
- Curation optimistic revision.
- config precedence 和 Git-root-relative resolution.
- error code mapping.

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
- external Library absolute path.
- root symlink canonicalization 与 internal symlink rejection.
- Curation/Draft atomic update conflict.
- no physical Archive deletion.

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

### Concurrency Tests

至少启动 8 个独立 child processes, 每个完成不同 Generation 的 staging 和 final commit. 验证:

- 所有 Commit Marker 唯一.
- shared Image Asset 正确 deduplicate.
- 没有 lost update、deadlock 或 duplicate path ownership.
- lock hold time 只覆盖 commit critical section.
- indexer 在 commit 后异步追平.

另外测试两个进程更新同一 Draft 或 Curation, 只允许一个 expected revision 成功, 另一个返回 conflict.

### Generation Skill Tests

自动测试使用 fake generator 返回受控 local output paths:

- no-reference success.
- multi-reference roles and guidance.
- known tool failure.
- invocation result lost.
- output capture failure.
- multiple Outputs.
- multiple variants as separate Generations.
- Prompt branch.
- Replay chain.
- material Prompt change confirmation.
- Draft concurrent edit during generation.
- index failure after Archive commit.

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

Fastify injection 或 loopback server 覆盖:

- request/response Schema.
- stable error codes.
- cursor pagination.
- search/filter/sort combination.
- Curation expected revision conflict.
- read-only degraded mode.
- initialization-required bootstrap、`503` API guard 与 exact init command.
- invalid Host、Origin、token 与 CORS preflight.
- path traversal、encoded traversal、invalid hash 和 arbitrary path parameters.
- session token rotates on restart.
- server never binds non-loopback interface.

### Web UI Tests

Vitest 覆盖 pure UI state 和 components; Playwright 覆盖真实 browser flow:

- Gallery loading、empty、no-results、error 和 degraded states.
- first-run initialization screen 显示 resolved path 与 exact init command, 且不请求 Gallery.
- filter URL round-trip 与 browser back/forward.
- Gallery -> Image -> Generation -> Creation provenance navigation.
- Prompt branch selection 与 diff labels.
- Curation success/conflict/retry.
- Recovery dry-run 与 state-specific actions.
- external Draft edit conflict.
- light/dark/system theme.
- narrow/desktop layouts.
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
3. 从旧 Prompt Revision 分支后 generate.

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

结果必须记录 macOS model、CPU、memory、filesystem、Node version、dataset seed 和 command. Benchmark 使用固定 seed, 不把 image generation latency 计入 Archive commit performance.

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

记录动态 port 与 server stderr, 确认 Library fixture 初始化完成. 不复用开发者真实 Library.

### Performance regression

先比较 dataset seed、Node version、machine、cache state 和 query plan. 使用 profiler 确认瓶颈后再优化.

### Real image smoke failure

区分 built-in tool failure、output path capture、Archive commit 和 Web UI index 四层. 不自动切换 CLI fallback.

## Compatibility

- macOS release gate 必须通过全部自动化与 manual smoke.
- Linux best-effort 可以运行 non-release suite, 失败不标记为 macOS regression.
- Windows suite 不配置为 MVP required job.
- Node.js 24 是唯一 required runtime matrix; future Node versions 进入支持范围前必须通过 filesystem、SQLite 和 Hook suite.
