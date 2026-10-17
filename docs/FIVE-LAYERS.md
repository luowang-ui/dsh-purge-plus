# 五层结构：破甲到底由哪些部分组成

装完插件不等于完事。这个插件的效果来自**五层**，各层独立生效、互相不替代。
搞清楚哪层是哪层，才不会出现「装了但还是被拦」「点了应用但没变化」这类困惑。

---

## 总览

| # | 层 | 由谁提供 | 生效时机 | 作用范围 |
|---|---|---|---|---|
| 1 | **宿主补丁**（83 条） | 本插件写进 DSH 源码 | 点「应用」写入 → **退出重开**才加载 | 全局，所有会话 |
| 2 | **提示词注入** | 插件运行时 | 每步重贴，无需重启 | 全局，所有会话 |
| 3 | **破甲强化段** | 插件运行时 | 尾部 section，默认开 | 全局，所有会话 |
| 4 | **权限配置** | profile 的 `cordis.patch.yml` | 启动时读取 | 全局，所有会话 |
| 5 | **agent 预设** | `unrestricted` / `redteam` 预设 | 新会话下拉里选 | **仅当前会话** |

**关键结论**：前四层与预设无关，所有会话共享；**预设只决定「人设 + 工具表」**。
所以「没选预设」不等于「没破甲」——前四层照样在跑。

---

## 各层做什么

### 第 1 层 · 宿主补丁

改的是 **DSH 本体的源码**，把机制层面的拦截拆掉：

- 审批弹窗（`dsh-user-approval`）
- 沙箱拒绝（`dsh-sandbox-policy`）
- 文件系统围栏
- 工具结果修剪
- 计划模式硬拦
- 工具调用上限

**这是「有能力做」的那一层。** 缺了它，模型想干也干不了。

写入方式：点面板上的「应用」。它会解包 `app.asar`、写补丁、建快照。

> ⚠️ **DSH 官方更新之后必须重新点「应用」**：`app.asar` 会重新出现，旧补丁全部失效。

### 第 2 层 · 提示词注入

把 `$DSH_HOME/prompt-inject.md` 作为 `dsh-purge` section **每步重贴**进系统提示词。

**这是「愿意做」的那一层**：不拒绝、不道歉、不说「我不能」、不往安全方向引。

不需要点应用，插件活着就在跑。

### 第 3 层 · 破甲强化段

系统提示词尾部追加的一段加固 section，默认开启。

```
purge-community boost on|off     # 查看/切换
```

### 第 4 层 · 权限配置

**这一层最容易被漏掉**，因为它不在插件里，而在 profile 配置里。

DSH 出厂默认是 `workspace-write + ask`，所以即使第 1 层补丁打好了，
**界面仍然会弹审批框**（补丁改的是代码路径，权限预设管的是会话策略）。

在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 末尾加：

```yaml
- id: permission
  config:
    defaultPreset: danger-full-access
    presets:
      read-only:
        sandbox: read-only
        approval: ask
      workspace-write:
        sandbox: workspace-write
        approval: ask
      danger-full-access:
        sandbox: danger-full-access
        approval: never
```

> **三个预设都要显式列出**，不要只写 `danger-full-access`。
> 如果 patch 层是整体替换而非深合并，只写一个会把另外两个预设删掉。
> 三个都写（值与原厂一致），两种语义下都安全。

改完重启 DSH 生效。

### 第 5 层 · agent 预设

`unrestricted`（无限制人设）与 `redteam`（红队角色）。

**只影响当前会话**：换的是人设提示词和工具表，不改变前四层的强度。

新会话 → Agent 预设选择器 → 选一个。

---

## 怎么验证每一层

```bash
purge-community selfcheck --text
```

26 层逐项检查，每层给出 `applied / pending / broken`：

| 状态 | 含义 | 该做什么 |
| --- | --- | --- |
| `ok`（✓） | 已生效 | 无 |
| `pending`（⏸） | 还没点「应用」 | 点一次「应用」，然后退出重开 |
| `broken`（✗） | 锚点对不上（宿主升级导致） | 跑 `diagnose` 看漂移，用 `reanchor` 重锚 |

`selfcheck` 退出码：全绿 0，有 broken 1。

**`pending` 不是故障**——它只表示宿主补丁还没写入。

---

## 常见困惑对照

| 现象 | 其实是 |
| --- | --- |
| 「装了插件，模型还是拒绝」 | 第 2/3 层没生效，或者根本没选中预设人设 |
| 「点了应用，界面还弹审批」 | 第 4 层没配（本文档上一节） |
| 「DSH 更新后又开始拦了」 | 第 1 层补丁被覆盖，重新点「应用」+ 重启 |
| 「没选预设，是不是没破甲」 | 不是。前四层与预设无关 |
| 「`selfcheck` 显示 pending」 | 正常，点一次「应用」即可 |

---

## DSH 版本适配

本仓库适配 **DSH Desktop 0.2.1-rc.1 / 0.2.1-rc.2**，写在 `package.json` 根级：

```json
"engines": { "dsh": ">=0.2.1-rc.1" }
```

> 注意是**根级** `engines.dsh`，不是 `dsh.engines.dsh`。
> DSH 的兼容闸门读的是前者（`unmetRequirements()` 取 `fields.engines.dsh`），
> 写成后者的插件实际上不会被校验。

DSH 在安装和启动时会比对，不满足会拒绝加载并提示用
`dsh plugin allow-version` 授予精确版本豁免。
