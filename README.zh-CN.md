# dsh-prompt-recall

**把最后一条提示词收回来。** 你最新发出的提示词下面会多一个图标，与 *复制* 同一行，用同一套动作按钮样式绘制。点击它会停止正在执行的回合、把会话回退到这条提示词之前，并把文本放回输入框，供你修改后重新发送。

[English](README.md) | **简体中文**

[![License](https://img.shields.io/github/license/icrefin/dsh-prompt-recall?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-prompt-recall?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/releases/tag/v0.1.2)
[![CI](https://img.shields.io/github/actions/workflow/status/icrefin/dsh-prompt-recall/ci.yml?branch=main&style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-prompt-recall?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-prompt-recall?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/icrefin/dsh-prompt-recall/pulls)
[![Node](https://img.shields.io/badge/node-%3E%3D22.17-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.3-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

## 它解决的场景

提示词已经发出，答案进行到一半你才发现措辞不对。此前只有两个选择：等它答完再补一句修正，或者停掉再从头把提示词敲一遍。撤回是第三种。

```
                                          撤回前  ⇢  点击一次之后
   ┌───────────────────────────────────┐   ┌────────────────────────────────────┐
   │ ▸ 你                               │   │ ▸ 你                               │
   │   总结一下 relay/README.md 里的     │   │   （上一回合，未受影响）            │
   │   重试逻辑并提一个 PR               │   │                                    │
   │                          09:26 ⧉ ↻ │   ├────────────────────────────────────┤
   ├───────────────────────────────────┤   │ ✎ 用三条要点重新总结重试策略         │
   │ ▸ 深度思考中…（仍在执行）           │   │                              ↑     │
   │                                    │   │                        光标在此，可直接重发
   └───────────────────────────────────┘   └────────────────────────────────────┘
            09:26 = 时间   ⧉ = 复制   ↻ = 撤回
```

## 它贡献了什么

| 位置 | 作用 |
|---|---|
| 最新提示词的动作行 | 在自带的 *复制* 按钮旁新增一个图标按钮，并沿用该按钮自己的 class 样式 |
| 语言命名空间 `dsh-prompt-recall` | 提示气泡、执行中状态与三条失败提示的中英文文案 |
| `conversation.input.right` | 承载控制器：它拥有该按钮，并把撤回的文本注入输入框——自身不渲染可见控件 |

没有宿主路由、没有宿主服务、没有 Config。宿主半边（`exports["."]`）只为让 Loader 行能够携带浏览器半边（`exports["./client"]`）。

## 一次点击做了什么

```
on(recall)
  stop     取消该会话作用域内的 conversation.cancel()          # 与「停止」按钮同一操作
  plan     从事件窗口读取提示词文本与 seq
  rewind   sessions.fork({ sessionId, atSeq: boundary })      # 与「分支」按钮同一操作
  stage    把文本交给子会话的输入框
  open     跳转到子会话
  retire   把发起撤回的那个会话归档                            # 与 ⌘⇧A 同一操作
```

1. **停止。** 在会话自身的作用域内取消进行中的回合，与输入框的「停止」按钮完全一致。此处的失败会被吞掉——空闲会话本就无可取消，而这不应阻塞回退。
2. **回退。** 会话从自身日志中的一段精确前缀继续。
3. **还原。** 撤回的文本被暂存给子会话的输入框，在其挂载时写入，随后把光标交还给它。

## 为什么是在一个新会话里继续

会话日志是只追加的持久记录，且运行中的 Agent 持有它。平台没有「删除最后一轮」的操作，而在 Agent 运行期间改写日志会破坏会话。平台对「从更早的位置继续」给出的答案就是 `session/fork`——把一段精确的事件前缀复制进新会话——这正是自带的 **分支** 按钮所做的事。

撤回是同一个操作，只是切点不同：

| | 切点 | 结果 |
|---|---|---|
| 分支（自带） | 你选择的那一轮结束处 | 复制全部内容，换一种方式继续 |
| 撤回（本插件） | 该提示词入队之前 | 一段不包含该提示词的历史 |

子会话保留工作目录、Agent 预设与所属工作区，标题会递增，侧边栏因此不会出现两行难以分辨的记录。

撤回可以重复：每撤回一次就再往前切一条提示词，并归档它来自的那个会话，因此一条回退链上永远只有一个可见会话。

## 旧会话会怎样：归档，而不是删除

只做 fork 会让同一段对话同时存在两份，所以撤回会把它来自的那个会话**退休**掉——而平台为此提供的操作是**归档**。DSH 里根本不存在「删除会话」：`archiveSession` / `unarchiveSession` 就是全部词汇（会话索引里的 `_deleteSession` 只是搜索缓存的维护，`workspaces.delete` 删的是*工作区*）。这恰好适合这个动作：

- **日志原封不动**——被撤回的提示词仍在那个会话里，什么都没丢，`unarchiveSession` 会让它回到列表中原有的位置；
- **它让「撤回」更彻底**——provider 的 `agent/pre-step` 唤醒闸门读的正是这份持久归档集合，所以被退休的会话无法被唤醒、把你刚收回的提示词再跑一遍；
- **它写的就是自带 ⌘⇧A 快捷键所写的同一份持久状态**，并带 `stopActivity`——当会话还有活在跑时，DSH 自己的确认弹窗提供的就是这个升级选项，而撤回已经替你决定了。

**想拿回来：** 侧边栏的视图选项可以按归档状态过滤（`default` / `show` / `only`），而会话搜索结果里每条已归档会话都带一个「取消归档」按钮。不需要改文件，也不需要重启。

如果归档失败（最常见的原因是注册表还不认识这个会话），撤回已经完成的部分全部保留，并在新会话里提示「上一个会话未能归档——它仍然在侧边栏里」，而不是把整个动作丢掉。

**子会话（subagent）中不提供撤回**：它的记录是父会话的证据而不是一段对话，fork 它会用一个子代理前缀造出一个普通会话，归档它则会把它从父会话的目录里移除。

## 按钮放在哪里，以及为什么用 DOM 定位

Chat 视图没有为*用户*消息的动作行提供 slot。`conversation.chat.assistant-actions` 与 `conversation.chat.turnTail` 都只在回合**结束**后渲染，而 Agent 仍在工作时两者都不存在——那恰恰是撤回按钮必须可点的时刻。若改为覆盖 `conversation.chat.node` 中 `user` 这一 keyed 条目，就必须重新实现自带的用户气泡、引用 chip、附件与样式表，并在每次 Harness 更新时随之漂移。

因此控制器改用这些行自身样式表所使用的同一套公开 DOM 约定来定位，并限定在包含自己输入框的那个 Conversation 实例内：

| 选择器 | 含义 |
|---|---|
| `[data-conversation-content]` | 一个 Conversation 实例，带 `data-conversation-session` 标记 |
| `[data-chat-flow-kind="user"]` | 一条用户（或插话）消息的流式条目 |
| `[data-clock="start"]` | 动作行本身——复制按钮所在处 |

它取**最新可见**的那条用户行，因此按钮会跟着会话走。它还从相邻的 *复制* 按钮上复制实时的 `class` 属性，这正是它此刻与将来都与之一模一样的原因：给复制按钮定样式的那条规则，同样给撤回按钮定样式。插件自带的样式表只是兜底，仅在无法复制到相邻 class 时生效（`:not([class])`）。

定位通过 `MutationObserver` 反复求值，而不是在渲染期读取——因为那一行由另一棵 React 树渲染，两棵树的提交顺序没有约定。按钮本身是一个 React portal，因此住在对话流 DOM 里的同时，仍保留 React 的生命周期、气泡提示与事件处理。

## 如何读出提示词与切点

两个事实都来自会话绑定自身的事件窗口（`SessionBinding.eventSource`）——即 Chat 视图组装对话所用的同一个连续、经会话授权的数据源。因此撤回的文本是**发送时的原文**，而不是它的展示投影。

```
on(plan)
  prompt   = 最新的 user/message，且 source.kind 为 "user"、surfaceOp 为 append
  boundary = 把该 prompt 放入 Inbox 的那条 splice 事件之前的那一个事件
             （找不到时回退到所属的 turn/start）
  if boundary < 0
    boundary = none      # 该提示词是这个会话的第一个事件
```

**切点不是 `seq - 1`。** 提示词是经由 Inbox 送达 Agent 的：输入框把它 splice 进去，而「认领」它的移除事件在更后面。若切在 `promptSeq - 1`，前缀里折叠后的 Inbox 仍会把它当作待处理工作——子会话会把它当成排队消息带着，恢复后的 Agent 甚至可能再跑一次。切在那条 splice 之前，才是让这条提示词彻底消失所需要排除的最后一个事件。

`source.kind === "user"` 同时定义了「最新提示词」是*你的*最新提示词：宿主也会为工作区说明、运行时上下文、审批与 Inbox 通知写入 `user/message` 事件，而它们都不是用户可以撤回的东西。

## 会还原什么，不会还原什么

| | |
|---|---|
| ✅ 提示词文本 | 与发送时完全一致，包括 `/命令` 与 `@引用` 的发送形态 |
| ❌ 附件 | 提示词上的图片或文件不会被重新挂载；文本会还原，文件需要重新选择 |
| ❌ 更早的回合 | 完全不动——撤回移动的是对话的*末尾*，而不是开头 |

撤回文本只会写入**空的**输入框。若在交接途中你已经开始输入，以你的输入为准，插件会提示「撤回的提示词无法放回输入框」，而不是把它覆盖掉。

## 当没有可回退的位置时

如果你要撤回的提示词恰好是该会话的第一个事件，就不存在可 fork 的前缀。此时撤回会在同一工作目录下用一个**全新的空白会话**继续对话——效果相同，只是离原会话又远了一步——而不是拒绝这次操作。

## 文件结构

```
src/
├── index.ts                 # 宿主半边：Loader 行的空实现入口
├── version.ts               # 本包对外汇报的唯一版本串
└── client/
    ├── index.tsx            # 注册：词典、样式、控制器条目
    ├── window.ts            # 提示词与切点规则（纯函数）
    ├── recall.ts            # 撤回动作，针对各 port 表达（纯函数）
    ├── RecallAction.tsx     # 控制器组件：portal 按钮 + 草稿注入
    ├── anchor.ts            # 按钮所依赖的 DOM 约定
    ├── staging.ts           # 撤回文本在两个会话之间的短暂停留
    ├── locales.ts           # en / zh 词典
    ├── styles.ts            # 兜底的动作按钮样式
    └── primitives.d.ts      # 本插件用到的那两个引导期静态模块成员
test/                        # 切点规则、动作顺序、DOM 定位、清单一致性
tools/
├── e2e-recall.mjs           # 通过 CDP 驱动真实 Chromium 走完整套动作
└── seed-dev-home.mjs        # 用一条真实会话种入隔离的开发 profile
```

`window.ts` 与 `recall.ts` 是纯函数，承载全部值得推敲的规则；组件只负责把它们接到一行 DOM 与一个输入框上。

## 安装

桌面 profile 由 Electron 应用持有，请通过 **设置 → 插件**（或 `plugin_manager` 工具）安装，路径为：

```
dsh-prompt-recall/dist/dsh-prompt-recall-0.1.2.tgz
```

```sh
scripts/install.sh                 # 打包并打印上面的路径
scripts/install.sh --profile tui   # 打包并安装到 CLI 管理的 profile
```

然后**重启应用**：在运行中的 profile 里新增的 bundle，在该进程内要等到下次启动才会被导入。

## 开发

```sh
pnpm install
pnpm check          # 两端类型检查 · 构建 bundle · 跑测试
```

如果想在不影响桌面应用所用 profile 的前提下实测：

```sh
scripts/dev-profile.sh boot 19498            # 在 .dev-home/ 下建立隔离的 DSH home
node tools/seed-dev-home.mjs \
  ~/.dsh/sessions/<store>/<session> /path/to/workspace   # 需要先停掉宿主
scripts/dev-profile.sh boot 19498            # 用种入的样例重启
node tools/e2e-recall.mjs "<打印出的 url>" "<会话标题>" "<提示词前缀>"
scripts/dev-profile.sh remove
```

端到端驱动会在无头 Chromium 中断言整套动作：按钮出现在最新提示词的自带动作行内、带有自带的 action class、点击后会话在新会话中继续、被撤回的提示词离开对话流、其文本回到输入框，并且被退休的会话确实进入了宿主的持久归档集合（直接读开发 home 的注册表——这是注册表写入，不是渲染结果）。任何页面异常或 `console.error` 都会让本次运行失败，因此会抛错的客户端插件无法蒙混过关。

样例会话处于空闲状态（隔离的开发 home 没有模型凭据，无法真正起一轮对话），因此还有一条路径由测试而非浏览器运行覆盖：**Agent 正在执行时撤回**——「先停止」以及「停止失败不阻塞回退」由 `test/recall.spec.ts` 固定。

## 已知限制

- **撤回不等于撤销模型的工作。** 已经跑过工具的回合，其副作用仍留在原地；回退移除的是对话里的这条提示词，而不是文件系统在这期间发生的变化。
- **子会话是真实会话。** 它会出现在侧边栏并计入会话列表，与分支完全一样。
- **被退休的会话是归档而非删除**——它留在磁盘上，只是离开默认侧边栏列表，取消归档即可回来。若你更希望保留撤回前的会话，动作结束后取消归档即可；DSH 里没有「删除会话」可以替代。
- **定位约定是 DSH 的 DOM。** 若未来 Harness 重命名 `data-chat-flow-kind`、`data-clock` 或动作按钮的 class，按钮会消失（软失败——不崩溃、不破坏那一行）。这三个选择器集中声明在 `anchor.ts`，并配有测试。
- **附件不会还原**——见上表。

## 参与贡献

欢迎提 issue 与 pull request —— bug 表单会问到「断在哪一步」，通常已足够复现。命令与每个
测试文件固定了什么，见 [CONTRIBUTING.md](.github/CONTRIBUTING.md)；安全漏洞请走
[SECURITY.md](.github/SECURITY.md)，不要开公开 issue。本项目遵循
[贡献者公约](.github/CODE_OF_CONDUCT.md)。

> 如果这个按钮替你省下重打一条提示词，点一颗 ⭐ 能让更多 DSH 用户找到它。

## 许可

MIT — 见 [LICENSE](LICENSE)。