---
title: Web UI Design
status: accepted
owner: project
last_updated: 2026-08-03
related:
  - ../../CONTEXT.md
  - ../product/requirements.md
  - asset-library.md
  - ../adr/0005-use-a-rebuildable-sqlite-read-model.md
  - ../adr/0007-separate-curation-from-provenance.md
  - ../adr/0008-use-a-typescript-local-web-stack.md
---

# Web UI 设计

## Context

Web UI 是单用户、本地、client-rendered 的 Asset Library read-and-curate surface. 它通过只监听 loopback 的 Fastify service 读取权威 records 和 SQLite read model, 并通过共享 packages 更新 Draft、Curation 与 recovery commands.

默认入口服务“找图”, Creation 页面服务“理解创作过程”. Web UI 不直接启动 Codex 或 image generation.

## Invariants

1. Web UI 不读取任意 filesystem path, 所有图片请求都使用已校验 asset hash.
2. UI 不把 SQLite 当作事实来源, cache degraded 时仍可展示明确诊断和 rebuild action.
3. URL 保存页面身份、search、filter、sort 和 selection, browser back/forward 必须可预测.
4. Curation mutation 使用 optimistic concurrency, conflict 不得静默覆盖.
5. Image Asset、Generation 和 Prompt Revision 详情必须能返回权威 source record.
6. 外部导入且从未作为 Output 的图片默认不进入主 Gallery.
7. 所有主要能力可使用键盘完成, focus order 与视觉和 DOM 顺序一致.
8. 应用不依赖远程字体、CDN 或云服务才能启动.

## Information Architecture

### Routes

| Route                        | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `/gallery`                   | 默认图片网格、search、filter 与 sort                    |
| `/references`                | 外部导入与曾作为 Reference Image 的资产                 |
| `/creations`                 | Creation 列表与 `active                                 | shelved` 过滤 |
| `/creations/:creationId`     | Prompt branch、Generation timeline 与 Creation Curation |
| `/images/:sha256`            | Image Asset provenance、引用与 Image Curation           |
| `/generations/:generationId` | 一次工具调用的完整输入、输出和状态                      |
| `/recovery`                  | staging、quarantine、lock 与恢复操作                    |
| `/settings`                  | 当前 Library、format、index 和 server diagnostics       |

根路径重定向到 `/gallery`. 非法 ID 返回 typed not-found state, 不回退到空页面.

### Global Navigation

Desktop 使用固定 left rail, main area 顶部提供全局 search 与 Library health. Narrow viewport 把 rail 收敛为可访问 drawer, main content 保持完整路由.

```text
+------------------+--------------------------------------------------+
| Library          | Search prompts, tags, notes...        Health     |
|                  +--------------------------------------------------+
| Gallery          | Page title                  Filters   Sort        |
| References       +--------------------------------------------------+
| Creations        |                                                  |
| Recovery         | Content                                          |
| Settings         |                                                  |
|                  |                                                  |
+------------------+--------------------------------------------------+
```

Library health 至少显示 `healthy`, `indexing`, `degraded`, `recovery_required`, `read_only`.

## Visual Language

UI 使用 content-first minimal frame. 图片本身提供主要色彩, chrome 保持中性, 不使用 decorative gradient、glassmorphism、neon 或夸张 motion.

### Typography

使用离线 system font stack:

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

Prompt、hash、ID 与 JSON snippet 使用 mono. 正文、导航和 Curation 使用 sans. 不从 Google Fonts 或其他远程 origin 加载字体.

### Color Tokens

Light:

```css
--surface-canvas: #fafafa;
--surface-panel: #ffffff;
--surface-muted: #f4f4f5;
--text-primary: #09090b;
--text-secondary: #52525b;
--border-default: #e4e4e7;
--accent-primary: #2563eb;
--status-danger: #b91c1c;
--status-warning: #a16207;
--status-success: #15803d;
```

Dark:

```css
--surface-canvas: #09090b;
--surface-panel: #121214;
--surface-muted: #27272a;
--text-primary: #fafafa;
--text-secondary: #a1a1aa;
--border-default: #3f3f46;
--accent-primary: #60a5fa;
--status-danger: #f87171;
--status-warning: #facc15;
--status-success: #4ade80;
```

默认跟随 `prefers-color-scheme`, 用户选择保存在 browser local preference. Theme preference 是 UI preference, 不属于 Asset Library Curation.

所有文本和交互状态满足 WCAG 2.2 AA contrast. Status 不得只用颜色表达, 必须同时使用 label 或 icon.

### Shape and Motion

- Radius 使用 6 px 或 10 px 两级, 不使用 pill card.
- Card hover 只改变 border、background 或 shadow, 不 scale 和位移.
- 标准 transition 为 150-200 ms.
- 遵守 `prefers-reduced-motion`; 禁止自动播放装饰动画.
- icon 使用单一 SVG icon set, 不使用 emoji 充当 UI icon.

## Gallery

### Grid

Gallery 使用 masonry-like responsive grid, 但 DOM 严格按当前 sort 顺序排列. 实现不得使用会把视觉列顺序与 DOM 顺序分离的 CSS columns.

