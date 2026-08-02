# 使用仓库内控制措施保护 Archive

Archive 完整性由 Web UI 与 Codex Generation Workflow 共用的写入器和校验器保证. 仓库级 `AGENTS.md` 与 Skill 负责引导工作流; 可信的项目级 Codex Hook 只在 `PreToolUse` 阻断直接 Archive 写入, 并在 `Stop` 执行只读完整性校验, 绝不自动修改资产. 共享写入器仍是 Schema 校验、不可变记录和原子提交的权威边界. 项目不要求也不会修改全局 Codex 配置; 代价是每位用户都必须显式信任项目级 Hook.
