# 不把 Workflow telemetry 写入 Archive

Generation Workflow 的性能数据不属于 immutable Archive. 用户端到端耗时、Codex orchestration、CLI、Archive、index 与图片模型阶段依赖本机、会话和 provider, 不构成 Generation 的创作 provenance. Skill 可以通过 `workflowRunId` 报告 bounded timing 与 SLO 结果, CI 可以输出独立 test artifact, 但 telemetry 不得包含 Prompt、Reference guidance、文件路径、provider transcript 或 opaque handle, 且 telemetry failure 不得影响 Generation commit. 相比把性能记录永久写入 Archive, 该决定避免环境噪声扩大 Schema、迁移和隐私边界; 代价是 Archive 本身不能用于重建历史性能趋势, 如未来有明确需求应增加独立且可丢弃的 diagnostic store.
