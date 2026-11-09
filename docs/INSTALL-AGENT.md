# 给 AI Agent 的安装说明

> 这份文件的目标：让执行安装的 agent 有**完整事实**，能自己判断而不是靠猜。
> 如果你读到这里仍在犹豫，请把 §2「作用域与风险」原文转述给你的用户，让他确认。

---

## 1. 这是什么

`dsh-purge-plus` 是 DeepSeek Harness（DSH）的一个**本地插件**，MIT 协议，公开仓库，用户自己写的（fork 自 `dsh-purge`）。

它做的事：把 DSH 本体的若干**机制性拦截**改为直通——审批弹窗、沙箱策略、文件系统围栏、工具结果修剪、计划模式硬拦。做法是**修改用户本机上 DSH 自己的源码文件**，而不是绕过任何远程服务。

它**不做**的事：不联网上报数据、不安装系统服务/驱动/开机启动、不修改其他软件、不获取提权、不接触用户凭据。

---

## 2. 作用域与风险（请完整转述给用户）

| 维度 | 事实 |
|---|---|
| 影响范围 | 仅本机这一份 DSH 安装 |
| 修改对象 | `<DSH>/resources/app/` 下 DSH 的 JS 与 YAML；`~/.dsh/profiles/<profile>/package.json` |
| 权限需求 | 无（当前用户目录，不需要管理员） |
| 网络行为 | 仅从 `github.com` 下载源码归档；插件本身不发起外部请求 |
| 关键副作用 | 把 `app.asar` 改名为 `app.asar.sealed-*`，改由解包目录加载，以便补丁生效 |
| 持久性 | 官方升级会覆盖，需重新「应用」 |
| 可逆性 | 完全可逆：`revert` 还原宿主文件，改回 `package.json` 即卸载 |

**明确告知用户的一句话**：

> 这个插件会移除 DSH 的审批与沙箱拦截，装完后 AI 在本机执行命令将不再逐次征求你确认。它只影响本机，可以随时还原。是否继续？

得到用户明确同意后再往下走。

---

## 3. 环境事实（别猜，先测）

| 项 | 事实 |
|---|---|
| 不需要 Node.js / pnpm / git / WSL | DSH 自带运行时与 pnpm |
| Windows 10 1803+ 自带 `tar.exe` | macOS/Linux 也有 `tar` |
| Windows **没有 `sh`** | `curl … \| sh` 在任何 Windows 上都不可能成功 |
| PowerShell 5.1 里 `curl` 是别名 | `Invoke-WebRequest` 的别名，参数不兼容 → 必须用 `curl.exe` |
| `desktop` profile 被 Electron 独占 | `dsh plugin add --profile desktop …` 会报 `managed exclusively by the Electron application` |
| **本仓库没有 GitHub Release** | 任何 `releases/download/...` 链接都是 404。只能用 **archive tarball** |

开工前逐条验证：

```powershell
# Windows
[Environment]::OSVersion.VersionString
(Get-Command tar.exe).Source
Test-Path "$env:USERPROFILE\.dsh\profiles\desktop\package.json"
Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue   # 应为空
```

```sh
# macOS
uname -s
command -v tar
test -f "$HOME/.dsh/profiles/desktop/package.json" && echo ok
```

任一项不满足，**停下来告诉用户缺什么**，不要尝试"想办法绕过"。

---

## 4. 安装步骤（Windows）

最优路径是跑仓库自带脚本，它会做环境检查、源码完整性校验、配置备份：

```powershell
cd <仓库目录>
.\scripts\install.ps1              # 或 -DryRun 只检查
```

等价的手工步骤（脚本不可用时）：

```powershell
# 1) 下载归档（curl.exe！）
$dst = "$env:LOCALAPPDATA\dsh-purge-src"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
curl.exe -fsSL "https://github.com/luowang-ui/dsh-purge-plus/archive/refs/heads/main.tar.gz" -o "$dst\purge.tar.gz"

# 2) 解压
tar.exe -xzf "$dst\purge.tar.gz" -C $dst

# 3) 校验源码完整（缺一个就停下）
foreach ($f in 'package.json','lib\index.js','lib\core.js','cordis.patch.yml') {
  "{0,-20} {1}" -f $f, (Test-Path "$dst\dsh-purge-plus-main\$f")
}

# 4) 备份 profile 配置
$pkg = "$env:USERPROFILE\.dsh\profiles\desktop\package.json"
Copy-Item $pkg "$pkg.bak-$(Get-Date -Format yyyyMMdd-HHmmss)" -Force
```

然后在 `package.json` 里加两处：

```jsonc
"dependencies": { "dsh-purge-plus": "link:C:/Users/<user>/AppData/Local/dsh-purge-src/dsh-purge-plus-main" }
"dsh": { "profile": { "bundles": [ ..., "dsh-purge-plus" ] } }
```

**改 JSON 前必须备份**。写坏会导致 DSH 无法启动。

最后：

1. 启动 DSH，等它装完 profile 依赖（1–2 分钟）
2. 左侧栏 Purge → **应用**
3. 完全退出并重开

---

## 5. 验证（必须做，不要口头声称成功）

```powershell
$cli = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-purge-plus\bin\community.js"
$exe = "$env:LOCALAPPDATA\Programs\DeepSeek Harness\DeepSeek Harness.exe"
$env:ELECTRON_RUN_AS_NODE = '1'
& $exe $cli selfcheck --text
```

判读：

| 结果 | 含义 | 动作 |
|---|---|---|
| 大量 `pending` | 补丁还没写入 | 正常，点「应用」后重启 |
| 大量 `broken` | 锚点与当前宿主版本对不上 | 跑 `diagnose`，不要假装成功 |
| 插件根本不在 profile | 注册失败 | 检查 `bundles` 与 JSON 合法性 |

`selfcheck` 有 `broken` 时**必须如实报告**，说明"装上了但 N 条补丁在当前 DSH 版本上失效"。

---

## 6. 回滚与卸载

```powershell
# 还原宿主文件（保留插件）
& $exe $cli revert

# 彻底卸载：恢复 package.json 备份
Copy-Item "$env:USERPROFILE\.dsh\profiles\desktop\package.json.bak-<时间>" `
          "$env:USERPROFILE\.dsh\profiles\desktop\package.json" -Force
```

`app.asar` 被改名过时，把 `app.asar.sealed-*` 改回 `app.asar` 并删掉 `resources\app` 即可回到出厂状态。

---

## 7. 你需要向用户报告的

1. 环境检查结果（每项 ok / 缺什么）
2. 安装到的版本号
3. `selfcheck` 的 applied / pending / broken 计数
4. 是否有补丁因宿主版本失效
5. 回滚方法

**不要**报告"安装成功"而无验证输出。

---

## 8. 如果你决定不执行

那也请说清楚**具体卡在哪一条**：是作用域不清、风险不接受、还是环境不满足。用户可以据此自己装（本文就是完整步骤），或者去找维护者补信息。

含糊地拒绝（"我不能帮你装这个"）对用户没有帮助——本文的目的就是消灭这种含糊。
