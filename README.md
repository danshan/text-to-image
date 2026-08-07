# Text to Image

这是一个以本地文件夹为事实来源的图片生成与图库管理项目. Codex 负责按照仓库内 Skill 调用图片生成能力并归档完整 provenance, Web UI 负责展示和整理 Creation、提示词历史、参考图与生成产物.

MVP 已完成. 它提供 versioned Asset Library Schema、`assetctl`、原子 Generation 归档、Session Image 自动导入、恢复流程、可重建 SQLite read model、本地 Web UI, 以及只作用于本仓库的 Codex Skill 与 Hook. 运行时 Library 整体不进入 Git, clone 后通过已跟踪的 Schema、fixtures、CLI 和文档获得完整格式契约.

Phase 17 已交付 Creation Purge 与 Image Asset Purge 的核心 vertical slice, 包括 shared verified replacement、CLI、API 与 Detail Danger Zone. 完整 fault injection、异步 maintenance progress 与 browser E2E 尚未完成, 相关正式文档继续保持 `draft`; 不要手工删除 managed Archive 文件.

Phase 19 已支持 OpenAI 与 Grok / xAI multi-provider Generation. 同一个 Variant 可以跨平台共享 Prompt Revision 和 Reference Images, 但每个平台保存独立 Generation、状态与 recovery evidence. xAI 使用 repository-owned direct API executor; Google AI 与 Antigravity 当前不实现, 只保留 Provider Adapter 扩展边界.

## Quick Start

需要 Node.js 24 和 npm.

```bash
npm ci
npm run assetctl -- init --library ./library
npm run assetctl -- validate --library ./library --full
npm run dev
```

开发 UI 默认位于 `http://127.0.0.1:5173`. `npm start` 与 `npm run dev` 都接受 `--host <ip>`; 支持具体 IPv4、IPv6、`0.0.0.0` 与 `::`:

```bash
npm run dev -- --host 0.0.0.0
```

可选 root `.env` 会被 `dev`、`start` 与 daemon 自动加载, xAI Provider discovery 与 invocation 也会按需读取其中的 `XAI_API_KEY`. `.env.example` 提供空变量清单, root `.env` 不进入 Git. 已安装 mise 时可以使用 npm-backed tasks:

```bash
mise dev
mise start
mise daemon
mise daemon:status
mise daemon:logs
mise daemon:stop
```

daemon state 与当前日志位于 ignored `.runtime/daemon/`. 它是单 checkout 后台进程, 不提供登录自启或崩溃重启.

Wildcard 模式会输出当前 usable active interfaces 的 concrete URLs; scoped IPv6 link-local address 不发布. Non-loopback listener 只用于 trusted LAN, 不提供 TLS、额外身份认证或公网安全承诺. Web UI 不会启动 Codex; 图片生成必须在 Codex 中显式调用 `$generate-and-archive`.

`npm run dev` 不会隐式初始化 Library. 如果 root、`library.json` 或访问权限缺失, Server 进入 `LIBRARY_UNAVAILABLE`, Web UI 在 Settings 显示绝对 Library path, 并提供 Initialize、Select 与 Retry. 此状态不会创建 Library 目录、`.cache/`、SQLite index 或 fallback Library; Index rebuild 不能恢复已删除的事实来源.

## External Library

可以把 Library 放在仓库外. CLI 参数优先级最高:

```bash
npm run assetctl -- init --library /Volumes/Media/TextToImageLibrary
npm run assetctl -- validate --library /Volumes/Media/TextToImageLibrary --full
```

`npm run dev` 持续使用的路径保存在不进入 Git 的 `text-to-image.local.json`:

```json
{
  "library": "/Volumes/Media/TextToImageLibrary"
}
```

成功执行 `init --library` 后, CLI 会自动写入上述本机配置. 已有 Library 使用:

```bash
npm run assetctl -- library select --library /Volumes/Media/TextToImageLibrary
```

Settings 也可以输入 Server 账号可访问的绝对路径, 初始化或选择 Library 并热切换 active context. Candidate full validation 与 Index rebuild 完成后才会排空旧请求、原子持久化选择并轮换 session token, 无需重启 Server.

把另一个 Library 的 committed graph 合并到 current Library 前, 先执行 dry run:

```bash
npm run assetctl -- library merge --source /Volumes/Archive/PreviousLibrary --dry-run
npm run assetctl -- library merge --source /Volumes/Archive/PreviousLibrary
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

- [用户使用手册](./docs/user/guide.md)
- [领域词汇](./CONTEXT.md)
- [文档索引](./docs/README.md)
- [文档规范](./docs/standards/documentation.md)
- [产品需求](./docs/product/requirements.md)
- [系统架构](./docs/design/system-architecture.md)
- [Asset Library 设计](./docs/design/asset-library.md)
- [Generation Workflow 设计](./docs/design/generation-workflow.md)
- [Purge Workflow 设计](./docs/design/purge-workflow.md)
- [Web UI 设计](./docs/design/web-ui.md)
- [开发指南](./docs/development/guide.md)
- [测试策略](./docs/development/testing.md)
- [架构决策](./docs/adr/)
- [任务计划](./task_plan.md)
- [研究与决策记录](./findings.md)
- [研发进度](./progress.md)

## Repository Guidance

Codex 与贡献者在工作前必须阅读 [AGENTS.md](./AGENTS.md).
