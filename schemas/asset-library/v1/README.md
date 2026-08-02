# Asset Library v1 Schema

本目录是 Asset Library format version 1 的规范化 JSON Schema 集合. `common.schema.json` 只保存共享定义, 其余文件分别约束单个磁盘 record. 跨 record 引用、hash ownership、symlink 与 Commit Marker 可见性由 `packages/archive` full validator 检查.
