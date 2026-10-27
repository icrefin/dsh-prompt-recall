# Contributing to icrefin/dsh-prompt-recall

Thanks for taking the time to contribute. This document covers the repository
**dsh-prompt-recall** owned by `icrefin`.

## Ways to contribute

- Report a bug using the *Bug report* issue form.
- Request a feature using the *Feature request* issue form.
- Improve documentation, examples, or translations.
- Send a pull request that fixes or implements something on the issue tracker.

If you plan a large change, open an issue first so we can agree on the design
before you write the implementation.

## Before you start

1. Search existing issues and pull requests to avoid duplicates.
2. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
3. Check the README for supported versions and prerequisites.

## Development setup

This is a TypeScript package built with pnpm. It needs **Node `>=22.17.0`** and
**pnpm 11.8.0**, the version pinned in the manifest through `packageManager`
(`corepack enable` picks it up). The `@deepseek-ai/dsh-*` peer dependencies are
published on npm, so a clean checkout really does install.

```bash
git clone https://github.com/icrefin/dsh-prompt-recall.git
cd dsh-prompt-recall
git switch main

corepack enable
pnpm install
pnpm check          # typecheck both halves · build the bundle · vitest
```

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc` over the host half, then separately over the browser half |
| `pnpm test` | `vitest run` — the pure rules, the DOM anchor, the gesture ordering, the manifest mirror |
| `pnpm build` | the host JS plus the single browser bundle (`lib/client.js`) |
| `pnpm check` | `typecheck && build && test` — run this before opening a pull request |
| `pnpm pack` | build, then `dist/dsh-prompt-recall-<version>.tgz` |

`test/` is the contract that matters, and it is where a behavior change belongs:

| Spec | Pins |
| --- | --- |
| `test/window.spec.ts` | which prompt counts as "the last one", and the boundary the rewind cuts at |
| `test/recall.spec.ts` | the order of the gesture, and that a rejected stop does not block the rewind |
| `test/anchor.spec.ts` | the three DOM selectors the button is placed through, and the fail-soft path |
| `test/styles.spec.ts` | the fallback action-button rules, including the "no literal colours" rule |
| `test/host.spec.ts` | the Loader contract, and that `src/version.ts` matches `package.json` |

The gesture also has a real-browser driver. `tools/e2e-recall.mjs` walks the whole
thing against an **isolated** DSH home (`.dev-home/`), never the profile the app is
using; the README's *Development* section has the seeding sequence:

```bash
scripts/dev-profile.sh boot 19498
node tools/e2e-recall.mjs "<printed url>" "<session title>" "<prompt prefix>"
scripts/dev-profile.sh remove
```

Run the suite plus that driver when you touch the gesture, the placement, or the
composer hand-off. A change that cannot be exercised in the browser is still
reviewable — say which path it covers and which it does not.

## Branch and commit conventions

- Branch from `main`; keep one topic per branch (`fix/...`, `feat/...`, `docs/...`).
- Keep commits small and focused.
- Write imperative, scoped commit messages, e.g. `fix(parser): reject empty input`.
- Rebase onto the latest `main` before requesting review; avoid merge commits inside the PR branch.

## Pull requests

Every pull request must:

- Explain **what** changed and **why**.
- Link the issue it closes (`Closes #123`).
- Pass CI.
- Update documentation whenever user-facing text or behavior changes — including both
  language halves of a bilingual README.
- Contain no secrets, tokens, private keys, internal hostnames, or personal data.
- State the license of any newly added dependency and confirm it is compatible with
  this project's `MIT` license.

Use the repository's pull request template. Do not delete checklist items without
explaining why.

## Reporting bugs

A useful bug report contains:

- The version, commit SHA, or release tag you tested.
- Operating system and runtime version.
- Exact reproduction steps, expected result, and actual result.
- Logs with secrets and personal data removed.

Report security vulnerabilities privately — see [SECURITY.md](SECURITY.md). Never open
a public issue for a vulnerability.

## Coding style

- Match the style of the surrounding code; do not reformat unrelated files.
- Add or update tests for behavior changes.
- Keep public APIs documented.
- Prefer clear names over comments that restate the code.
- Do not add a dependency for something the standard library already does.

## Review process

Maintainers review pull requests as time allows. Expect at least one round of
feedback. Address comments with follow-up commits or a rebase, then re-request review.
A pull request inactive for 60 days without response may be closed.

## License

By contributing, you agree that your contributions are licensed under the `MIT`
license of this repository. Do not paste code you cannot license under these terms.

## Questions

Open a discussion, or email the maintainer at `icrefinai@gmail.com`.

---

# 为 icrefin/dsh-prompt-recall 贡献

感谢你抽出时间参与贡献。本文适用于 `icrefin` 名下的仓库 **dsh-prompt-recall**。

## 贡献方式

- 用 *Bug report* 表单报告问题。
- 用 *Feature request* 表单提出需求。
- 改进文档、示例或翻译。
- 提交 pull request，修复或实现 issue 中的事项。

