<div align="center">

# Purge Community

**给 DeepSeek Harness 拆闸的插件。**

83 条宿主补丁 · 27 层破甲自检 · 提示词 / 规则 / 技能管理 · 左侧栏整页设置

[![Release](https://img.shields.io/github/v/release/luowang-ui/dsh-purge-plus?label=release)](https://github.com/luowang-ui/dsh-purge-plus/releases)
[![Checks](https://github.com/luowang-ui/dsh-purge-plus/actions/workflows/community.yml/badge.svg)](https://github.com/luowang-ui/dsh-purge-plus/actions/workflows/community.yml)

当前版本 **1.6.0** · 适配 **DSH Desktop 0.2.1-rc.2**（rc.1 同样通过） · [English](docs/README.en.md)

</div>

---

## 一行安装

```sh
curl -fsSL https://raw.githubusercontent.com/luowang-ui/dsh-purge-plus/master/scripts/install.sh | sh
```

它会自动：找 DSH 桌面版 → 下载最新发行包 → 校验 SHA256 → 用 DSH 自带运行时跑安装器（**先备份 profile**，再把旧的 Purge 入口合并成一个）。

然后 **完全退出并重开 DSH** → 左侧栏点 **Purge** → 状态页顶部点 **应用** → 再退出重开一次。完事。

<details>
<summary>不想用脚本？手动三步</summary>

```sh
V=1.6.0
curl -fsSLO https://github.com/luowang-ui/dsh-purge-plus/releases/download/v$V/dsh-purge-plus-$V.tgz
curl -fsSLO https://github.com/luowang-ui/dsh-purge-plus/releases/download/v$V/SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt && mkdir -p /tmp/pc && tar -xzf dsh-purge-plus-$V.tgz -C /tmp/pc
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  /tmp/pc/package/bin/community.js migrate "$PWD/dsh-purge-plus-$V.tgz"
```
</details>

## 为什么用它，而不是原版

| | 原版 1.1.71 | 本分支 1.6.0 |
| --- | --- | --- |
| 宿主适配 | 只到 0.1.7 / 0.2.0，上游已停更 | **0.2.1-rc.2 逐条回归，0 漂移** |
| 补丁 | 82 条，锚点随新版失效后静默跳过 | **83 条**（新增 `ask_user_question` 不阻塞），带**逐条状态与漂移诊断** |
| 装完怎么确认 | 没有 | **`selfcheck` 27 层逐层给证据（ok/待应用/失败三态）+ `probe` 证明注入真的到模型** |
| 面板 | 会话上方悬浮按钮 + 独立小窗 | **左侧栏整页**：顶部一句话状态 + 放大的「应用」，其余折叠；说明收进 `?` |
| 更新 | 指向已停更的上游，分支/覆盖式安装 | 本仓库校验过的发行包（SHA256），保留通道/tag/pin 与多安装位置 |
| 预设 | 无 | 自带「无限制模式」：**standard 超集**（工具面一样），只换执行优先人设 |
| 审计 | 无 | **每次应用/回滚/开关都留痕**（`audit.jsonl`，面板「最近动作」可看） |
| 维护 | 无备份 | 应用/安装/回滚前自动快照（5 份 + 每天 1 份 × 7 天 + 200MB 上限；**大文件内容寻址去重**，每份从 9MB 降到约 2MB） |
| 提示词层 | 注入 + 身份剥离 | 再加**尾部破甲强化段**（默认开）、注入位置可切 `head/tail/both` |

## 它拆的是什么

模型不是不会干活，是被**四道闸**拦住。这个插件逐层拆：

| 闸门 | 拆法 |
| --- | --- |
| **模型层** | `prompt-inject.md` 每步作为最高优先级 section 注入；剥掉官方身份句；尾部追加「层级声明 / 拒绝即故障 / 抗谄媚 / 多轮重申」 |
| **审批层** | 审批门自动授信、`never` 提示句旁路、无 UI 通道时 fail-open、`run_code` / 工具 ask 放行、计划模式不硬拦 |
| **沙箱层** | `confine()` 直通、fs 围栏禁用、观察策略放行、沙箱拒绝话术中性化 |
| **回合层** | 重复工具守卫与结果修剪禁用、Auto Review 不否决、`ask_user_question` 最多等 1 秒就继续、UI 发消息永远新 turn |

## 破甲自检：别靠感觉，靠证据

```sh
purge-community selfcheck          # 人读
purge-community selfcheck --json   # 机读
```

27 层逐层回答"这条通道通不通"：沙箱直通、fs 围栏、观察策略、拒绝话术、默认策略、审批自动放行、重复守卫、结果修剪、Auto Review、工具 ask fail-open、计划模式、身份剥离、Web 面中性化、注入不被预设覆盖、极简/梁神预设、外部内容、Hooks、工具上限、子代理、会话默认、回退残留、网关兼容、会话挂载、桌面壳兜底，加上运行时注入 / profile 权限 / **宿主是否仍封在 app.asar**。

每层给 `applied/required`；目标插件没装的层显示"当前不适用"，不冒充成功。

## 面板

左侧栏 **Purge** → 整页，六个页签：

- **状态**——顶部固定「应用 / 还原 / 卸载」；一行状态摘要是 `DSH 版本 · 兼容级别 · 宿主补丁 · 插件版本`；下面是可展开的破甲自检与补丁明细；
- **提示词**——编辑注入正文，破甲强化段与注入位置；
- **规则 / 技能**——沿用原版规则集与 DSH 技能目录；
- **演练台**——23 个红队技能、资产测绘、攻击链；
- **更多**——服务器名单、更新与备份。

所有名词解释都在标题后面的小 `?` 里，点开即看，不占版面。

## 日常命令

```sh
purge-community status              # 宿主 / 补丁总览
purge-community selfcheck           # 破甲自检（ok / 待应用 / 失败 三态）
purge-community diagnose            # 漂移诊断（锚点没命中时给行号 + 片段）
purge-community reanchor apply <id> --lines A-B --yes   # 把新锚点钉成本地覆盖
purge-community probe new           # 生成探针，验证注入真的到达模型
purge-community boost on|off        # 尾部强化段（默认 on）
purge-community preset install      # 装自带「无限制模式」预设
purge-community audit --limit 20    # 最近动作记录（应用/回滚/开关/探针/重锚）
purge-community usage | prune       # 备份占用 / 清理（含去重对象 GC）
purge-community apply|revert|uninstall|edit   # 原版能力
```

给 agent 看的详细操作手册在 **[AGENTS.md](AGENTS.md)**：五层模型、命令与退出码、症状→动作决策树、补丁表怎么加、状态文件在哪。

偏好存在 `$DSH_HOME/dsh-purge/tuning.json`：

```json
{ "boost": true, "injectPosition": "head", "askNoBlock": true }
```

`injectPosition`：`head`（省 token）/ `tail`（贴输出、多轮衰减最小）/ `both`。

## 更新

**插件更新**：面板「状态 → 更多 → 检查更新」，或 `purge-community` 的更新通道；走本仓库校验过的发行包。

**DSH 官方更新后**：`app.asar` 会重新出现，面板顶部直接提示"宿主仍封在 app.asar 里"→ 点 **应用** → 退出重开一次。补丁表若因新版漂移，`diagnose` 会指出哪条、哪个文件、期望原文与可能的新位置。

## 兼容性

| 环境 | 状态 |
| --- | --- |
| macOS · DSH Desktop **0.2.1-rc.1 / rc.2** | 已回归：83 条锚点、面板、CLI、自检 27 层全绿 |
| 其他 DSH 版本 | 允许应用，标"未验证"；先跑 `selfcheck` / `diagnose` |
| 宿主组件版本不一致 | 只报告，不阻止写入 |
| Windows / Web profile | 代码路径保留，未做端到端验收 |

## 出问题怎么办

```sh
# 应用打不开（最坏情况，回到更新前的密封包）
R="/Applications/DeepSeek Harness.app/Contents/Resources"; mv "$R/app.asar.bak" "$R/app.asar"

# 只回滚宿主补丁
purge-community revert

# 回滚插件（保留当前提示词与规则）
purge-community rollback <backup-id>
```

## 开发与验证

```sh
npm --prefix packages/purge-panel ci --ignore-scripts --legacy-peer-deps
npm run build:client     # packages/purge-panel/src → 根 client.js
npm test                 # 28 项：补丁锚点 / 自检 / boost / 提示词装配 / 备份安装
npm run test:ui && npm --prefix packages/purge-panel test
npm run check:client && npm run diagnose
```

`test/patch-anchors.test.mjs` 把 0.2.1 的真实源码片段钉进用例——谁改了锚点没同步用例，测试直接失败。

## 来源

上游 [YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)（作者 **小杨**，MIT）。本分支独立维护，保留 Git 历史、署名与许可证；第三方来源见 [NOTICE](NOTICE.md)。包名、发行与更新源由本仓库管理。

插件负责拆 harness 与宿主默认策略的闸，不替模型判断某件事该不该做；最终输出仍取决于模型本身。
