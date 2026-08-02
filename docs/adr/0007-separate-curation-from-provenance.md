# 分离 Curation 与 provenance

不可变生成 provenance 位于 Archive, 可变标题、标签、评分、备注、收藏与可见性位于独立的 `curation/` 目录. 两者都会被索引到可重建 SQLite read model, 但 Curation 修改永远不会重写 Prompt Revision、Generation、Image Asset 身份或其关系. 该边界在保留可信历史的同时, 避免把普通图库整理建模为追加式事件流.
