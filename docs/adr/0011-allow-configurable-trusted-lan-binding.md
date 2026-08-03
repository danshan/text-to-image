# 允许配置 trusted LAN listener

Browser-facing listener 默认继续绑定 `127.0.0.1`, 但用户可以通过 `--host` 显式绑定具体 IP、`0.0.0.0` 或 `::`. Wildcard bind 只发布启动时发现的 usable active interface IP literal, 并继续执行 exact `Host`、`Origin` 与 session token 校验. 这一能力只面向 trusted LAN, 不增加 TLS 或额外身份认证, 也不支持直接暴露到公网. 相比强制 loopback, 该决定允许同一内网设备访问 Asset Library; 代价是用户必须对所选网络边界负责. 本决定替代 ADR 0008 中 Fastify 只监听 loopback 的局部约束, 不改变其 TypeScript local Web stack 选择.
