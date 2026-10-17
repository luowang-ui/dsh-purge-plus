<div align="center">

# Purge Community Plus

**让 DSH 插件更容易维护，也更容易恢复。**

DeepSeek Harness 的提示词、规则与技能管理 · 原生右侧面板 · 版本检测 · 本机备份与插件回滚

[![Release](https://img.shields.io/github/v/release/luowang-ui/dsh-purge-plus?label=Community)](https://github.com/luowang-ui/dsh-purge-plus/releases)
[![Checks](https://github.com/luowang-ui/dsh-purge-plus/actions/workflows/community.yml/badge.svg)](https://github.com/luowang-ui/dsh-purge-plus/actions/workflows/community.yml)
[发行与下载](https://github.com/luowang-ui/dsh-purge-plus/releases) · [安装与迁移](#安装与迁移) · [兼容范围](#兼容范围) · [反馈问题](https://github.com/luowang-ui/dsh-purge-plus/issues) · [English](docs/README.en.md)

</div>

这是基于 [kingcharleslzy-ai/dsh-purge](https://github.com/kingcharleslzy-ai/dsh-purge)（社区维护分支）的延续版本，最上游为 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)。**不是任何上游的官方版本**，也不代表上游作者。保留原作者小杨与社区分支作者的署名、MIT 许可证与来源；免费公开，不做付费销售。

## 适配版本（先看这里）

| 项 | 值 |
| --- | --- |
| **适配 DSH Desktop** | **0.2.1-rc.1 / 0.2.1-rc.2**（已逐项验证） |
| **声明的版本下限** | `>=0.2.1-rc.1` —— 写在 `package.json` 根级 `engines.dsh`，DSH 的兼容闸门会读取并在安装/启动时校验 |
| `0.2.0-rc.2` | 提示词注入可用；**宿主补丁锚点未验证**，建议升级后再用 |
| `≤0.2.0-rc.1` | 不支持（上游 `1.1.71` 的 `{{cwd}}` 会每轮抛错导致收不到回复） |
| 平台 | Windows 可用。`npm test` 有 7 个平台相关既有失败（POSIX launcher / backup / boost），与插件逻辑无关 |

### 本版相对 `dsh-purge-community@1.6.0` 修了什么

1. **#119 宿主加载期崩溃**
   `repairOfficialCliAfterUnpack()` 是同步函数，却调用异步 `atomicCopyFile()` 而未 `await`。
   未处理的 rejection 在 Node 24 下升级为 `uncaughtException`，宿主 `fatal load failure` 退出 1，
   Electron 表现为「dsh desktop host stopped」。新增 `atomicCopyFileSync()` 修正，并保证 `.bak`
   先于 `atomicWriteSync` 落地（否则 Restore 拿回的是补丁后字节）。

2. **`toolFilter` 导致红队预设注册失败**
   DSH 0.2.1 的 `dsh-tool-subagent` 对 `persona` / `toolFilter` 直接抛错：
   > tool-subagent: toolFilter is no longer supported; configure persona and tool plugins
   > in an Agent Preset and select it with agentPreset (spawn only)

   两个内置预设（`redteam` / `unrestricted`）都带着旧 deny 名单，因此 `redteam` 停在
   `registered-broken`。已删除该键，叶子节点保障由既有的 `maxDepth: 1` 承担；正确替代方式
   （`agentPreset` / `allowedAgentPresets`）写在配置注释里。


## 这版解决什么

- **一个包，一个入口。** 后端和原生设置面板整合为 `dsh-purge-plus`，从 DSH 右侧进入；没有会话上方按钮或悬浮按钮。旧底部面板由生命周期内的隔离样式持续隐藏。
- **设置接着用。** 内部配置 ID、接口和数据目录保持兼容，迁移不重写现有提示词、规则、技能和其他插件设置。
- **更新来源清楚。** 只读取本仓库的正式 GitHub Releases；安装前校验 SHA256、包名称、版本和仓库身份。不开机静默升级，不按上游分支覆盖本地文件。
- **先备份，再安装。** 升级和插件回滚前生成本机快照，写入互斥、完整性清单和 SHA256 校验。
- **回滚插件，保留现在的内容。** 恢复插件代码及入口，不把你后来改过的提示词、规则或其他插件配置覆盖回旧值。
- **修复新版对话报错。** `cwd` 没有注册时使用静态后缀，避免 `unknown prompt variable "{{cwd}}"`；已有变量和自定义后缀照常处理。见 [修复说明](docs/CWD-COMPAT.md)。

## 兼容范围

| 环境 | 1.2.0 状态 |
| --- | --- |
| macOS · DSH Desktop **0.2.1-rc.1** | 已验证的运行时目标；提示词渲染与社区维护接口 |
| 其他 DSH 版本 / 组件版本不一致 | 不宣称兼容；停止主插件运行时注入，保留维护入口与数据 |
| 上游旧版宿主文件补丁表 | **本版不允许写入或还原**；不会重新应用旧补丁 |
| Windows / Web profile | 尚未完成本版端到端验收 |

这是兼容维护版本，不是“全部旧补丁已适配新版”的承诺。已有磁盘补丁保持原状；社区版不会替你自动清理或重打。模型是否接受某个请求，不能由插件保证。

## 安装与迁移

需要 Node.js 22+、已初始化的 DSH Desktop，以及桌面版自带的 `dsh` CLI。先从 [Releases](https://github.com/luowang-ui/dsh-purge-plus/releases/latest) 下载 `dsh-purge-plus-1.2.0.tgz` 和 `SHA256SUMS.txt`。

**推荐：使用带备份的安装器，首次安装和旧版迁移都走同一路径。** macOS 示例，在下载目录运行：

```sh
shasum -a 256 -c SHA256SUMS.txt
mkdir purge-community-installer
tar -xzf dsh-purge-plus-1.2.0.tgz -C purge-community-installer
PURGE_DSH_CLI="$(command -v dsh)" node \
  purge-community-installer/package/bin/community.js migrate \
  ./dsh-purge-plus-1.2.0.tgz
```

若 `dsh` 未在 PATH 中，`PURGE_DSH_CLI` 填桌面版实际 CLI 文件路径。安装器只管理当前 profile 的 Purge 包与入口，自动备份后将两个旧入口切换成一个社区入口；其他插件的启用状态保留。旧依赖保留在磁盘用于恢复，但不再作为启用的 bundle 加载。

安装成功后，**手动完全退出并重新打开 DSH**，在右侧面板选择 **Purge Community**。不要在运行任务时自动重启应用。更新包包含构建好的界面，无需另装 `dsh-purge-panel`。

> 如果直接执行普通 `dsh plugin add`，不会经过本项目的迁移备份和旧入口切换流程。已有 Purge 的用户请使用上面的安装器。

## 日常使用

| 位置 | 用途 |
| --- | --- |
| 状态 → 版本与恢复 | 查看插件/宿主版本、兼容结论，手动检查并安装本 fork 的发行包 |
| 状态 → 本机备份 | 立即备份、选择快照、回滚插件；完成后手动重启 |
| 提示词 | 查看、编辑并保存现有提示词；未点保存不会自动落盘 |
| 规则 | 沿用原规则集与工作区策略 |
| 技能 | 管理 DSH 官方技能目录，保留原有技能文件 |

备份位于 `$DSH_HOME/dsh-purge-plus/backups/`，默认 `$DSH_HOME` 为 `~/.dsh`，使用私有目录权限。快照含 Purge 包、profile 配置/清单/锁文件、Purge 状态、提示词和规则；**不额外扫描独立凭证文件、会话、图库或模型**。profile 配置本身可能含密钥等私人信息，请勿将备份上传到公开 issue。

“回滚插件”不会自动还原快照内的用户配置。需要取回旧提示词或规则时，可从快照 `settings/` 中按文件人工恢复；这样避免一次回滚误伤后来新增的内容。详见 [维护与恢复](docs/MAINTENANCE.md)。

## 开发与验证

```sh
npm --prefix packages/purge-panel ci --ignore-scripts --legacy-peer-deps
npm run build:client
npm test
npm run test:ui
npm --prefix packages/purge-panel test
npm run check:client
npm pack --ignore-scripts
```

真实宿主渲染回归另需指定 DSH 自带模块路径：

```sh
node test/cwd-compat.mjs /absolute/path/to/dsh-system-prompt/lib/index.js
```

源代码在 `lib/`，界面源代码在 `packages/purge-panel/src/`；根目录 `client.js` 是生成文件。`packages/purge-panel` 保留为界面源码/回归测试工程，不再需要作为单独插件安装。

## 来源与维护边界

原项目：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)，原作者 **小杨**。本分支保留 Git 历史和 MIT [LICENSE](LICENSE)，第三方来源见 [NOTICE](NOTICE.md)。上游原说明保存在 [docs/upstream](docs/upstream/README.zh-CN.md)。

社区版的名称、安装包、发布与更新源由本仓库独立管理。问题请提交到[本仓库 Issues](https://github.com/luowang-ui/dsh-purge-plus/issues)，附 DSH/插件版本、复现步骤和去掉敏感内容的日志；不需要提交个人提示词或完整备份。
