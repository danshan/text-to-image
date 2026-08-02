# 原子提交 Generation

Generation 归档使用与 Asset Library 位于同一文件系统的工具管理 `.staging/` 事务. Prompt Revision、生成文件、哈希、引用与终态 Generation 记录完成校验后, 在短时全局锁内以 create-if-absent 方式安装到最终路径; 最后通过一次原子 rename 发布不可变 Commit Marker, 作为整个跨目录事务的唯一逻辑可见性边界. reader 只承认有效 Marker 覆盖的记录. 中断事务按照 `prepared`, `invocation_started`, `outputs_captured`, `ready_to_commit` 阶段显式取消、归档、继续提交或隔离, 永远不自动重试或删除, 从而避免重复调用、部分历史被误认为有效以及失败现场丢失.
