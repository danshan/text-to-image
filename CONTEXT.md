# Image Workspace

本上下文定义本地图片生成工作区中, 用于描述生成输入、历史与产物的统一语言.

## Language

**Creation**:
一条具有稳定创作意图的长期创作线. 它独占自己的提示词历史和 Generation, 但其中的 Generation 可以引用整个 Asset Library 共享的 Image Asset.
_Avoid_: Project, job, gallery

**Creation Purge**:
不可恢复地物理清除一个 Creation 的身份及其完整私有历史. 它不同于可逆的 `shelved` Curation 状态, 不级联删除 Library 级 Image Asset; 完成后不保留可识别被删除目标的永久 tombstone 或 audit record.
_Avoid_: Delete, archive, shelve, trash

**Prompt Draft**:
Creation 中由用户维护的当前可修改提示词工作稿. 它保留用户编写的内容与语言, 不因 Generation 成功、失败或中断而被 effective Prompt 自动替换; 它不属于永久生成历史.
_Avoid_: Current version, latest revision

**Prompt Revision**:
实际发送给图片生成工具的完整提示词不可变快照, 在生成或显式保存检查点时创建. Revision 可以指定一个父版本, 因而允许历史分支, 但不支持合并; 已有 Revision 永远不被修改或替换.
_Avoid_: Draft, prompt file

**Change Instruction**:
用户对某次调整的描述, Codex 据此产生 Prompt Revision. 它记录用户要求的变化, 但不是实际执行的提示词.
_Avoid_: Prompt, revision

**Image Asset**:
Asset Library 级别的不可变图片, 由内容标识. 同一 Image Asset 可以是某个 Generation 的输出, 也可以作为多个 Creation 中 Generation 的参考输入.
_Avoid_: Image file, attachment

**Image Asset Purge**:
不可恢复地物理清除一个 Library 级 Image Asset 及其 Curation. 仅允许作用于没有任何存续 Generation Output 或 Reference 关系的 Image Asset, 不由 Creation Purge 自动触发, 也不级联删除或修改 Generation; 完成后不保留可识别被删除目标的永久 tombstone 或 audit record. `inbox/` 中内容相同的用户输入文件与 Library 外部原始文件不属于自动 Purge 范围.
_Avoid_: Creation Purge, hide, garbage collection

**Session Image**:
当前 Codex 会话提供的图片输入. 它只有在原始 bytes 已物化并导入当前 Asset Library 后, 才能成为 Image Asset 并用于可归档的 Generation.
_Avoid_: Attachment, Reference Image

**Reference Image**:
Image Asset 在作为存续 Generation 视觉输入时承担的关系角色. 它不是独立的资产类型, 用途由关系上的 `roles` 与可选 `guidance` 表达; Generation 随 Creation Purge 消失后, 对应 Reference Image 关系同时消失, 不保留“曾被引用”的历史视图.
_Avoid_: Reference asset, copied input

**Generation**:
一次不可变的图片生成工具调用, 绑定一个 Prompt Revision 和一组确定的 Reference Image. 重试会产生新的 Generation, 单个 Generation 可以有零个或多个输出, 终态为 `succeeded`, `failed` 或 `interrupted`; `interrupted` 表示工具调用结果无法确定.
_Avoid_: Creation, batch, retry

**Generation Issue**:
由尚未 Purge 的 Creation 中, 已提交 Generation 的 known failure 或 uncertain outcome 表达的用户关注事项. 它不是独立持久化实体, 不是 Image Asset, 也不改变 Generation 的 immutable provenance; Creation Purge 提交后随所属历史一同消失.
_Avoid_: Failed image, broken asset, prompt violation

**Safety Rejection**:
图片生成工具在 input 或 output moderation stage 拒绝一次 Generation 的 known failure. Output-stage Safety Rejection 表示生成结果被拒绝, 不证明 Prompt 本身违规.
_Avoid_: Prompt violation, policy verdict, moderation error

**Replay**:
尽力复用既有 Generation 的全部已知输入和参数而产生的新 Generation. 它保留 provenance, 但不承诺像素级相同的输出.
_Avoid_: Reproduction, deterministic retry

