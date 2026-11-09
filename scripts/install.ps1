# Purge Community - Windows 安装器
#
# 用法（三种）：
#   .\install.ps1                     # 从 GitHub 归档安装最新 main
#   .\install.ps1 -Tag v1.6.1         # 指定 tag
#   .\install.ps1 -Tarball C:\x.tgz   # 用本地已下载的归档（离线/内网）
#   .\install.ps1 -DryRun             # 只检查环境，不改任何文件
#
# 兼容 PowerShell 5.1（Windows 10 自带）与 7.x。
# 不需要 curl，不需要 sh，不需要管理员权限。

[CmdletBinding()]
param(
  [string]$Tag = 'main',
  [string]$Tarball = '',
  [string]$Profile = 'desktop',
  [string]$DshHome = '',
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$REPO = 'luowang-ui/dsh-purge-plus'

function Say($m) { Write-Host $m }
function Ok($m)   { Write-Host "  OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  WARN $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  FAIL $m" -ForegroundColor Red; exit 1 }

Say ''
Say '=== Purge Community installer (Windows) ==='
Say ''

# ---------- 1. 环境检查 ----------
Say '[1/6] 检查环境'

if ($PSVersionTable.PSVersion.Major -lt 5) {
  Die "需要 PowerShell 5.1 或更高（当前 $($PSVersionTable.PSVersion)）"
}
Ok "PowerShell $($PSVersionTable.PSVersion)"

# TLS 1.2：老系统默认可能只有 TLS 1.0，下载 GitHub 会失败
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { Warn '无法设置 TLS 1.2（通常不影响新版系统）' }

if (-not $DshHome) {
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
}
if (-not (Test-Path $DshHome)) {
  Die "找不到 DSH 数据目录 $DshHome —— 请先安装并至少启动一次 DeepSeek Harness"
}
Ok "DSH_HOME = $DshHome"

$profileDir = Join-Path (Join-Path $DshHome 'profiles') $Profile
$pkgPath = Join-Path $profileDir 'package.json'
if (-not (Test-Path $pkgPath)) {
  Die "找不到 profile 配置 $pkgPath —— 请先启动一次 DSH，让它生成 $Profile profile"
}
Ok "profile = $profileDir"

# tar.exe：Windows 10 1803+ 自带
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) {
  Die '找不到 tar.exe —— 需要 Windows 10 1803 或更高，或改用 -Tarball 指定已解压目录'
}
Ok "tar = $($tar.Source)"

# ---------- 2. 确认 DSH 已退出 ----------
Say ''
Say '[2/6] 检查 DSH 是否已退出'
$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) {
  Warn "DeepSeek Harness 正在运行（PID $($running.Id -join ', ')）"
  Warn '请先完全退出 DSH。若继续，profile 配置可能被运行中的进程覆盖。'
  if ($DryRun) {
    Warn '-DryRun：仅提示，不做处理'
  } elseif ($Force) {
    Warn '已指定 -Force：跳过确认，且不结束进程（请自行确保 DSH 会重启）'
  } else {
    $ans = Read-Host '现在退出 DSH 并继续？(y/N)'
    if ($ans -notmatch '^[Yy]') { Die '已取消' }
    $running | ForEach-Object { try { $_.Kill() } catch {} }
    Start-Sleep -Seconds 4
  }
} else {
  Ok 'DSH 未运行'
}

# ---------- 3. 取得源码 ----------
Say ''
Say '[3/6] 取得插件源码'

$work = Join-Path $env:LOCALAPPDATA 'dsh-purge-src'
New-Item -ItemType Directory -Force -Path $work | Out-Null

