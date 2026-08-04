# 任务计划: Text to Image

## Goal

完成本地文件夹驱动的图片生成与图库系统的领域设计、正式文档、实现、测试和可维护的 Codex 工作流.

## Current Phase

Phase 12

## Phases

### Phase 1: Requirements and Domain Design

- [x] 完成逐项设计访谈并达到 shared understanding.
- [x] 建立 glossary 与 ADR 机制.
- [x] 建立文档治理与持续计划文件.
- [x] 形成完整产品需求与验收标准草稿.
- **Status:** completed

### Phase 2: Architecture and Technical Plan

- [x] 完成 Asset Library Schema 与写入协议草稿.
- [x] 完成 Generation Workflow 与项目级 Hook 设计草稿.
- [x] 完成 Web UI 信息架构与技术选型草稿.
- [x] 明确测试矩阵与迁移策略草稿.
- **Status:** completed

### Phase 3: Implementation

- [x] 实现共享领域库与写入器.
- [x] 实现仓库级 Skill 与项目级 Hook.
- [x] 实现 Web UI 与 SQLite read model.
- [x] 同步更新正式文档.
- **Status:** completed

### Phase 4: Testing and Verification

- [x] 执行单元、集成、故障恢复与 UI 测试.
- [x] 验证 Archive 完整性与 cache 可重建性.
- [x] 执行完整规模 index rebuild 与 warm query benchmark.
- [x] 记录全部实际结果并修复问题.
- **Status:** completed

### Phase 5: Delivery

- [x] 检查文档、代码、Schema 与测试一致性.
- [x] 完成根 README 与 AGENTS 导航审查.
- [x] 生成 Skill eval review viewer.
- [x] 提交最终交付说明与已知限制.
- **Status:** completed

### Phase 6: First-run Library Initialization

- [x] 禁止缺少 manifest 的 read model 创建 Library 或 cache.
- [x] 实现 Server initialization-required diagnostics mode.
- [x] 在 Web bootstrap screen 显示 canonical path 与 exact init command.
- [x] 补充 API、Read Model、Web 回归测试并同步正式文档.
- **Status:** completed

### Phase 7: Persistent Library Selection and Merge

- [x] 持久化 `assetctl init --library` 的 canonical Library path.
- [x] 实现既有 Library 的无写入选择命令.
- [x] 实现 current Library 作为 destination 的原子 Library Merge 与 dry-run.
- [x] 修复 Read Model 对新 Commit Marker 的启动时追平.
- [x] 补充 Schema、集成测试、E2E 与正式文档.
- **Status:** completed

### Phase 8: Generation Issues and Safety Rejection UX

- [x] 通过逐项访谈确认 Generation Issue、Safety Rejection、生命周期与 Prompt guidance 边界.
- [x] 将产品、Asset Library、Generation Workflow、Web UI 与测试文档切回 `draft` 并形成实施契约.
- [x] 扩展 format `1` Generation error Schema、domain types、writer request 与 bounded moderation contract.
- [x] 更新 Generation Skill, 归档 stable safety code 与 bounded moderation metadata.
- [x] 在 read model 与 API 中派生每个 active Creation 的最新 Generation Issue.
- [x] 实现 Gallery Issues region、Creation Timeline inline issue、Generation Detail warning panel 与 Draft recovery path.
- [x] 完成 Compact Editorial Workspace desktop UI audit: fixed 200 px sidebar, compact headers, readable type scale, dark sidebar tokens, detail two-column layout and desktop viewport matrix.
- [x] 执行 Schema、Archive、read model、API、Web、integration、fixtures 与 documentation verification; Chromium/WebKit E2E 通过, 并加入 `1024x768` Gallery 与 `1440x900` Creation visual snapshots.
- [x] 完成代码、测试和交叉检查后把正式文档恢复为 `accepted`.
- **Status:** completed

#### Implementation Order

