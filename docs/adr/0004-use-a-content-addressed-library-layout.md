# 使用内容寻址的 Asset Library 布局

Asset Library 在全局 SHA-256 内容寻址目录中保存不可变 Image Asset, 并在稳定 Creation ID 下保存提示词历史与 Generation 记录. Generation 通过内容身份引用 Image Asset, 而不是把图片复制到 Creation 目录中; `archive/commits/` 保存权威 Commit Marker, `prompt-draft.md` 与 `inbox/` 是仅有的直接可编辑资产区域. 该布局保留跨 Creation 复用与 provenance, 代价是 Web UI 必须解析 Commit Marker 与元数据引用后才能展示图片.
