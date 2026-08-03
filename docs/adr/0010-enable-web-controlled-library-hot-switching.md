# 允许 Web 控制 Asset Library 热切换

本地 Server 在 Settings 和 Library Unavailable 状态下显示 resolved absolute Library path, 并允许用户输入目标路径后初始化、选择、重试和热切换 Server 账号可访问的 Library. Server 不提供通用 filesystem directory listing 或文件读取 endpoint; 初始化仍拒绝 non-empty unknown target, path 必须 canonicalize, symlink 不得形成不受控遍历.

Server 始终只发布一个 active Library context. Library 消失时在请求边界进入统一的 `LIBRARY_UNAVAILABLE` 状态, 不把事实来源缺失误判为 Archive corruption 或 Index failure. Existing Library 的 validation 与 Index rebuild 在切换临界区外完成; candidate ready 后, Server 排空旧请求、重新核对 candidate、原子持久化选择并替换 runtime context, 随后轮换 session token. 同时只允许一个带 monotonic progress 的内存态 transition. 外部恢复原路径后必须显式 Retry, 不自动打开可能仍在复制的 Library.

该决定拒绝 CLI 操作后重启、通用 directory browser、双 context 交接和自动删除初始化结果. Web 热切换缩短恢复路径并让 Library management 成为完整产品能力, 代价是 local service 获得高权限初始化入口, 且必须维护严格的请求隔离和原子切换边界. 如果初始化已经成功而后续持久化或切换失败, 新 Library 保留在原路径, active context 与旧持久化选择保持不变.