1. Contract first: 更新 `packages/domain/src/index.ts`、`schemas/asset-library/v1/generation.schema.json` 与 `packages/archive/src/generation.ts` 的 fail request validation.
2. Workflow mapping: 更新 `.agents/skills/generate-and-archive/` 的 CLI contract、failure classification 和 eval cases, 只保存 stable code 与 bounded moderation metadata.
3. Projection and API: 在 `packages/read-model/src/` 派生 latest-per-active-Creation issues, 扩展 `packages/api-contract/src/`、`apps/server/src/` 和 integration tests, 提供 bounded `GET /api/v1/generation-issues`.
4. Web UI: 更新 shared shell/styles 与 `apps/web/src/pages/gallery-page.tsx`, `creation-detail-page.tsx` 和 `generation-detail-page.tsx`, 增加独立 Issues region、typed warning panel、Review Prompt navigation、desktop viewport rules 和 tests.
5. Verification and reset: 执行 Schema、Archive、read model、API、Web、integration、fixtures 与 docs checks; 记录 browser E2E 的环境阻断后恢复文档 `accepted`.

### Phase 9: Runtime Library Management

- [x] 确认 Library Unavailable、absolute path input、hot switch、failure 与 session isolation contract.
- [x] 新增 ADR 0010, 并把受影响正式文档切回 `draft`.
- [x] 实现 request-boundary unavailable detection、path-based control plane 与 single async transition.
- [x] 实现 candidate prebuild、request drain、atomic persistence、context swap 与 session token rotation.
- [x] 修复 Stop Hook 对 `ARCHIVE_NOT_INITIALIZED` 的错误分类和无效 recovery hint.
- [x] 完成 focused、root contract 与 documentation verification, 记录结果并恢复本阶段独立文档状态.
- **Status:** completed

### Phase 10: Configurable Listen Address

- [x] 通过逐项访谈确认 CLI host 参数、wildcard、trusted LAN 与开发模式语义.
- [x] 将受影响正式文档切回 `draft`, 并记录 trusted LAN contract.
- [x] 实现 `--host` parsing、配置优先级、Browser-facing development listener 与 wildcard interface allowlist.
- [x] 补充 config、security、startup 与 development launcher tests.
- [x] 执行 focused、root 与 documentation verification, 记录结果并恢复文档为 `accepted`.
- **Status:** completed

### Phase 11: Session Image Reference Ingress

- [x] 通过 `$grill-with-docs` 确认 Session Image、自动导入、Reference roles 与部分失败边界.
- [x] 在 `CONTEXT.md` 定义 Session Image, 并把受影响正式文档切回 `draft`.
- [x] 实现只读 Image source inspection 与稳定错误分类.
- [x] 更新 Generation Skill, 自动导入已物化 Session Image 并固定 Library root.
- [x] 补充 Archive、CLI、Skill contract 与文档测试.
- [x] 执行 root verification, 更新执行记录并恢复正式文档为 `accepted`.
- **Status:** completed

#### Confirmed Contract

1. Session Image 只有在原始 bytes 已物化并导入当前 Asset Library 后, 才能成为 Reference Image.
2. 明确生成请求授权独立 `import_asset` 事务; 后续生成失败不回滚已提交 Image Asset.
3. Reference roles 仅从用户明确措辞解析; 语义不足时在 prepare 前询问, 不设置默认 role.
4. 多张 Session Image 先全部预检; 任一失败时不创建 Generation transaction, 不调用图片工具, 不静默丢弃输入.
5. opaque session handle 在宿主没有提供原始 bytes 或路径时 fail closed, 并报告 `SESSION_IMAGE_NOT_MATERIALIZED`.

### Phase 12: End-user Documentation

- [x] 审计现有文档, 确认缺少面向普通用户的完整操作手册.
- [x] 编写图片生成、参考图导入、Prompt 迭代、结果整理和失败恢复说明.
- [x] 使用 ImageGen 生成无文字 PNG 教学示意图.
- [x] 使用不含私人内容的临时演示 Library 制作真实 Web UI 截图.
- [x] 更新 README、AGENTS、文档规范、文档索引和执行记录.
- [x] 完成文档、格式、链接与 Git 差异验证.
- **Status:** completed

