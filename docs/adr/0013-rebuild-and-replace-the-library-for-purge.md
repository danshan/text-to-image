# 通过 verified replacement 执行不可逆 Purge

## Background

现有 Asset Library 使用不可变 record 与 append-only Commit Marker 证明 provenance. Commit Marker 直接列出必须存在且 digest 匹配的路径, 因此原地删除 Creation、Generation 或 Image Asset 会在多文件操作期间产生 Marker 指向缺失文件的中间状态. 文件系统又不能用一次 portable rename 原子删除 Creation tree、Curation、Image Asset、Marker 和 cache.

Purge 还必须同时满足三个互相牵制的目标: 完成后物理清除目标且不保留 tombstone, 崩溃后不重新暴露已经进入 cutover 的数据, 以及任何时刻都不能把半删除 Library 当作 healthy source of truth.

## Decision

Purge 不原地修改 active Library. 系统在独占 Library Maintenance 中, 根据已确认的单目标 Purge Plan 构建 sibling candidate Library, 只复制或 hard-link 存续数据, 并重写 surviving Commit Marker 集合. Candidate 通过 full validation 后进入 Purge Cutover: active root 被移动为 retired root, candidate 替换 active root, 然后物理清除 retired root、临时 journal 与 cache 残留.

Cutover 前失败保持原 Library 不变. Cutover 开始后不得 rollback 到包含目标的 retired root, 启动恢复只能 roll forward. 只有 retired root 已删除、replacement full validation 通过且 read model index ready 后, Purge 才完成并恢复 Library 服务.

Purge 完成态不保存目标 identity、hash、路径或历史关系的 tombstone 与 audit record. Library Merge 因此可以把其他 source Library 中相同身份或内容重新引入.

## Consequences

- Active Library 不会向 reader 暴露 Commit Marker 断裂的中间状态.
- Candidate 可以在 cutover 前完整验证, 失败时保持原 Library 不变.
- Cutover 后恢复方向唯一, 避免已确认删除的数据重新可见.
- 操作需要独占 maintenance、同级目录写权限、临时磁盘空间和 restart recovery.
- 存续不可变 Image Asset 可以优先使用同文件系统 hard link, 不支持时必须复制.
- Purge 时间与 Library 大小相关, 第一版因此只支持单目标, 不提供批量或级联删除.
- 无永久 tombstone 意味着系统不能阻止显式 Merge 重新引入已删除内容.

## Rejected Alternatives

### 原地 journaled deletion

原地删除可以减少临时空间, 但必须让 validator、reader 与 recovery 理解多个 Marker 和文件树不同步的中间状态. 该方案扩大 corruption surface, 也使 crash 后的可见性更难证明.

### 永久 tombstone 加后台 compaction

永久 tombstone 可以快速隐藏目标并防止 Merge resurrection, 但它保留被删除 identity, 不满足已经确认的完整物理删除语义.

### Creation Purge 级联 Image Asset

Image Asset 属于 Library 且可能跨 Creation 复用. 级联删除会把局部操作扩张为全局引用图 mutation, 因而 Image Asset Purge 保持独立并在存在存续 Output 或 Reference 关系时 fail closed.
