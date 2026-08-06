---
title: Web UI Design
status: draft
owner: project
last_updated: 2026-08-06
related:
  - ../../CONTEXT.md
  - ../product/requirements.md
  - asset-library.md
  - purge-workflow.md
  - ../adr/0005-use-a-rebuildable-sqlite-read-model.md
  - ../adr/0007-separate-curation-from-provenance.md
  - ../adr/0008-use-a-typescript-local-web-stack.md
  - ../adr/0010-enable-web-controlled-library-hot-switching.md
  - ../adr/0011-allow-configurable-trusted-lan-binding.md
  - ../adr/0013-rebuild-and-replace-the-library-for-purge.md
---

# Web UI 设计

## Context

Web UI 是单用户、本地、client-rendered 的 Asset Library read-and-curate surface. 它通过 Browser-facing listener 读取权威 records 和 SQLite read model, 并通过共享 packages 更新 Draft、Curation 与 recovery commands.

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

| Route                             | Purpose                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `/gallery`                        | 默认图片网格、search、filter 与 sort                    |
| `/references`                     | 存在存续 Generation Reference usage 的 Image Asset      |
| `/creations`                      | Creation 列表与 `active \| shelved` 过滤                |
| `/creations/:creationId`          | Prompt branch、Generation timeline 与 Creation Curation |
| `/images/:sha256`                 | Image Asset provenance、引用与 Image Curation           |
| `/generations/:generationId`      | 一次工具调用的完整输入、输出和状态                      |
| `/recovery`                       | staging、quarantine、lock 与恢复操作                    |
| `/maintenance/purge/:operationId` | 独占 Purge progress、failure 与 restart recovery        |
| `/settings`                       | Library path、hot switch、format、index 与 diagnostics  |

根路径重定向到 `/gallery`. 非法 ID 返回 typed not-found state, 不回退到空页面.

### Global Navigation

Desktop 使用固定 200 px left rail, main area 顶部提供全局 search 与 Library health. 本阶段只支持桌面宽度, 最小 viewport 为 `1024x768`; 不提供移动 drawer 或 icon rail. 在窄桌面宽度下压缩 inspector 与内容列, 不隐藏主导航.

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

Library health 至少显示 `healthy`, `indexing`, `degraded`, `recovery_required`, `read_only`, `unavailable`.

## Visual Language

UI 使用 `Compact Editorial Workspace` frame. 图片本身提供主要色彩, chrome 保持中性, 保留 archive/editorial 的 mono metadata 与 registration language, 但减少装饰性留白和大 hero. 不使用 decorative gradient、glassmorphism、neon 或夸张 motion.

### Typography

使用离线 system font stack:

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

Prompt、hash、ID 与 JSON snippet 使用 mono. 正文、导航和 Curation 使用 sans. 不从 Google Fonts 或其他远程 origin 加载字体.

Desktop type scale 以可读密度为目标: body 默认 `14px`, editor 与主要 form control `14px` 以上, 重要 heading `28-48px`, section heading `20px`, metadata 和 status 最小 `11px`. 不使用 8-10 px 的功能性文字. Page header 与 topbar 合计保持紧凑, 不使用独立的装饰性 hero 区.

Sidebar 始终使用独立深色 token, Light、Dark 和 System 只改变 main workspace. Active navigation 使用高对比浅色底, secondary text、border 与 focus ring 使用独立 token, 避免把 workspace surface token 混入 sidebar.

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

### Generation Issues

Gallery 在 Image Asset 网格上方提供独立的 `Generation Issues` semantic region. 它不是图片卡片集合, 不创建 placeholder Image Asset, 也不改变 Gallery grid 的排序、过滤和键盘阅读顺序.

每个 active Creation 最多贡献一条 Issue, 只检查该 Creation 最新 Generation:

- 最新 Generation 为 `failed` 或 `interrupted`: 显示 Issue.
- 最新 Generation 为 `succeeded`: 不显示 Issue.
- 新 Generation 替换同一 Creation 的旧 Issue; 完整历史仍在 Creation Timeline.
- `shelved` Creation 不进入该区域.

Issue 按最新 Generation time 排序, 显示 Creation title、terminal status、time 和详情 links. Safety Rejection 额外显示 moderation stage、categories、非归罪说明与 `Review Prompt` action. Output-stage 固定说明生成结果被拒绝且 Prompt 可能提高触发概率, 不使用 Prompt violation 文案.

`Review Prompt` 打开 Generation Detail. 用户从不可变 Prompt Revision 检查实际输入, 再进入 Creation 编辑 Prompt Draft; UI 可以复制 revision instruction 交给 Codex, 但不自动改写 Prompt、不自动高亮推测触发词、不提供一键 retry.