## Remaining Design Questions

无. Phase 12 用户手册已经完成并通过验证.

## Errors Encountered

| Error                                                                          | Attempt | Resolution                                                       |
| ------------------------------------------------------------------------------ | ------: | ---------------------------------------------------------------- |
| Codex manual fetch failed because DNS was unavailable in the sandbox           |       1 | Re-ran the official helper with approved network access          |
| Existing project Markdown used English prose against repository language rules |       1 | Rewrote glossary and ADR prose in Simplified Chinese             |
| Documentation patch had malformed section markers                              |       1 | Split the change into smaller valid patch sections               |
| Cross-file documentation patch used the wrong hunk context                     |       1 | Split updates by target file and validated each context          |
| `tsx` IPC socket was denied by the Codex filesystem sandbox                    |       1 | Re-ran CLI and E2E verification with scoped approval             |
| Initial dependency audit reported vulnerable static/Sharp versions             |       1 | Upgraded both packages and regenerated the lockfile              |
| SPA navigation was incorrectly protected before token bootstrap                |       1 | Limited token enforcement to protected API routes                |
| Full-scale FTS query repeatedly evaluated three subqueries                     |       1 | Materialized one FTS hit set and reused it                       |
| WebKit omitted links from the default macOS Tab focus ring                     |       1 | Split Tab-order and activation checks by browser                 |
| Server build emitted artifacts into referenced package source directories      |       1 | Removed generated files and corrected project references         |
| Documentation check traversed dependency and evaluation workspaces             |       1 | Excluded generated and dependency directories                    |
| Web test used an unavailable `jest-dom` matcher                                |       1 | Replaced it with the repository's existing Chai assertions       |
| Playwright server could not create a `tsx` IPC socket in the sandbox           |       1 | Re-ran the E2E suite with scoped approval                        |
| Archive adapter factory read the manifest before initialization mode           |       1 | Removed the eager read and covered the real factory path         |
| npm workspace `cwd` was treated as the repository Git root                     |       1 | Resolve the nearest Git root before Library configuration        |
| Playwright browser processes aborted inside the filesystem sandbox             |       1 | Re-ran the installed browsers with scoped outside-sandbox access |
| Standalone Server typecheck read stale referenced package declarations         |       1 | Use root build/typecheck contract after fixing the new test type |
| Initial host smoke failed because sandbox denied the `tsx` IPC socket          |       1 | Re-ran the isolated temp-root smoke outside the sandbox          |
| Format check found the listener test changed after its earlier Prettier pass   |       1 | Re-format the exact test file before final verification          |
| Initial source inspection read referenced a non-existent `errors.ts` file      |       1 | Located `ArchiveError` in `packages/domain/src/index.ts`         |
| Standalone Archive and CLI typecheck read stale referenced declarations        |       1 | Use root build before the root typecheck contract                |
| Default Vitest config excluded the Archive integration test                    |       1 | Use the repository `test:integration` runner                     |
| New Image source inspection test used an incorrect fixture SHA-256             |       1 | Replaced it with the digest reported for the tracked fixture     |
| Combined documentation patch used stale Testing Strategy wording               |       1 | Split the patch and matched the current Chinese test sections    |
| Lint rejected an `any` matcher nested inside an unknown CLI payload assertion  |       1 | Narrowed the payload explicitly and asserted command membership  |
| Direct execution of CLI dist could not resolve workspace source `.js` imports  |       1 | Use the documented root `npm run assetctl -- ...` contract       |
| Fixture validation could not create the `tsx` IPC socket in the sandbox        |       1 | Re-run the root fixture contract outside the sandbox             |
| Documentation demo CLI could not create the `tsx` IPC socket in the sandbox    |       1 | Re-ran scoped temporary Library commands outside the sandbox     |
| Development Server port `4174` was already occupied during screenshot setup    |       1 | Used an isolated production-like Server on loopback port `4180`  |
| Full-page screenshots repeated the sticky shell near the bottom                |       1 | Cropped exact documentation assets and visually rechecked them   |
