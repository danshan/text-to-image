# Prompt Policy

## Effective Prompt

effective prompt 是实际发送给 built-in image generation 的完整文本, 也是不可变 Prompt Revision 的 `prompt.md`. `changeInstruction` 只记录用户要求的变化, 两者不能互相替代.

从以下输入构造 effective prompt:

1. 当前 Prompt Draft.
2. 用户明确给出的 Change Instruction.
3. 每个 Reference Image 的 index, roles 与 guidance.
4. 不改变创作意图的常规质量约束.

可以自动进行结构化, 措辞清理, 光线和构图细化, 以及 `no watermark`, `no unintended text` 等常规约束. 用户明确要求生成时, 这些普通优化不需要重复确认.

## Material Change Gate

若推断会引入用户没有要求的以下变化, 在 prepare 前展示 old/new intent 并等待确认:

- 改变主体身份, 新增角色或关键物体.
- 改变构图目标, 用途或输出媒介.
- 改变整体风格方向.
- 引入品牌, slogan, palette 或叙事设定.
- 把 Reference Image 从一个 role 重新解释为另一个 role.

用户的 Change Instruction 已明确要求某项变化时, 不再把同一变化视为隐式 material change.

## Reference Roles

- `subject`: 主体身份, 外形, 结构或角色特征.
- `style`: 笔触, 材质, 摄影或渲染方式.
- `composition`: 镜头, 视角, 裁切, 主体位置和留白.
- `palette`: 主色, 辅色, 色温和明暗关系.
- `other`: 前四项无法表达的意图, 必须提供 `guidance`.

同一 Image Asset 可以选择多个 roles. roles 是关系上的生成意图, 不是新资产类型, 也不承诺模型完全遵循.

## Reference Scaffolding

在 effective prompt 中按 prepare request 的稳定顺序描述 Reference:

```text
Reference 1
Roles: subject, composition
Guidance: Preserve the silhouette and framing, but ignore the background.
```

Prompt 中不得引用未导入 Asset Library 的本地文件, 也不得凭文件名猜测 Reference role.

## Replay

Replay 使用 source Generation 的 Prompt Revision 文本, Reference relations 和全部已知 tool fields. 新的 Change Instruction 代表分支生成, 不是严格 Replay. Replay 创建新 Generation 并设置 `replayOfGenerationId`; 不承诺像素相同.
