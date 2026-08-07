# Recovery

Recovery 的目标是保存调用证据并避免重复生成. 先 inspect, 再根据已有证据选择唯一合法动作. 不根据 transaction age 自动删除, 抢锁或 retry.

## Inspect

```bash
npm run assetctl -- recover list --library <library-root> --format json
npm run assetctl -- recover inspect --library <library-root> --transaction <transaction-id> --format json
```

## Decision Table

| State                | Meaning                                        | Allowed action                                                 |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `prepared`           | No invocation evidence exists                  | Explicit cancel after exact-target dry run                     |
| `invocation_started` | Tool outcome is incomplete or unknown          | Finalize `interrupted` with `outcomeKnown: false`, then commit |
| `outputs_captured`   | Staged Outputs are intact                      | Inspect, complete or fail from known evidence, then commit     |
| `ready_to_commit`    | Terminal records are complete                  | Idempotent commit only; never invoke the tool again            |
| malformed            | Schema, hash, or references cannot be verified | Move to quarantine after exact-target dry run                  |

## Commands

```bash
npm run assetctl -- recover cancel --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover cancel --library <library-root> --transaction <transaction-id> --confirm
npm run assetctl -- recover finalize-interrupted --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover finalize-interrupted --library <library-root> --transaction <transaction-id> --confirm
npm run assetctl -- recover commit --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover commit --library <library-root> --transaction <transaction-id> --confirm
npm run assetctl -- recover quarantine --library <library-root> --transaction <transaction-id> --dry-run
npm run assetctl -- recover quarantine --library <library-root> --transaction <transaction-id> --confirm
```

每个 mutation 先运行不带 `--confirm` 的 dry run 并核对 `target` 与 `performed: false`, 再以 `--confirm` 执行. `cancel` 仅适用于 `prepared`. `quarantine` 是可恢复 move, 不是 delete. managed staging, quarantine 和 lock 文件仍只能由 `assetctl` 修改.

## Failure Classification

- Tool 明确返回 failure: 通过 fail stdin 归档 `failed`, 然后 commit.
- 调用开始后 Codex 丢失 tool result: 归档 `interrupted`, `outcomeKnown: false`.
- Tool 成功但 output path 不可解析或不可访问: 保持 transaction, 请求权限或显式 recovery; 不声明 success.
- Capture 过程中失败: 不删除已 capture Output, inspect 后继续或 quarantine.
- Commit lock conflict: 有界等待失败后只重试 commit, 不重新生成.
- Marker 已发布但 index refresh 失败: Generation 已 committed, 报告 `index.status: "degraded"`, 保留 atomic `last_indexed_marker`, 后续只执行 incremental catch-up 或显式 full rebuild, 不重复生成.
- Prompt SHA-256 gate mismatch: transaction remains `prepared`; do not mark invocation or call the image tool.
- Multi-provider Variant 的每个 transaction 独立恢复. 一个 Provider 的 failed 或 interrupted 状态不改变同一 Prompt Revision 下其他 Provider Generation 的证据或终态.
- xAI `generation invoke-provider` 在 mark 前的 credential、model 或 Reference capability failure 保持 `prepared`; mark 后的 transport、timeout、truncated 或 invalid success payload conservatively commits `interrupted`.