### Grid

Gallery 使用 desktop responsive grid, 但 DOM 严格按当前 sort 顺序排列. 实现不得使用会把视觉列顺序与 DOM 顺序分离的 CSS columns.

- Desktop: 根据 container width 自适应 3-6 columns, 在 `1024x768` 不产生横向 overflow.
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

Prompt History 与 Generation Timeline 是同一 provenance 的两个视图, 但不合并为一张 Generation 卡片. Focus 与 Compare 使用独立状态:

- 点击 Prompt Revision 会 Focus 该 Revision, 保留完整 Timeline, 高亮全部关联 Generation, 并定位到最新关联项.
- Focused Revision 按 Generation usage 分组展开实际 Reference Image、roles 与 guidance; 没有关联调用时显示尚未生成.
- 点击 Timeline Generation 会 Focus 唯一 Prompt Revision 与该次调用; Timeline item 始终展示 Prompt Revision link 与 Reference Image thumbnails.
- Focus 使用 `revision` 与可选 `generation` query parameters. 无参数时默认 Focus 最新 Generation 及其 Prompt Revision; 没有 Generation 时选择最新 Revision.
- Detail 页面返回 Creation 时携带相同参数, 因而刷新、复制链接和 browser history 均恢复精确上下文.

默认显示 linearized Prompt branch 与完整 chronological Timeline, branch indentation 表示 parent relation. 复杂可视化图不是 MVP. Restore old Revision 只更新 Draft 和 `basedOnRevisionId`, 不修改历史.

页面可以准备 Reference Image selection 与 roles, 但只生成一份可复制的 Codex invocation instruction, 不从 browser 调用 Codex.

页面底部提供 `Danger Zone`. Creation Purge 是这里唯一的删除入口, 不出现在 Creation list 或其他快捷菜单. 点击后先请求只读 Purge Plan, 再在最终确认对话框展示目标、将删除的 Draft、Revision、Generation、Curation、Generation Issue、Reference relation 与 recovery evidence, 同时明确列出所有保留的 Image Asset. 用户使用 `Cancel` 或 `Permanently delete` 完成常规二次确认, 不手动输入 Creation ID.

## Image Asset Detail

Detail 使用两栏布局:

- Main: full preview, zoom, dimensions, media type 和 hash.
- Inspector: producing Generation, used-as-reference relations, Generation 与 Prompt Revision links 和 Curation controls.

同一 Image Asset 没有 producing Generation 时显示 `Imported`. 有 producing Generation 时最多一个直接 producing relation, 但可以被任意多个 Generation 引用.

每条 used-as-reference relation 是一次 Generation usage, 同时展示 Generation、该调用的 Prompt Revision、roles 与 guidance. UI 不把多个 usage 合并为直接 Reference Image -> Prompt Revision 关系.

图片 content endpoint 只接受 hash 与 predefined variant:

```text
GET /api/v1/images/:sha256/content?variant=thumbnail
GET /api/v1/images/:sha256/content?variant=original
```

服务端从 index/Archive 解析 canonical path, 不接受 query filesystem path.

Detail 底部提供 Image Asset `Danger Zone`, 这是 Image Asset Purge 的唯一 Web 入口. 最终确认对话框展示目标、全部 blocking Output / Reference relation、Image Curation、thumbnail、payload bytes、Inbox exact-content warning 与 recovery evidence. 任一存续关系存在时禁用 Execute 并提供对应 Creation 与 Generation links; 不提供 cascade override. 用户使用 `Cancel` 或 `Permanently delete` 完成常规二次确认, 不手动输入 Image Asset SHA-256.

## Generation Detail

必须展示:

- terminal status、outcomeKnown 与时间.
- Creation 与 Prompt Revision links; 两者返回同一个 URL-backed provenance Focus.
- Change Instruction 与完整 actual prompt.
- Parent Revision 与 Prompt diff action.
- Reference Image thumbnails、roles 与 guidance.
- Output 顺序与 Image Asset links.
- built-in tool name、已知 model 和 parameters.
- Replay source 或 derived Replay links.
- known failure error code、summary 与 optional moderation metadata, 或 interrupted warning.

Unknown tool fields 显示 `Unknown`, 不显示推测值.

Safety Rejection 使用结构化 warning panel, 不直接渲染 raw JSON. Panel 展示 stage 与工具明确暴露的 categories, 并提供 category-level guidance. Guidance 必须标记为修改建议而非已确认触发词; 只有工具未来返回明确 evidence spans 时才允许精确高亮.

