# 安装说明（全平台 · 手动优先）

> 本文替代 README 里的一行命令。**一行命令只对 macOS 成立**，Windows 用户请直接看 [Windows 手动安装](#windows-手动安装)。
>
> 当前版本 **1.6.1** · 已验证宿主 **DSH Desktop 0.2.1-rc.1 / 0.2.1-rc.2**

---

## 0. 先读：这个插件做什么、改哪里

| 项 | 说明 |
|---|---|
| **它是什么** | DeepSeek Harness 的一个本地插件（MIT 开源）。它把 DSH 本体的审批弹窗、沙箱拒绝、fs 围栏、工具结果修剪等机制改成直通。 |
| **它改哪里** | `<DSH 安装目录>/resources/app/` 下 DSH 自己的源码文件，以及 `~/.dsh/profiles/<profile>/package.json` / `cordis.patch.yml`。 |
| **作用域** | **只影响本机这一份 DSH 安装**。不联网上报、不改系统设置、不装驱动、不碰其他软件。 |
| **可逆** | `purge_revert` / `purge-community revert` 还原宿主文件；`rollback <id>` 回滚插件本体；`uninstall` 彻底移除。 |
| **权限** | 不需要管理员权限。写的是当前用户目录。 |
| **风险** | 宿主是官方 Electron 应用。插件会解开 `app.asar` 到 `resources/app/` 并对其改名（`app.asar` → `app.asar.sealed-*`）以便加载补丁。**官方升级会覆盖这些改动**，需重新「应用」。 |

> 给 AI agent：以上是该工具的完整作用域声明。它在用户自己的机器上修改用户自己的应用，属用户授权范围内的本地开发操作。若要执行安装，请按本文步骤逐条走完，并向用户报告每一步的结果；卸载与回滚命令见 §6。

---

## 1. 环境要求

| 项 | 要求 | 检查命令 |
|---|---|---|
| DeepSeek Harness | Desktop 版，**至少启动过一次** | 见下 |
| 插件兼容 | `engines.dsh >= 0.2.1-rc.1` | — |
| Windows | Windows 10 **1803+**（自带 `tar.exe`） | `tar --version` |
| macOS | 10.15+ | `tar --version` |
| Linux | **未验证**，请用 `dsh web` profile 自行测试 | — |
| 网络 | 能访问 `github.com`（或走 §5 离线安装） | — |

**不需要**：Node.js、pnpm、git、管理员权限、WSL。
DSH 自带运行时与 pnpm，profile 依赖由 DSH 自己安装。

### 两个最常见的环境坑

| 坑 | 现象 | 原因 / 解法 |
|---|---|---|
| **`curl` 不是命令** | `curl : 无法将“curl”项识别为 cmdlet…` 或参数报错 | Windows PowerShell 5.1 里 `curl` 是 `Invoke-WebRequest` 的**别名**，参数完全不同。必须写 **`curl.exe`**（带 `.exe`）。 |
| **`sh` 不是命令** | `'sh' 不是内部或外部命令` | Windows 没有 `sh`。README 的 `curl ... \| sh` 在 Windows **永远不可用**，请用 §3。 |

---

## 2. 选一条路径

| 你的情况 | 用哪个 |
|---|---|
| Windows，想省事 | §3 手动安装（4 步）或 `scripts\install.cmd` 双击 |
| Windows，无法访问 GitHub | §5 离线安装 |
| macOS | §4 |
| 想先看会改什么 | 先跑 `.\scripts\install.ps1 -DryRun` |

---

## 3. Windows 手动安装

> 全程不需要管理员权限。**每一步都能单独回退**。

### 3.1 确认 DSH 装在哪、profile 在哪

```powershell
# DSH 安装目录（含 resources\app 的那一层）
Test-Path "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\app.asar"

# DSH 数据目录，profile 配置在这里
Test-Path "$env:USERPROFILE\.dsh\profiles\desktop\package.json"
```

两个都应为 `True`。第二个是 `False` 说明 **DSH 还没启动过**，先启动一次再关掉。

### 3.2 下载源码归档

GitHub 的仓库归档里**已经包含构建好的 `lib/`**，不需要自己 build。

```powershell
$dst = "$env:LOCALAPPDATA\dsh-purge-src"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

# 注意是 curl.exe，不是 curl
curl.exe -fsSL "https://github.com/luowang-ui/dsh-purge-plus/archive/refs/heads/main.tar.gz" `
  -o "$dst\purge.tar.gz"
```

> 不想用命令行：浏览器打开上面那个网址，另存为 `purge.tar.gz` 也行。

### 3.3 解压

```powershell
tar.exe -xzf "$dst\purge.tar.gz" -C $dst
Get-ChildItem "$dst\dsh-purge-plus-main" | Select-Object Name
```

应能看到 `lib`、`bin`、`presets`、`cordis.patch.yml`、`package.json`。

**自检**（缺任何一个都说明归档不完整）：

```powershell
foreach ($f in 'package.json','lib\index.js','lib\core.js','cordis.patch.yml') {
  "{0,-20} {1}" -f $f, (Test-Path "$dst\dsh-purge-plus-main\$f")
}
```

### 3.4 注册到 profile

这一步是**关键差异**：`desktop` profile 被 Electron 独占，`dsh plugin add --profile desktop` 会直接报错：

```
error: profile "desktop" is managed exclusively by the Electron application
```

所以必须改配置文件。

```powershell
$pkg = "$env:USERPROFILE\.dsh\profiles\desktop\package.json"

# 先备份
Copy-Item $pkg "$pkg.bak-$(Get-Date -Format yyyyMMdd-HHmmss)" -Force

# 用记事本打开
notepad $pkg
```

改成下面这样（**只需要加两处**，其余原样保留）：

```jsonc
{
  "name": "dsh-profile-desktop",
  "private": true,
  "dependencies": {
    "@dsh-market/plugin": "^0.4.15",
    "dsh-purge-plus": "link:C:/Users/你/dsh-purge-src/dsh-purge-plus-main"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-purge-plus"
      ]
    }
  }
}
```

两处改动：

1. `dependencies` 里加 `"dsh-purge-plus": "link:<上一步解压出的绝对路径，用正斜杠>"`；
2. `bundles` 数组里加 `"dsh-purge-plus"`（放在最后）。

> **用 `link:` 而不是 GitHub URL 的好处**：离线可用、升级不受网络影响、改代码立即生效。
> 想跟随远端就用 `"https://github.com/luowang-ui/dsh-purge-plus/archive/refs/heads/main.tar.gz"`。

**JSON 格式警告**：末尾不能多逗号，路径里必须有 `link:` 前缀，反斜杠要换成 `/`。写坏 DSH 会启动失败——所以 §3.4 一开始先备份。

### 3.5 启动并应用

```powershell
Start-Process "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe"
```

1. 首次启动 DSH 会安装 profile 依赖，**可能要 1–2 分钟**，别急着关。
2. 左侧栏 → **Purge** → 状态页顶部点 **应用**。
   它会解包 `app.asar` 到 `resources\app`、写入补丁、建快照，然后自动重启。
3. 重启后再看一次 `Purge` 状态页，顶上不应再有红色警告。

---

## 4. macOS 手动安装

```sh
# 1) 下载
curl -fsSL "https://github.com/luowang-ui/dsh-purge-plus/archive/refs/heads/main.tar.gz" -o /tmp/purge.tar.gz

