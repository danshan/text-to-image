# 使用可重建的 SQLite read model

Web UI 可以把 Asset Library 记录投影到 `.cache/index.sqlite`, 以支持搜索、过滤、分页和关系查询, 但该索引永远不是权威数据. 每个索引值都必须能从归档文件恢复, 删除 `.cache/` 必须安全, Archive 提交也不得依赖索引可用性. 该选择在保持文件系统可迁移性的同时, 避免图库增长后反复全量扫描.