恢复路径固定为 `Review Prompt -> Edit Prompt Draft -> 显式创建新 Generation`. Prompt Revision 和失败 Generation 保持不可变, Web UI 不直接调用图片工具.

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

Recovery Evidence Abandonment 不作为 Recovery 页面的通用 delete action. 它只能从目标 Detail 的 Purge Plan 中逐个选择 exact transaction, 显示 irreversible consequence 并二次确认. 存活 owner 或仍在执行的图片工具调用不显示可绕过选项.

## Purge Maintenance Page

Purge execute 后导航到 `/maintenance/purge/:operationId`. 页面不可手动关闭或导航到其他 Library data route, 只展示真实 phase 与累计时间:

```text
Preparing candidate
Validating replacement
Cutover started
Removing retired data
Rebuilding index
Validation complete
```

没有可观测总量时不显示百分比或 ETA. Cutover 前失败返回原 Detail 并保留 plan error; Cutover 后失败保持 maintenance 页面, 显示 stable error、exact blocked path 和 restart recovery 指引, 不提供 rollback. Creation Purge 完成后导航到 `/creations`, Image Asset Purge 完成后导航到 `/gallery`.

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
GET /api/v1/generation-issues
GET /api/v1/references
GET /api/v1/creations
GET /api/v1/creations/:creationId
GET /api/v1/images/:sha256
GET /api/v1/generations/:generationId
GET /api/v1/recovery
GET /api/v1/library/transition
```

核心 mutation endpoints:

```text
PATCH /api/v1/curation/creations/:creationId
PATCH /api/v1/curation/images/:sha256
PUT /api/v1/creations/:creationId/draft
POST /api/v1/imports
POST /api/v1/recovery/:transactionId/:action
POST /api/v1/index/rebuild
POST /api/v1/library/transitions
POST /api/v1/library/transitions/:transitionId/commit
POST /api/v1/purge/creations/:creationId/prepare
POST /api/v1/purge/creations/:creationId/execute
POST /api/v1/purge/images/:sha256/prepare
POST /api/v1/purge/images/:sha256/execute
GET /api/v1/purge/operations/:operationId
```

Mutation routes 调用 shared packages, 不复制 archive logic. Web API 不暴露 Archive generic file write、filesystem directory listing 或任意文件读取 endpoint.

`GET /api/v1/generation-issues` 返回从权威 Generation、Creation Curation 与 read model 派生的 bounded list. 每项至少包含 Generation ID、Creation ID/title、status、outcomeKnown、time 和 typed error; endpoint 不创建新的 mutable Issue state.

`GET /api/v1/images/:sha256` 的每条 used-as-reference relation 返回 `generationId`、`creationId`、`promptRevisionId`、`roles` 与 `guidance`; `promptRevisionId` 从 Generation read model 派生, 不写回 Archive.

Purge prepare response 是 snapshot-bound plan, execute request 必须提交 `planDigest`、`confirmed: true` 与 exact abandonment transaction IDs. Server 在 execute 时重算权威 plan; 不匹配返回 `409 PURGE_PLAN_STALE`. Maintenance 期间除 bootstrap、health、Purge operation status 与必要 diagnostics 外, Library API 返回 `503 LIBRARY_MAINTENANCE`.

## Local Service Security

- 默认绑定 `127.0.0.1`; 用户可以显式选择具体 IP、`0.0.0.0` 或 `::` 用于 trusted LAN.
- Wildcard bind 只允许启动时发现的 usable active interface IP literal, 不接受 scoped IPv6 link-local address 或 DNS hostname; interface 变化后需要重启.
- 启动时生成高熵 session token, 通过同源 bootstrap document 注入前端 memory.
- mutation 与 sensitive read request 发送 `X-Session-Token`.
- 校验精确 `Host` 和 `Origin`, 不启用 CORS wildcard.
- 设置 CSP, 至少限制 `default-src 'self'`, image source 为 `'self' blob:`.
- 静态资源与 API response 默认 `Cache-Control` 清晰区分; bootstrap token 不进入持久 browser cache.
- Server 只在 bootstrap 与 Library transition response 中返回 resolved absolute Library path.
- Library path 由 shared resolver canonicalize, 并受 Server OS account permissions 限制; Archive file access 仍使用 shared root containment.
- Non-loopback 模式不增加 access secret 或 TLS, 不支持直接暴露到公网.

## Loading, Empty, Error and Degraded States

- 预计超过 300 ms 的请求显示 skeleton 或 progress, 不冻结页面.
- 初次 index 显示 processed/total record count.
- 单个坏 Curation record 不阻断整个 Gallery, 以局部 diagnostic card 表示.
- Archive corruption 使 service 进入 read-only degraded mode, 阻断 mutation 并提供 validator report.
- API error 使用 stable code、human message、recovery hint 与 correlation ID.
- Library transition 显示单个 monotonic stage/count progress; ready 后执行短 commit, 成功后 reload 获取新 bootstrap.
- Purge execute 后锁定到 maintenance progress; reload 和 daemon restart 通过 operation ID 恢复同一 roll-forward 状态.
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

- Session token invalid: 清晰提示服务已重启或 Library 已切换, reload 获取新 bootstrap.
- Index unavailable: 显示 rebuild action; Archive detail 可以通过 bounded direct read 进入 diagnostics.
- Curation conflict: 保留 local draft, 显示 server current state.
- External Draft edit: editor 切换为 conflict state, 禁止自动保存覆盖.
- Library root、manifest 或 permission lost: service 在首个后续 request 进入统一 `LIBRARY_UNAVAILABLE`, 导航到 Settings, 不创建默认替代目录.
- Library Unavailable: 只保留 static Web、bootstrap、health、initialize、select 和 Retry control plane; Index rebuild 禁用.
- Library path 外部恢复: 用户显式 Retry 后执行 full validation、Index prepare 和 atomic switch, 不自动打开.
- Unsupported format: 显示 required app/Library version, 不提供 force-open.
- Purge reference blocked: 显示全部 Output / Reference relation 和可导航的 Creation / Generation context, 不提供 cascade.
- Purge plan stale: 不保留旧确认, 重新 prepare 并要求用户再次检查 impact.
- Purge cleanup failure: 保持 maintenance, 显示 exact path 与 retry diagnostics, 不提供 rollback 或 force delete.

## Compatibility

Web UI build 与 server API 版本必须匹配. Server bootstrap 返回:

```json
{
  "apiVersion": "v1",
  "libraryFormatVersion": 1,
  "library": {
    "status": "ready",
    "libraryRoot": "/Volumes/Media/TextToImageLibrary"
  },
  "capabilities": {
    "curation": true,
    "recovery": true,
    "libraryManagement": true,
    "purge": true,
    "generationFromWeb": false
  }
}
```

如果事实来源不可用, `library` 改为:

```json
{
  "status": "unavailable",
  "libraryRoot": "/Volumes/Media/TextToImageLibrary",
  "reason": "missing_manifest",
  "allowedActions": ["initialize", "select", "retry"]
}
```

此状态下 `curation` 与 `recovery` capability 均为 `false`, `libraryManagement` 保持 `true`. UI 只渲染 Settings control plane. Transition commit 成功后 Server 轮换 session token, initiator reload, 其他 tab 的 stale token 被拒绝.

Library Maintenance 时 bootstrap 返回 `status: "maintenance"`、operation ID、phase 与 allowed control-plane actions. `curation`, `recovery`, `libraryManagement` 和 Generation data capability 均为 `false`; `purgeStatus` 保持 `true`.

前端遇到不支持的 major API version 时显示 upgrade error, 不尝试猜测 response shape.

## Validation

- Component tests 覆盖 card、filter、Prompt diff、独立 provenance Focus、URL round-trip、同 Revision 多 Generation 高亮、Reference usage、Curation conflict 和 recovery action states.
- Accessibility automation 覆盖 route landmarks、labels、contrast、dialog 和 keyboard order.
- End-to-end tests 覆盖 Gallery -> Image -> Generation -> Creation provenance navigation, 以及 Generation/Image Detail 到精确 Prompt Revision 与 Generation Focus 的反向 links.
- Desktop review 覆盖 `1024x768`, `1280x720`, `1366x768`, `1440x900` 和 `1920x1080`, 以及 Light、Dark、System theme. 重点检查首屏 header、controls、第一批内容、两栏 detail、loading、empty、failed、interrupted、degraded 和 conflict states.
- Component 与 end-to-end tests 覆盖 Generation Issues latest-per-active-Creation derivation、Safety Rejection wording、Review Prompt navigation 和后续 succeeded Generation 消退.
- Security tests 覆盖 Host、Origin、token、CORS、CSP、path traversal 和 arbitrary file access.
- Component 与 integration tests 覆盖 absolute Library path、single transition、progress、Library Unavailable navigation、atomic switch 和 stale token rejection.
- Component、API integration 与 E2E 覆盖两个 Detail Danger Zone、Purge Plan impact、reference blocker、boolean final confirmation、stale plan、abandonment、maintenance progress、完成导航和旧 deep link `404`.
- Performance tests 使用 accepted synthetic dataset 与 warm/cold cache cases.
- Visual regression 覆盖 light、dark、loading、empty、error 和 degraded states.