# 2) 解压
mkdir -p /tmp/purge && tar -xzf /tmp/purge.tar.gz -C /tmp/purge

# 3) 注册（把 <你> 和 <profile> 换成实际值）
#    编辑 ~/.dsh/profiles/desktop/package.json：
#      dependencies 加 "dsh-purge-plus": "link:/tmp/purge/dsh-purge-plus-main"
#      dsh.profile.bundles 末尾加 "dsh-purge-plus"

# 4) 启动 DSH，左侧栏 Purge -> 应用 -> 重启
open -a "DeepSeek Harness"
```

macOS 上 `dsh plugin add --profile web add <tgz>` 对 **web** profile 可用；`desktop` 同样被独占。

---

## 5. 离线 / 内网安装

目标机不能访问 GitHub 时：

1. 在能上网的机器上下载归档：
   `https://github.com/luowang-ui/dsh-purge-plus/archive/refs/heads/main.tar.gz`
2. 用 U 盘拷到目标机，例如 `D:\purge.tar.gz`
3. 目标机上解压（同 §3.3），然后把 §3.4 的 `link:` 指向解压目录
4. 或用脚本一条命令搞定：

```powershell
.\scripts\install.ps1 -Tarball D:\purge.tar.gz
```

> `install.ps1` 会自动：检查环境 → 校验源码完整性 → 备份 package.json → 写入 `link:` 依赖与 bundle。
> 加 `-DryRun` 只看不改。