**Archive**:
由工具管理的 Prompt Revision、Generation 与 Image Asset 不可变历史. 直接修改属于完整性违规, 而不是合法更新.
_Avoid_: Output folder, editable history

**Commit Marker**:
Archive 事务的不可变逻辑可见性边界. 只有被有效 Commit Marker 覆盖的记录才属于已提交历史.
_Avoid_: Index entry, cache record

**Curation**:
作用于 Creation 和 Image Asset 的可变、非历史性整理信息, 例如标题、标签、评分、备注、收藏与可见性. Creation 的 Curation 状态只能是可逆的 `active` 或 `shelved`; Curation 永远不改变生成 provenance 或资产身份.
_Avoid_: Archive metadata, generation history

**Asset Library**:
本地资产集合, 是提示词、参考图、生成图片及其关系的事实来源.
_Avoid_: Gallery, database, output folder

**Library Unavailable**:
当前解析到的 Asset Library root 或 manifest 不存在或不可访问的生命周期状态. 它表示事实来源不可用, 不等同于 Archive corruption 或 Index failure.
_Avoid_: Invalid Library, broken Gallery, rebuildable Index

**Library Maintenance**:
Asset Library 为执行 Purge 等独占维护操作而主动进入的短暂生命周期状态. 进入前排空现有 Library 请求, 期间拒绝新的读取、写入与 Generation, 只有维护完成并通过完整校验后才恢复服务; 它不等同于 Library Unavailable 或 Archive corruption.
_Avoid_: Library Unavailable, downtime, background cleanup

**Recovery Evidence Abandonment**:
用户为完成 Purge 而明确放弃指定未恢复 transaction 及其 staging 或 quarantine 证据的不可逆动作. 默认 Purge 遇到这些证据时 fail closed; 只有在 dry-run 列出准确 transaction 且用户二次确认后才允许物理清除, 不根据目录年龄或不完整 metadata 自动推断.
_Avoid_: Cancel, quarantine, automatic cleanup

**Purge Plan**:
Purge 执行前根据一个确定 Library snapshot 生成的单目标只读删除计划. 它只包含一个 Creation Purge 或一个 Image Asset Purge, 完整列出目标、删除与保留范围、阻塞关系、Recovery Evidence Abandonment 和资源需求; 执行必须提交匹配的 plan digest 与显式最终确认, snapshot 变化后原计划失效.
_Avoid_: Confirmation dialog, delete request, dry-run output

**Purge Cutover**:
verified replacement 开始替换 active Library 的不可逆边界. Cutover 前失败保持原 Library 不变; Cutover 开始后不得重新暴露包含 Purge 目标的旧 Library, 必须在 Library Maintenance 中继续清除 retired data、校验 replacement 并恢复 read model.
_Avoid_: Commit Marker, runtime switch, rollback point

**Library Merge**:
将完整 source Asset Library 的内容合并到 current destination Asset Library 的受控流程. Source 保持只读, destination 保留其 Library 身份. 因 Purge 完成后不保留 tombstone, 显式 Merge 可以把来源 Library 中相同身份或内容重新引入, 但不把它描述为恢复已删除数据.
_Avoid_: Library Import, folder copy

**Workspace Ready**:
Repository checkout、项目依赖与当前 Asset Library 均已可用的运行前置状态. 它不要求当前 Codex task 已完成过 Generation, 也不依赖文档或 Prompt 缓存.
_Avoid_: Warm cache, second generation

**Generation Workflow**:
由 Codex 驱动的端到端流程, 从用户明确生成请求开始, 读取 Asset Library 的生成输入, 调用图片生成工具, 并在结果归档、索引可用且最终结果已回复后结束. 它包含 Codex orchestration 与 repository execution; provider latency 单独观测, 不属于可控非模型开销.
_Avoid_: Web generation, gallery generation, Archive-only workflow

**Workflow Telemetry**:
以同一 `workflowRunId` 关联 Codex UI 权威端到端耗时与 repository stage durations 的可丢弃诊断记录. 未观测值保持 `unknown`, 不从其他 span 推测, 且不属于 Archive.
_Avoid_: Generation metadata, Archive performance history, estimated SLO
