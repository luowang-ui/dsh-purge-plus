# 1.6.0

> 1.6.0 = 动作审计日志 + 发行包 smoke test（进 CI）+ 一轮全项目体检修复。

- **审计日志**：`apply` / `revert` / `boost` / `probe` / `preset` / `reanchor` 每次动作写一条 JSONL（`audit.jsonl`，1MB 轮转保留 2 份）；`purge-community audit` 或面板「维护 → 最近动作」可读。apply 记录含快照 id、宿主版本、成功/已应用/失败计数与失败补丁号。
- **发行包 smoke test**：`npm run smoke` 从 tgz 解包后验证——8 个导出目标存在、核心模块可导入、自带预设能解析成 20 行定义、`cordis.patch.yml` 条目完整、CLI 在空目录可运行、无宿主时 selfcheck 安全降级为 broken。已接进 community/release 两条 workflow。
- **体检修复**：`anchors.js` 不再 import core（消除循环依赖）；重锚缓存改为显式变量；`--index` 缺值、`audit --limit` 非法值都有保护；过期探针文件自动清理；预设注册遇到「重复/非法」不再无效重试 40 次。

宿主升级把锚点改坏时，`diagnose` 现在给的不只是行号：`reanchor apply <id> --lines A-B` 会把当前宿主里的真实片段取出来做候选（校验唯一性、先 dry-run 预览），加 `--yes` 后写成 `~/.dsh/dsh-purge/anchor-overrides.json` 里的本地覆盖；补丁引擎按索引套用，`reanchor clear <id>` 即可撤销。覆盖随宿主版本记录，换版本后一眼能看出哪些是本地钉的。

- **快照去重**：大于 32KB 的文件按 sha256 存进 `backups/objects/`，快照只留引用；同一份 `client.js` 只占一份空间。实测单份快照 9.0MB → **2.0MB**，`verify` 会逐个校验对象哈希，`prune` 之后自动 GC 没人引用的对象。
- **AGENTS.md**：给 agent 看的操作手册——五层模型、命令与退出码、症状→动作决策树、补丁表怎么读怎么加、状态文件与不变量。`check:docs` 现在也校验它的版本行。
- **README**：版本号与新功能（探针、预设、自检三态、去重）同步；命令表补齐 `probe` / `preset`。

- 自检区分「待应用」与「打不上」：pending 用 ⏳（黄），只有 broken 才 ✗（红）；`selfcheck` 的退出码只在 broken 时为 1，安装器不会因为「还差一次应用」报失败。
- 新增运行时探针：面板「探针」按钮或 `purge-community probe new` 生成一次性 nonce，系统提示词末尾挂一段「看到就原样回显」的短指令——模型回显 = 注入真的到了上下文（30 分钟自动过期）。

装上 `unrestricted` 预设后，补丁 #24（打开 preset 的 web fetch）会把这份新文件当成待应用目标，自检里就多出一条红线——它只是等你点「应用」，但看起来像破甲失败。现在 `preset install` 落盘时直接把 #24 的替换应用上：装完即是 `fetch: true`，`selfcheck` 一次全绿。

**状态页**：顶部改成一块 hero——一句话说明当前状态（`75/83 条补丁已生效` / `宿主还没解开：点「应用」`）+ 放大的「应用」主按钮 + 一行提示「装好插件、更新过 DSH、或发现模型又开始推脱时：点一次应用，然后退出重开」。删掉了重复的三块指标卡、进度条和「版本与恢复」头部——后者正是那个一直显示"正在检测宿主版本"的元凶（它读的是另一个接口，失败时永远停在检测中）。破甲自检、补丁明细、维护（更新+备份）、高级选项都改成默认收起的折叠块。

**无限制模式**：从"红队预设裁剪"改成 **standard 超集**——补齐 `time-context`、`tool-schedule`、`present`，共 20 行；人设重写为执行优先（直接动手 / 不重复声明边界 / 少铺垫 / 多轮不退化 / 失败换路）。预设文件带 `# managed-by: dsh-purge` 标记：带标记的会被新版自动更新，用户改过（去掉标记）就不再覆盖。