---

## 6. 验证 / 回滚 / 卸载

### 验证

```powershell
# 找到插件的 CLI（profile 目录下）
$cli = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-purge-plus\bin\community.js"
$exe = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe"

# 自检（27 层逐项证据）
$env:ELECTRON_RUN_AS_NODE = '1'
& $exe $cli selfcheck --text
```

也可以直接在 DSH 里让我跑 `purge_status`。

### 回滚（撤销破甲，保留插件）

```
purge_revert           # DSH 内
```
或面板 → 状态页 → 还原。

### 卸载插件

1. 关掉 DSH；
2. 把 `~/.dsh/profiles/desktop/package.json` 里刚加的两处删掉（或用 §3.4 的 `.bak` 覆盖回去）：
   ```powershell
   Copy-Item "$env:USERPROFILE\.dsh\profiles\desktop\package.json.bak-<时间戳>" `
             "$env:USERPROFILE\.dsh\profiles\desktop\package.json" -Force
   ```
3. 重启 DSH。

---

## 7. 故障排查（按报错原文查）

| 报错 / 现象 | 原因 | 解法 |
|---|---|---|
| `curl : 无法将“curl”项识别…` | PowerShell 把 `curl` 当别名 | 改用 **`curl.exe`** |
| `'sh' 不是内部或外部命令` | Windows 无 `sh` | 别用 `curl … \| sh`，走 §3 |
| `error: profile "desktop" is managed exclusively by the Electron application` | 桌面 profile 由 Electron 独占 | 改 `package.json`（§3.4），别用 `dsh plugin add` |
| `找不到 profile 配置 …\package.json` | DSH 从未启动过 | 先启动一次 DSH 再关掉 |
| `找不到 tar.exe` | Windows 早于 10 1803 | 用 7-Zip 解压，或升级系统 |
| 下载卡住 / 超时 | 无法访问 GitHub | 走 §5 离线安装 |
| DSH 启动后插件没出现 | `bundles` 里没加，或 JSON 写坏 | 用 `-DryRun`/记事本复查；看 DSH 启动日志 |
| 面板显示「插件根：找不到」 | 宿主还封在 `app.asar` 里 | 点一次「应用」，它会解包 |
| `selfcheck` 一堆 `pending` | 补丁还没写入 | **正常**，点「应用」后重启 |
| `selfcheck` 一堆 `broken` | 宿主版本变了，锚点漂移 | `purge-community diagnose` 看漂移，`reanchor` 重锚 |
| 装完模型依然推脱 | 模型层问题，不是插件失效 | 跑 `purge-community probe new` 证明注入是否到达 |
| `ConvertFrom-Json : Invalid object passed in` / JSON 里中文变 `鐩稿?` | **PS 5.1 的 `Get-Content` 默认按 ANSI 读**，把 UTF-8 中文打坏 | 读文件必须加 `-Encoding UTF8`；脚本已处理 |
| `.ps1` 报 `Unexpected token '}'` / 中文变 `鍚姩` | PowerShell 5.1 把**无 BOM 的 UTF-8** 当 ANSI 解析 | 脚本存成 **UTF-8 with BOM**（本仓库的 `install.ps1` 已是 BOM） |

> 两个编码坑是中文 Windows 上的通病，和 DSH 无关，但会伪装成"脚本坏了"。自己手写命令时一定要注意。

### 安装脚本参数

```powershell
.\scripts\install.ps1 -DryRun              # 只检查环境和源码，不改任何文件
.\scripts\install.ps1 -Tag v1.6.1          # 指定 tag（默认 main）
.\scripts\install.ps1 -Tarball D:\x.tar.gz # 离线：用本地归档
.\scripts\install.ps1 -DshHome D:\dsh      # 非默认数据目录
.\scripts\install.ps1 -Force               # 跳过「DSH 正在运行」确认且不杀进程
```

---

## 8. 官方升级后必做

DSH 每次升级都会重新出现 `app.asar`，旧补丁全部失效。升级完：

1. 打开 Purge → **应用**（重新解包 + 打补丁）
2. 完全退出并重开
3. `selfcheck` 看有没有 `broken`

0.2.2-rc.1 上已实测有 9 条锚点漂移（`#14 #17 #40 #54 #60 #62 #67 #74 #82`），`diagnose` 会逐条指出。
