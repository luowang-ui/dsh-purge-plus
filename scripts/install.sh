#!/bin/sh
# Purge Community installer — macOS / Linux
#
#   curl -fsSL https://raw.githubusercontent.com/luowang-ui/dsh-purge-plus/main/scripts/install.sh | sh
#
# Windows 用户不要用本脚本（Windows 没有 sh）：
#   下载仓库后双击 scripts\install.cmd，或跑 scripts\install.ps1
#
# 做五件事：找 DSH → 下载源码归档 → 校验结构 → 重打成本地 tgz → 用 DSH 自带运行时安装
#（安装器会先备份 profile，再把旧 Purge 入口合并成 dsh-purge-plus）
#
# 可用环境变量：
#   PURGE_REF=main                   分支或 tag（默认 main）
#   DSH_APP="/Applications/DeepSeek Harness.app"   非默认安装路径
#   DSH_HOME="$HOME/.dsh"            非默认数据目录
# 参数：
#   --dry-run        只下载校验，不安装
#   --ref=<name>     同 PURGE_REF
#   -h, --help       显示这段说明
set -eu

REPO="luowang-ui/dsh-purge-plus"
REF="${PURGE_REF:-main}"
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --ref=*) REF="${arg#*=}" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) printf '未知参数：%s\n' "$arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

# ---------- 平台分流 ----------
OS="$(uname -s)"
case "$OS" in
  MINGW*|MSYS*|CYGWIN*)
    die "这是 Windows（$OS），本脚本不适用。请用 scripts/install.cmd 或 scripts/install.ps1"
    ;;
  Darwin|Linux) : ;;
  *) die "未验证的平台：$OS（本脚本支持 macOS / Linux）" ;;
esac
say "→ 平台：$OS"

# ---------- 找 DSH ----------
if [ "$OS" = "Darwin" ]; then
  APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
  CLI="$APP/Contents/MacOS/DeepSeek Harness"
else
  APP="${DSH_APP:-}"
  CLI=""
  if [ -n "$APP" ] && [ -x "$APP/DeepSeek Harness" ]; then
    CLI="$APP/DeepSeek Harness"
  else
    die "Linux 上请用 DSH_APP=/path/to/resources/app 指定安装目录（内含 DeepSeek Harness 可执行文件）"
  fi
fi
[ -x "$CLI" ] || die "找不到可执行的 DSH 运行时：$CLI（用 DSH_APP=... 指定）"
say "→ DSH：$CLI"

HOMEDIR="${DSH_HOME:-$HOME/.dsh}"
[ -d "$HOMEDIR" ] || die "找不到 DSH 数据目录 $HOMEDIR —— 请先安装并至少启动一次 DSH"
say "→ DSH_HOME：$HOMEDIR"

# ---------- 下载源码归档 ----------
# 注意：本仓库没有 GitHub Release，只能用 archive tarball。
URL="https://github.com/$REPO/archive/refs/heads/$REF.tar.gz"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/purge-install.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

say "→ 下载 $URL"
curl -fsSL "$URL" -o "$TMP/src.tar.gz" || die "下载失败：$URL
  · 无法访问 GitHub：手动下载后解压，改用 docs/INSTALL.md 的手动安装
  · 或者换一个 ref：--ref=<tag>"

mkdir -p "$TMP/x"
tar -xzf "$TMP/src.tar.gz" -C "$TMP/x" || die "解压失败"
SRC=$(find "$TMP/x" -maxdepth 1 -mindepth 1 -type d | head -n 1)
[ -n "$SRC" ] || die "归档里没有目录"

# ---------- 校验结构（归档必须带已构建的 lib/） ----------
for f in package.json lib/index.js lib/core.js cordis.patch.yml bin/community.js; do
  [ -f "$SRC/$f" ] || die "源码不完整，缺少 $f —— 该 ref 可能没有提交构建产物，换 main 或发版 tag"
done
VERSION=$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$SRC/package.json" | head -n 1)
say "→ 版本：$VERSION"

if [ "$DRY" = "1" ]; then
  say "✓ 校验通过（--dry-run，未安装）：$SRC"
  exit 0
fi

# ---------- 重打成 npm pack 形态（package/ 前缀），交给插件自己的安装器 ----------
mkdir -p "$TMP/pack"
cp -R "$SRC" "$TMP/pack/package"
TGZ="$TMP/dsh-purge-plus-$VERSION.tgz"
tar -czf "$TGZ" -C "$TMP/pack" package || die "打包失败"

say "→ 调用插件安装器（会先备份 profile）"
DSH_HOME="$HOMEDIR" ELECTRON_RUN_AS_NODE=1 "$CLI" "$SRC/bin/community.js" migrate "$TGZ" \
  || die "安装器返回失败；可改用 docs/INSTALL.md 的手动方式"

say ""
say "✓ 已安装 Purge Community $VERSION"

# ---------- 顺手自检 ----------
SUMMARY=""
for cli in "$HOMEDIR"/profiles/*/node_modules/dsh-purge-plus/bin/community.js; do
  [ -f "$cli" ] || continue
  SUMMARY=$(DSH_HOME="$HOMEDIR" ELECTRON_RUN_AS_NODE=1 "$CLI" "$cli" selfcheck --text 2>/dev/null | sed -n '2p;$p' || true)
  break
done
if [ -n "$SUMMARY" ]; then
  say ""
  say "自检摘要："
  printf '%s\n' "$SUMMARY" | sed 's/^/  /'
else
  say "  （自检未运行：装好后到面板点「应用」，或手动跑 purge-community selfcheck）"
fi

say ""
say "接下来："
say "  1) 完全退出并重开 DSH"
say "  2) 左侧栏 → Purge → 状态页顶部点「应用」"
say "  3) 再退出重开一次，然后跑：purge-community selfcheck"
