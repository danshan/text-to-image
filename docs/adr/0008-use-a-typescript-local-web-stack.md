# 使用 TypeScript 本地 Web 技术栈

项目采用 TypeScript monorepo: React + Vite 构建 client-rendered Web UI, Fastify 提供只监听 loopback 的本地 HTTP 服务, CLI 与服务端复用 Archive 核心, Node.js 24 内置 `node:sqlite` 通过隔离 adapter 实现可重建 read model. 相比 Rust 或 Go 核心, 单语言方案减少 Schema、类型与行为在多个实现间漂移; 代价是文件一致性不变量必须依靠运行时 Schema、严格模块边界和故障测试保证. `node:sqlite` 当前仍是 release candidate, 但其数据可完全重建且 adapter 可替换, 因此风险被限制在非权威层.