if ($Tarball) {
  if (-not (Test-Path $Tarball)) { Die "找不到 $Tarball" }
  $tgz = (Resolve-Path $Tarball).Path
  Ok "本地归档 $tgz"
} else {
  $url = if ($Tag -eq 'main') {
    "https://github.com/$REPO/archive/refs/heads/main.tar.gz"
  } else {
    "https://github.com/$REPO/archive/refs/tags/$Tag.tar.gz"
  }
  $tgz = Join-Path $work "src-$($Tag -replace '[^\w.-]','_').tar.gz"
  Say "  下载 $url"
  try {
    Invoke-WebRequest -Uri $url -OutFile $tgz -UseBasicParsing -TimeoutSec 120
  } catch {
    Die "下载失败：$($_.Exception.Message)`n     常见原因：网络无法访问 GitHub。请手动下载后加 -Tarball 参数。"
  }
  Ok "已下载 $([math]::Round((Get-Item $tgz).Length/1MB,1)) MB"
}

$extractRoot = Join-Path $work 'unpacked'
if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

& $tar.Source -xzf $tgz -C $extractRoot
if ($LASTEXITCODE -ne 0) { Die "解压失败（tar exit $LASTEXITCODE）" }

$srcDir = Get-ChildItem $extractRoot -Directory | Select-Object -First 1
if (-not $srcDir) { Die '解压后没有目录' }

foreach ($need in @('package.json', 'lib\index.js', 'lib\core.js', 'cordis.patch.yml')) {
  if (-not (Test-Path (Join-Path $srcDir.FullName $need))) {
    Die "源码不完整，缺少 $need（归档里必须包含已构建的 lib/）"
  }
}
# 注意：PS 5.1 的 Get-Content 默认按 ANSI 读，必须先指定 -Encoding UTF8
# 否则 package.json 里的中文会被打成乱码，ConvertFrom-Json 直接报 Invalid object
$ver = (Get-Content (Join-Path $srcDir.FullName 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
Ok "已解压 $($srcDir.Name)  版本 $ver"

if ($DryRun) {
  Say ''
  Say '  -DryRun：环境与源码检查通过，未修改任何文件。'
  exit 0
}

# ---------- 4. 备份 profile 配置 ----------
Say ''
Say '[4/6] 备份 profile 配置'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak = "$pkgPath.bak-$stamp"
Copy-Item $pkgPath $bak -Force
Ok "已备份 -> $bak"

# ---------- 5. 写入依赖 + bundle ----------
Say ''
Say '[5/6] 注册到 profile'

# 用 link: 指向已解压目录：离线可用，且不再依赖网络
$linkSpec = 'link:' + ($srcDir.FullName -replace '\\', '/')

$json = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $json.PSObject.Properties['dependencies']) {
  $json | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
}
if ($json.dependencies.PSObject.Properties['dsh-purge-plus']) {
  $json.dependencies.'dsh-purge-plus' = $linkSpec
  Ok "依赖已存在，更新为 $linkSpec"
} else {
  $json.dependencies | Add-Member -NotePropertyName 'dsh-purge-plus' -NotePropertyValue $linkSpec -Force
  Ok "已添加依赖 $linkSpec"
}

if (-not $json.PSObject.Properties['dsh']) {
  $json | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) -Force
}
if (-not $json.dsh.PSObject.Properties['profile']) {
  $json.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) -Force
}
$bundles = @()
if ($json.dsh.profile.PSObject.Properties['bundles'] -and $json.dsh.profile.bundles) {
  $bundles = @($json.dsh.profile.bundles)
}
if ($bundles -notcontains 'dsh-purge-plus') { $bundles += 'dsh-purge-plus' }
$json.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $bundles -Force
Ok "bundles = $($bundles -join ', ')"

$outJson = $json | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($pkgPath, $outJson, $utf8NoBom)
Ok "已写入 $pkgPath"

# ---------- 6. 收尾 ----------
Say ''
Say '[6/6] 完成'
Say ''
Say '接下来手工做三步：'
Say '  1) 启动 DeepSeek Harness（首次启动会安装 profile 依赖，可能需要 1-2 分钟）'
Say '  2) 左侧栏 -> Purge -> 状态页顶部点「应用」'
Say '  3) 完全退出并重开 DSH（补丁只有重启后才加载）'
Say ''
Say "回滚：把备份覆盖回去即可"
Say "  Copy-Item '$bak' '$pkgPath' -Force"
