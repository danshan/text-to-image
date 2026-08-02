# Text to Image

这是一个以本地文件夹为事实来源的图片生成与图库管理项目. Codex 负责按照仓库内 Skill 调用图片生成能力并归档完整 provenance, Web UI 负责展示和整理 Creation、提示词历史、参考图与生成产物.

MVP 已完成. 它提供 versioned Asset Library Schema、`assetctl`、原子 Generation 归档、恢复流程、可重建 SQLite read model、本地 Web UI, 以及只作用于本仓库的 Codex Skill 与 Hook. 运行时 Library 整体不进入 Git, clone 后通过已跟踪的 Schema、fixtures、CLI 和文档获得完整格式契约.

## Quick Start

需要 Node.js 24 和 npm.

```bash
npm ci
npm run assetctl -- init --library ./library
npm run assetctl -- validate --library ./library --full
npm run dev
```

开发 UI 位于 `http://127.0.0.1:5173`. Fastify service 只监听 loopback. Web UI 不会启动 Codex; 图片生成必须在 Codex 中显式调用 `$generate-and-archive`.

## External Library

可以把 Library 放在仓库外. CLI 参数优先级最高:

```bash
npm run assetctl -- init --library /Volumes/Media/TextToImageLibrary
npm run assetctl -- validate --library /Volumes/Media/TextToImageLibrary --full
```

若希望 `npm run dev` 持续使用该目录, 创建不进入 Git 的 `text-to-image.local.json`:

```json
{
  "library": "/Volumes/Media/TextToImageLibrary"
}
```

Library 解析顺序为 CLI `--library`, `text-to-image.local.json`, tracked `text-to-image.config.json`, 最后是 `./library`. Server 的 `TEXT_TO_IMAGE_LIBRARY` 被视为显式运行参数, 因而覆盖两个配置文件. 相对路径始终按 Git root 解析.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
npm run test:integration
npm run test:e2e
npm run test:performance
npm run fixtures:validate
npm run docs:check
```

## Documentation

- [领域词汇](./CONTEXT.md)
- [文档索引](./docs/README.md)
- [文档规范](./docs/standards/documentation.md)
- [产品需求](./docs/product/requirements.md)
- [系统架构](./docs/design/system-architecture.md)
- [Asset Library 设计](./docs/design/asset-library.md)
- [Generation Workflow 设计](./docs/design/generation-workflow.md)
- [Web UI 设计](./docs/design/web-ui.md)
- [开发指南](./docs/development/guide.md)
- [测试策略](./docs/development/testing.md)
- [架构决策](./docs/adr/)
- [任务计划](./task_plan.md)
- [研究与决策记录](./findings.md)
- [研发进度](./progress.md)

## Repository Guidance

Codex 与贡献者在工作前必须阅读 [AGENTS.md](./AGENTS.md).