- Desktop: 根据 container width 自适应 3-6 columns.
- Minimum card width: 220 px.
- Card 使用 cache thumbnail, 保持原始 aspect ratio.
- 首屏 thumbnail eager load, below-fold lazy load.
- 长列表使用 windowing 或 incremental rendering, 但 browser find 和 focus restoration 必须保持可用.
- 每张卡片是语义 link, overlay action 使用独立可聚焦 button.

Card 显示:

- thumbnail 和可用 alt text.
- Creation title.
- Generation time.
- favorite、rating 和 tags summary.
- failed/interrupted/recovery badge when relevant.

Fallback alt text 使用 `Generated image from <creation-title>`, 有用户 note 时允许更具体描述. Filename 或 hash 不能作为唯一 alt text.

### Search and Filters

Search 覆盖:

- Creation title.
- Prompt Revision content.
- Change Instruction.
- Curation tags 和 notes.

Filters:

- Creation.
- `active | shelved`.
- tags、favorite、rating.
- generated Output 或 imported Reference source.
- Reference Image roles.
- Generation status.
- tool、model 和 time range.

Sort:

- `newest`.
- `oldest`.
- `rating_desc`.

Query state 编码到 URL. Search input 使用 debounced request, Enter 立即执行. No-results state 显示当前 filter summary、clear action 和可行建议, 不显示空白页.

第一版不提供 autocomplete、semantic search、visual similarity 或 saved searches.

## Creation Page

页面由四部分组成:

1. Header: title、tags、favorite、`active | shelved` 与 Draft status.
2. Prompt Draft: Markdown editor、external edit warning、based-on Revision 与 optimistic save.
3. Prompt History: 单父节点 branch tree, 支持选择两个 Revision 查看 diff.
4. Generation Timeline: 按时间展示 status、Reference Image、Output 与 Replay relation.

默认显示 linearized timeline, branch indentation 表示 parent relation. 复杂可视化图不是 MVP. Restore old Revision 只更新 Draft 和 `basedOnRevisionId`, 不修改历史.

页面可以准备 Reference Image selection 与 roles, 但只生成一份可复制的 Codex invocation instruction, 不从 browser 调用 Codex.

## Image Asset Detail

Detail 使用两栏布局:

- Main: full preview, zoom, dimensions, media type 和 hash.
- Inspector: producing Generation, used-as-reference relations, Creation links 和 Curation controls.

同一 Image Asset 没有 producing Generation 时显示 `Imported`. 有 producing Generation 时最多一个直接 producing relation, 但可以被任意多个 Generation 引用.

图片 content endpoint 只接受 hash 与 predefined variant:

```text
GET /api/v1/images/:sha256/content?variant=thumbnail
GET /api/v1/images/:sha256/content?variant=original
```

服务端从 index/Archive 解析 canonical path, 不接受 query filesystem path.

## Generation Detail

必须展示:

- terminal status、outcomeKnown 与时间.
- Creation 与 Prompt Revision links.
- Change Instruction 与完整 actual prompt.
- Parent Revision 与 Prompt diff action.
- Reference Image thumbnails、roles 与 guidance.
- Output 顺序与 Image Asset links.
- built-in tool name、已知 model 和 parameters.
- Replay source 或 derived Replay links.
- known failure error category 或 interrupted warning.

Unknown tool fields 显示 `Unknown`, 不显示推测值.

## Recovery Page

Recovery 是显式运维 surface, 不隐藏在 Settings 内. 每个 transaction 显示:

- state、Creation、Generation、age.
- 已存在的 Prompt、Reference、Output 与 validation results.
- 推荐 action 和 action consequence.

可用 action 由 server capabilities 决定:

- `prepared`: cancel.
- `invocation_started`: finalize interrupted.
- `outputs_captured`: inspect and continue.
- `ready_to_commit`: commit.
- malformed: quarantine.

所有 action 先展示 dry-run. destructive label 只用于无法自动恢复的数据动作; quarantine 是可恢复 move. UI 不提供 delete staging 或 break lock 的通用按钮.

## Curation Mutations

Curation API 使用 expected `entityRevision`:

```json
{
  "expectedRevision": 4,
  "patch": {
    "favorite": true,
    "tags": ["portrait", "soft-light"]
  }
}
```

冲突返回 current representation 和 typed conflict. UI 保留用户尚未提交的修改, 提供 review-and-retry, 不做 last-write-wins.

Hide 只影响主 Gallery 可见性. Hidden Image 仍能从 Generation、direct URL 和明确 filter 访问. Creation `shelved` 默认从 active views 排除, 但历史不改变.

## API Boundary

API 使用 `/api/v1`. 核心 read endpoints:

```text
GET /api/v1/health
GET /api/v1/gallery
GET /api/v1/references
GET /api/v1/creations
GET /api/v1/creations/:creationId
GET /api/v1/images/:sha256
GET /api/v1/generations/:generationId
GET /api/v1/recovery
```

核心 mutation endpoints:

```text
PATCH /api/v1/curation/creations/:creationId
PATCH /api/v1/curation/images/:sha256
PUT /api/v1/creations/:creationId/draft
POST /api/v1/imports
POST /api/v1/recovery/:transactionId/:action
POST /api/v1/index/rebuild
```

Mutation routes 调用 shared packages, 不复制 archive logic. Web API 不暴露 Archive generic file write endpoint.

## Local Service Security

- 只绑定 `127.0.0.1`, 不绑定 `0.0.0.0`.
- 启动时生成高熵 session token, 通过同源 bootstrap document 注入前端 memory.
- mutation 与 sensitive read request 发送 `X-Session-Token`.
- 校验精确 `Host` 和 `Origin`, 不启用 CORS wildcard.
- 设置 CSP, 至少限制 `default-src 'self'`, image source 为 `'self' blob:`.
- 静态资源与 API response 默认 `Cache-Control` 清晰区分; bootstrap token 不进入持久 browser cache.
- server 不返回 Library absolute path, Settings 仅在本机显式 diagnostics 中显示 canonical path.
- 所有 file access 使用 shared path resolver, 先 canonicalize 再执行 root containment 与 symlink checks.

## Loading, Empty, Error and Degraded States

- 预计超过 300 ms 的请求显示 skeleton 或 progress, 不冻结页面.
- 初次 index 显示 processed/total record count.
- 单个坏 Curation record 不阻断整个 Gallery, 以局部 diagnostic card 表示.
- Archive corruption 使 service 进入 read-only degraded mode, 阻断 mutation 并提供 validator report.
- API error 使用 stable code、human message、recovery hint 与 correlation ID.
- browser reload 和 back navigation 恢复 search、filter、scroll anchor 和 focused card where possible.

## Accessibility

- 目标 WCAG 2.2 AA.
- 提供 skip-to-content link 和正确 heading hierarchy.
- 所有 form control 具有 visible label, placeholder 不是唯一 label.
- Dialog 使用 focus trap, 关闭后 focus 返回触发控件.
- Grid navigation 不劫持标准 Tab; arrow-key enhancement 只能作为附加能力.
- Focus ring 始终可见, 不因 mouse mode 全局移除.
- status、rating 与 selected state 同时提供 text 或 accessible name.
- Prompt diff 不只用红绿颜色, 同时提供 insertion/deletion labels.

## Performance

- API 按 cursor pagination 返回 Gallery, 不一次加载全库.
- SQLite query 使用 FTS 与结构化 index, query plan 纳入 benchmark.
- thumbnail 在 `.cache/thumbnails/` 按 asset hash 和 transform version 寻址.
- thumbnail generation 有 bounded concurrency, 不阻塞 Archive commits.
- original image 只在 detail 或显式 zoom 时加载.
- React performance 先 profile 后优化, component state 只保存不可派生值.

## Failure Handling

- Session token invalid: 清晰提示服务已重启, reload 获取新 bootstrap.
- Index unavailable: 显示 rebuild action; Archive detail 可以通过 bounded direct read 进入 diagnostics.
- Curation conflict: 保留 local draft, 显示 server current state.
- External Draft edit: editor 切换为 conflict state, 禁止自动保存覆盖.
- Library moved or permission lost: service 进入 read-only unavailable state, 不创建默认替代目录.
- Library manifest missing: bootstrap screen 显示 canonical path 与 shell-safe exact init command; 不请求 Gallery 或其他 Library API.
- Unsupported format: 显示 required app/Library version, 不提供 force-open.

## Compatibility

Web UI build 与 server API 版本必须匹配. Server bootstrap 返回:

```json
{
  "apiVersion": "v1",
  "libraryFormatVersion": 1,
  "initialization": null,
  "capabilities": {
    "curation": true,
    "recovery": true,
    "generationFromWeb": false
  }
}
```

如果 `library.json` 不存在, `initialization` 改为:

```json
{
  "required": true,
  "libraryRoot": "/Volumes/Media/TextToImageLibrary",
  "initCommand": "npm run assetctl -- init --library '/Volumes/Media/TextToImageLibrary'"
}
```

此状态下 `curation` 与 `recovery` capability 均为 `false`. UI 在 bootstrap 层停止常规 route rendering, 因而不会触发会访问未打开 read model 的请求. 用户完成初始化后必须 restart local service, 再 reload 页面获取新的 bootstrap.

前端遇到不支持的 major API version 时显示 upgrade error, 不尝试猜测 response shape.

## Validation

- Component tests 覆盖 card、filter、Prompt diff、Curation conflict 和 recovery action states.
- Accessibility automation 覆盖 route landmarks、labels、contrast、dialog 和 keyboard order.
- End-to-end tests 覆盖 Gallery -> Image -> Generation -> Creation provenance navigation.
- Security tests 覆盖 Host、Origin、token、CORS、CSP、path traversal 和 arbitrary file access.
- Performance tests 使用 accepted synthetic dataset 与 warm/cold cache cases.
- Visual regression 覆盖 light、dark、loading、empty、error 和 degraded states.