如果改动较大，请先开 issue 讨论设计，以免实现在错误的方向上白费功夫。

## 开始之前

1. 先搜索已有的 issue 和 pull request，避免重复。
2. 阅读[行为准则](CODE_OF_CONDUCT.md)。
3. 查看 README 中说明的支持版本与前置条件。

## 开发环境

本项目是用 pnpm 构建的 TypeScript 包，需要 **Node `>=22.17.0`** 与 **pnpm 11.8.0**
（`packageManager` 中锁定，`corepack enable` 即会采用）。`@deepseek-ai/dsh-*` 的 peer
依赖都已发布在 npm 上，因此全新 checkout 真的可以安装。

```bash
git clone https://github.com/icrefin/dsh-prompt-recall.git
cd dsh-prompt-recall
git switch main

corepack enable
pnpm install
pnpm check          # 两个半边 typecheck · 构建 bundle · vitest
```

| 命令 | 做什么 |
| --- | --- |
| `pnpm typecheck` | 先对宿主半边、再单独对浏览器半边跑 `tsc` |
| `pnpm test` | `vitest run` —— 纯规则、DOM 锚点、动作顺序、清单镜像 |
| `pnpm build` | 宿主 JS 与唯一的浏览器 bundle（`lib/client.js`） |
| `pnpm check` | `typecheck && build && test` —— 提 PR 前请跑这个 |
| `pnpm pack` | 先构建，再产出 `dist/dsh-prompt-recall-<version>.tgz` |

`test/` 是真正要守的契约，行为变更就应该落在这里：

| 测试文件 | 固定了什么 |
| --- | --- |
| `test/window.spec.ts` | 哪一条算「最后一条提示词」，以及回退切在哪里 |
| `test/recall.spec.ts` | 动作顺序，以及「停止失败不阻塞回退」 |
| `test/anchor.spec.ts` | 按钮依赖的三个 DOM 选择器，以及软失败路径 |
| `test/styles.spec.ts` | 兜底的动作按钮样式，含「不含字面颜色」契约 |
| `test/host.spec.ts` | Loader 契约，以及 `src/version.ts` 与 `package.json` 一致 |

整套动作另有真实浏览器驱动：`tools/e2e-recall.mjs` 在**隔离**的 DSH home
（`.dev-home/`）里走完整条链，绝不动应用正在使用的 profile；种入顺序见 README 的
「开发」一节：

```bash
scripts/dev-profile.sh boot 19498
node tools/e2e-recall.mjs "<打印出的 url>" "<会话标题>" "<提示词前缀>"
scripts/dev-profile.sh remove
```

改动动作、定位或输入框交接时，请把测试与这个驱动都跑一遍。难以在浏览器里复现的改动
同样可以评审 —— 只要说明它覆盖了哪条路径、没覆盖哪条。

## 分支与提交规范

- 从 `main` 拉分支，一个分支只做一件事（`fix/...`、`feat/...`、`docs/...`）。
- 提交粒度尽量小。
- 提交信息用祈使句并带范围，例如 `fix(parser): reject empty input`。
- 请求评审前先 rebase 到最新的 `main`；PR 分支内避免合并提交。

## Pull request 要求

每个 pull request 必须：

- 说明改了**什么**、**为什么**改。
- 关联对应 issue（`Closes #123`）。
- 通过 CI。
- 当用户可见文案或行为变化时更新文档，包括双语 README 的两种语言部分。
- 不含任何密钥、令牌、私钥、内网主机名或个人数据。
- 说明新增依赖的许可证，并确认与本项目的 `MIT` 许可证兼容。

请使用仓库的 pull request 模板；不要在没有说明理由的情况下删除检查项。

## 报告 bug

一份有效的 bug 报告应包含：

- 你测试的版本号、commit SHA 或发布标签。
- 操作系统与运行时版本。
- 精确的复现步骤、期望结果与实际结果。
- 去除密钥与个人信息后的日志。

安全漏洞请私下报告，见 [SECURITY.md](SECURITY.md)。切勿为漏洞开公开 issue。

## 代码风格

- 与周边代码风格保持一致；不要顺手重排无关文件。
- 行为变更需要新增或更新测试。
- 公开 API 必须有文档。
- 命名要清晰，避免复述代码的注释。
- 标准库已能实现的功能，不要新增依赖。

## 评审流程

维护者会在时间允许时评审 pull request，通常至少有一轮反馈。请通过后续提交响应意见，
或推送 rebase 后重新请求评审。超过 60 天无回应的 pull request 可能被关闭。

## 许可证

参与贡献即表示你同意自己的贡献按本仓库的 `MIT` 许可证授权。
请勿粘贴你无权按此条款授权的代码。

## 疑问

请开 discussion，或发邮件到 `icrefinai@gmail.com`（占位符，请替换为你自己的地址）。