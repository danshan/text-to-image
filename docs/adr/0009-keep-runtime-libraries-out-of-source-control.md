# 不把运行时 Asset Library 纳入源码 Git

用户运行时 Asset Library 整体不进入源码 Git, 默认 `./library/` 与本机外部路径配置都被精确忽略; Git 只保存 versioned JSON Schema、最小与非法 fixtures、初始化器、validator、迁移器和正式文档. 该选择避免不可变大图片膨胀源码历史, 也避免只提交 metadata 而忽略 payload 形成无法完整 checkout 的伪历史; 代价是用户必须单独备份 Library, 新用户则通过 `assetctl init` 从仓库内格式契约创建实例.
