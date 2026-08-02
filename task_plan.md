# 任务计划: Text to Image

## Goal

完成本地文件夹驱动的图片生成与图库系统的领域设计、正式文档、实现、测试和可维护的 Codex 工作流.

## Current Phase

Phase 5

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

## Remaining Design Questions

无. Shared understanding 已确认, 当前按已接受设计实现 MVP.

## Errors Encountered

| Error                                                                          | Attempt | Resolution                                               |
| ------------------------------------------------------------------------------ | ------: | -------------------------------------------------------- |
| Codex manual fetch failed because DNS was unavailable in the sandbox           |       1 | Re-ran the official helper with approved network access  |
| Existing project Markdown used English prose against repository language rules |       1 | Rewrote glossary and ADR prose in Simplified Chinese     |
| Documentation patch had malformed section markers                              |       1 | Split the change into smaller valid patch sections       |
| Cross-file documentation patch used the wrong hunk context                     |       1 | Split updates by target file and validated each context  |
| `tsx` IPC socket was denied by the Codex filesystem sandbox                    |       1 | Re-ran CLI and E2E verification with scoped approval     |
| Initial dependency audit reported vulnerable static/Sharp versions             |       1 | Upgraded both packages and regenerated the lockfile      |
| SPA navigation was incorrectly protected before token bootstrap                |       1 | Limited token enforcement to protected API routes        |
| Full-scale FTS query repeatedly evaluated three subqueries                     |       1 | Materialized one FTS hit set and reused it               |
| WebKit omitted links from the default macOS Tab focus ring                     |       1 | Split Tab-order and activation checks by browser         |
| Server build emitted artifacts into referenced package source directories      |       1 | Removed generated files and corrected project references |
| Documentation check traversed dependency and evaluation workspaces             |       1 | Excluded generated and dependency directories            |
