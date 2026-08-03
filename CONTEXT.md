# Image Workspace

本上下文定义本地图片生成工作区中, 用于描述生成输入、历史与产物的统一语言.

## Language

**Creation**:
一条具有稳定创作意图的长期创作线. 它独占自己的提示词历史和 Generation, 但其中的 Generation 可以引用整个 Asset Library 共享的 Image Asset.
_Avoid_: Project, job, gallery

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

**Reference Image**:
Image Asset 在作为 Generation 视觉输入时承担的关系角色. 它不是独立的资产类型, 用途由关系上的 `roles` 与可选 `guidance` 表达.
_Avoid_: Reference asset, copied input

**Generation**:
一次不可变的图片生成工具调用, 绑定一个 Prompt Revision 和一组确定的 Reference Image. 重试会产生新的 Generation, 单个 Generation 可以有零个或多个输出, 终态为 `succeeded`, `failed` 或 `interrupted`; `interrupted` 表示工具调用结果无法确定.
_Avoid_: Creation, batch, retry

**Generation Issue**:
由已提交 Generation 的 known failure 或 uncertain outcome 表达的用户关注事项. 它不是 Image Asset, 也不改变 Generation 的 immutable provenance.
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

**Library Merge**:
将完整 source Asset Library 的内容合并到 current destination Asset Library 的受控流程. Source 保持只读, destination 保留其 Library 身份.
_Avoid_: Library Import, folder copy

**Generation Workflow**:
由 Codex 驱动的流程, 从 Asset Library 读取生成输入, 并将结果归档回 Asset Library.
_Avoid_: Web generation, gallery generation
