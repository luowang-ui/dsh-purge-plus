#!/bin/sh
# Purge Community installer — one line:
#   curl -fsSL https://raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/install.sh | sh
#
# 做四件事：找到 DSH 桌面版 → 下载最新发行包 → 校验 SHA256 → 用 DSH 自带运行时跑安装器
#（安装器会先备份 profile，再把旧 Purge 入口合并成 dsh-purge-plus）。
#
# 可用环境变量：
#   PURGE_VERSION=1.3.6     指定版本（默认取 latest）
#   DSH_APP="/Applications/DeepSeek Harness.app"   非默认安装路径
#   DSH_HOME="$HOME/.dsh"   非默认数据目录
# 参数：--dry-run 只下载校验，不安装；--version=X 同 PURGE_VERSION
set -eu

REPO="kingcharleslzy-ai/dsh-purge"
APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
VERSION="${PURGE_VERSION:-}"
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --version=*) VERSION="${arg#*=}" ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "目前只支持 macOS（DSH Desktop）"
[ -d "$APP" ] || die "找不到 $APP；用 DSH_APP=/path/to/DeepSeek Harness.app 指定"
CLI="$APP/Contents/MacOS/DeepSeek Harness"
[ -x "$CLI" ] || die "找不到可执行的 DSH 运行时：$CLI"

if [ -z "$VERSION" ]; then
  say "→ 查询最新发行版…"
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' \
    | head -n 1) || true
  [ -n "$VERSION" ] || die "读不到最新版本号（GitHub API 不可用），可改用 --version=1.3.6"
fi
say "→ 目标版本：$VERSION"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/purge-install.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
TGZ="dsh-purge-plus-$VERSION.tgz"
BASE="https://github.com/$REPO/releases/download/v$VERSION"

say "→ 下载 $TGZ"
curl -fsSL "$BASE/$TGZ" -o "$TMP/$TGZ" || die "下载失败：$BASE/$TGZ"
curl -fsSL "$BASE/SHA256SUMS.txt" -o "$TMP/SHA256SUMS.txt" || die "下载 SHA256SUMS 失败"

say "→ 校验 SHA256"
( cd "$TMP" && shasum -a 256 -c SHA256SUMS.txt >/dev/null 2>&1 ) || die "校验失败，未安装"

if [ "$DRY" = "1" ]; then
  say "✓ 校验通过（--dry-run，未安装）：$TMP/$TGZ"
  exit 0
fi

mkdir -p "$TMP/x"
tar -xzf "$TMP/$TGZ" -C "$TMP/x"
INSTALLER="$TMP/x/package/bin/community.js"
[ -f "$INSTALLER" ] || die "发行包里没有安装器：$INSTALLER"

say "→ 调用 DSH 自带运行时安装（会先备份 profile）"
ELECTRON_RUN_AS_NODE=1 "$CLI" "$INSTALLER" migrate "$TMP/$TGZ" || die "安装器返回失败"

say ""
say "✓ 已安装 Purge Community $VERSION"

# 顺手跑一次自检并把摘要打出来：装完就知道"能跑、补丁几层在位"，不用再记第二条命令。
HOMEDIR="${DSH_HOME:-$HOME/.dsh}"
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
  say "  （自检未运行：装好后到面板里点「应用」，或手动跑 purge-community selfcheck）"
fi

say ""
say "接下来："
say "  1) 完全退出并重开 DSH"
say "  2) 左侧栏点 Purge → 状态页顶部点「应用」写入宿主补丁"
say "  3) 再退出重开一次，然后跑：purge-community selfcheck"