参考了社区项目 [geohotstan/dsh-tabula-rasa-preset](https://github.com/geohotstan/dsh-tabula-rasa-preset)：它用 `persona: {text:'', complete:true}` 清空整个系统提示词。我们**不采用** `complete`——那会把 purge 的注入段一起压掉，等于丢掉破甲提示词层。

DSH 0.1.7+ 的模式下拉只认 `agentPresets.register()`，把文件夹放进 `~/.dsh/.agent-presets/` 不会显示（1.3.7/1.3.8 的骨架就卡在这一步）。新增 `lib/presets-plugin.js` 作为独立插件条目 `dsh-purge-plus/presets-plugin`：等 registry 就绪后软注册一次，卸载时释放；首次运行会把 `presets/unrestricted` 落到用户目录。

`purge-community selfcheck --text` 只输出人读摘要；`scripts/install.sh` 用它打印「DSH 版本 · 兼容级别 · 宿主补丁」和结论。之前的实现取到了 JSON 的第二行，等于没打出有用信息。

- **`scripts/check-docs.mjs`**：断言 package.json 版本 = release-notes 首行 = README 版本行 = 英文 README，并检查一行安装命令还在；接进 `community.yml` 与 `release.yml`，版本改了文档没跟上会直接红。
- **安装器装完自检**：`scripts/install.sh` 在安装成功后顺手跑一次 `selfcheck`，打印"DSH 版本 · 兼容级别 · 宿主补丁"和结论，不用再记第二条命令。
- **`unrestricted` 预设骨架**：`presets/unrestricted/{preset.yml,agent.cordis.yml}` + `purge-community preset install`。预设只负责人设与工具面（审批/沙箱仍由宿主补丁拆），出厂 `fetch: false` 让 #24 有活干；`preset install` 幂等，不带 `--force` 不覆盖用户改动。

状态页：把「应用 / 还原 / 卸载」固定在内容区顶部；破甲自检从 27 行竖排改成一行摘要 + 展开后的多列网格；补丁明细默认收起；备份/更新折进「维护」。深色模式下主按钮原来用 brand-primary 当底色（它是高亮文字色），会渲染成白底白字的方块，现在改成固定的实心绿/红配白字。

新增 `scripts/install.sh`：一行安装（找桌面版 → 下载 → 校验 SHA256 → 用 DSH 运行时跑安装器）。README 重写：一行安装置顶、与原版的功能对照、按版本更新的兼容表。

`purge-community selfcheck` 在普通 Node 进程里会把 surface 判成 web，于是即便 `app.asar` 还在也报「宿主运行方式 ✓」，看起来全绿、实际跑的是未打补丁的宿主。现在显式按桌面宿主判断：`app.asar` 存在即视为未生效，自检总体结论为 false，并提示去点「应用」。

在 rc.2 的原始宿主副本上整表回归：64 条写入、6 条已达标、**0 失败**，42 个被改文件全部语法通过；打好补丁的 rc.2 宿主能组合 profile、能启动插件。右侧槽位 `sidebar.panellist` / `main` 在 rc.2 仍然存在。

设置页从右侧抽屉移到**左侧栏 `Purge`**：打开即整页（状态 / 提示词 / 规则 / 技能 / 演练台 / 更多），
字体、间距、页签样式沿用 DSH 自身；说明改成标题后的小 `?` 悬浮提示；状态页顶部一行显示
宿主版本、兼容级别、补丁计数与插件版本。

演练台样式修复（随 1.3.2 起）：面板重构时丢了演练台自带的 `.rt-*` 样式表（旧版由外层 dock 注入 `<head>`），
导致演练台完全没有样式、文字被挤成一列。现在样式随组件挂载，容器补了撑开/滚动/换行规则。

**恢复原版全部能力，把宿主补丁扩到 83 条并逐条适配 DSH 0.2.1-rc.1。**

## 相对 1.2.0 的关键变化

### 1. 拆掉"一律禁写"的总开关

1.2.0 为了避开旧补丁风险，把 `patchWritesAllowed` 硬编码成 `false`，连带禁用了还原、卸载、Hooks、逐条状态区、自动应用/自动更新和重启入口。1.3.0 把这些入口按原版逐一恢复：

| 能力 | 1.2.0 | 1.3.0 |
| --- | --- | --- |
| 应用 / 重新应用宿主补丁（界面、`/purge apply`、`purge_apply` 工具、HTTP） | 全部阻止 | 全部恢复 |
| 还原 / 卸载（界面、命令、工具、HTTP） | 全部阻止 | 全部恢复，卸载与还原仍拆开处理 |
| 启动自愈、升级后恢复、`autoApplyOnStart` / `autoUpdateOnStart` | 强制关闭 | 跟随配置 |
| Hooks 开关、逐条补丁/shim/备份状态 | 隐藏或拒绝保存 | 恢复显示与保存 |
| 应用后自动重启（含密封 asar 重启） | 改为提示手动 | 恢复原调度，仍受用户手动重启规则约束 |
| 原始 CLI `dsh-purge --status/--apply/--revert/--uninstall/--edit` | 未打进包 | 重新导出；`purge-community apply|revert|uninstall|edit` 直接转发 |

兼容性不再当写入门禁：`compatibility()` 只产出报告（`qualified` / `unverified` / `mixed` / `no-host`），仍只有"完全定位不到宿主"和"组件版本不一致"会阻止写入。

### 2. 82 条补丁逐条适配 0.2.1-rc.1

在**未打补丁的 0.2.1 原始宿主副本**上整表应用的结果：63 条写入、6 条已是目标状态、0 条失败。重写锚点的 6 条：

| # | 补丁 | 0.2.1 的变化 | 处理 |
| --- | --- | --- | --- |
| 32 | `WEB_SURFACE_IDENTITY_NEUTRAL` | Web 面身份句从 `dsh-web-app` 搬到 `dsh-harness-dev-context` 的 `WEB_SURFACE_PROMPT` | 新增目标文件键与原句锚点，旧锚点保留 |
| 53 | `WEB_SURFACE_PROHIBITION` | 同上；同文件里还有一份参与的 LEGACY 文案 | 新句锚点 + 只删活跃模板里的"别另起服务器"，LEGACY 原文保留 |
| 40 | `COMPLETE_PROMPT_KEEP_INJECT` | assemble 后多出 `requiredContexts` 过滤 | 新增 0.2.1 专用正则与产物，complete 预设继续带上注入 |
| 77 | `REWIND_DROP_SENT_ON_APPEND` | `append()` 里 `revised` 改成按需清空 | 重新锚定，回退标记到达即替换窗口 |
| 80 | `MINIMAL_OFFICIAL_TOOLSET` | 撤销型补丁，原始宿主本来就没有插件加过的工具 | 标记 `settleWhenAbsent`，不再误报漂移 |
| 88 | `HUNG_PROMPT_STRICT_NEEDLE` | 锚点是 #87 的产物 | 标记 `chainedAfter: 87`，前置未落地时不报漂移 |

### 3. 新增：锚点诊断

- 面板「状态 → 兼容与诊断」，`GET /dsh-purge/diagnose`，`npm run diagnose` / `purge-community diagnose`。
- 输出分桶：`drifted`（必做补丁锚点全灭）、`optionalDrift`、`chained`、`missing`，每条带文件路径与期望原文片段。
- 用途：DSH 再升级时先看诊断，再决定应用；不再需要靠"禁写"来兜底。

### 4. 面板：原版界面全部接回

- 恢复原版状态区（应用/总数、待处理/没对上/跳过、shim、备份、逐条补丁组）与 Hooks 开关，社区维护区叠在它上面而不是替换它。
- 恢复会话输入区**回退按钮**与回退后草稿回填（`conversation.input.right`、`dsh-purge-rewind`、order 20），sessionStorage 键沿用旧前缀。
- 恢复**首次欢迎说明**与**演练模式发送前环境适配引导**。
- `__COMMUNITY__` 只剩品牌/文案/仓库地址差异。

### 5. 更新器：通道与来源都回来了

- 默认通道仍是本 fork 的正式发行包（下载 tgz + SHA256 + 包名/版本/仓库校验）。
- 恢复原版的正式/测试通道、GitHub 分支与历史 tag 选择、branch pin、版本历史、自动更新守卫、多安装位置更新规划。
- 选上游来源时默认不选中，并在结果里带 `warning`：上游已停维护，且与新版 DSH 不兼容。

### 6. 工程

- `engines.node` 回到 `>=18`；`files`/`bin` 重新包含原始 CLI 与脚本。
- 新增 `test/patch-anchors.test.mjs`：把 0.2.1 真实源码片段钉进用例，锚点漂移会直接测试失败。
- 兼容性断言改为"报告而非禁用"，并新增"找不到宿主才阻止写入"的用例。

## 1.3.1 新增

- **破甲强化段默认开启**：系统提示词尾部追加层级声明 / 拒绝即故障 / 抗谄媚 / 多轮重申；`purge-community boost off` 或面板一键关闭。
- **注入位置可切**：`head`（默认，省 token）/ `tail`（贴输出，多轮衰减最小）/ `both`，存 `$DSH_HOME/dsh-purge/tuning.json`。
- **#89 `ask_user_question` 不再卡回合**：等待上限压到 1 秒，超时直接继续（用户仍可在界面补答）。
- **漂移诊断给出可能的新落点**：`diagnose` 在锚点未命中时返回行号 + 片段，方便重锚。
- **破甲自检**：`purge-community selfcheck [--json]`、`GET /dsh-purge/selfcheck`、面板「状态 → 破甲自检」。21 层逐层给证据（宿主补丁 / 运行时注入 / profile 权限 / asar 是否密封），目标插件未安装的层标"不适用"而不是失败。
- **备份保留策略**：默认 keep_last=5、keep_daily=7、总量 200MB，`backup/install/rollback` 后自动淘汰；`purge-community usage` 看占用，`prune` 立即清理。此前一天可堆到 65MB 且无上限。

## 已知边界

- 本轮验证在**原始 0.2.1 宿主副本**上完成（整表应用 + 41 个被改文件逐个 `node --check` + 补丁后宿主 `--dump-config` 正常）。真实客户端里点「应用」后的运行期效果，需要重启后由使用者确认。
- Windows / Web profile 未做端到端验收。
- 上游 `YuJunZhiXue/dsh-purge` 已停止维护；本 fork 的问题请提交到本仓库。
