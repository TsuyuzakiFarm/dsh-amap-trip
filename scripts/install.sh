#!/usr/bin/env bash
#
# amap-trip · 安装 / 更新 / 卸载到指定的 DSH profile
#
# 布局约定（详见 $DSH_HOME/plugins/README.md）：
#
#   $DSH_HOME/plugins/amap-trip/           ← 本仓库（自带 .git）
#   $DSH_HOME/plugins/amap-trip/plugin/    ← 包根：package.json / index.mjs / presets/ …
#   $DSH_HOME/profiles/<profile>/
#       package.json                       ← 依赖写成 "amap-trip": "link:<路径>"
#       node_modules/amap-trip             ← 软链，指向包根
#       cordis.patch.yml                   ← insert 行（name: 'amap-trip'）
#   $DSH_HOME/skills/amap-trip/            ← 同伴 skill
#
# 两个容易踩的点：
#
# 1) **不再把包拷进 profile 树**。旧版脚本这么做，是因为插件自己 node_modules 里的
#    @deepseek-ai/schemastery 软链会遮蔽宿主实例，逼得包必须待在 profile 里才能被
#    解析。DSH 0.1.7-rc.1 起，只要在 peerDependencies + devDependencies 里成对
#    声明，运行期就用宿主那一份（见 plugin/ADAPTATION.md），所以改为就地链接。
#
# 2) **路径尽量用相对的**。profile 的 `link:` 相对 profile 目录解析，node_modules
#    软链相对 node_modules 解析——两者差一层，脚本分别计算。这样整份 $DSH_HOME
#    被复制、改名或搬到别的机器后链接依然有效。仓库不在 $DSH_HOME 下时退化成
#    绝对路径（会提示）。
#
# 用法：
#   scripts/install.sh                         # 装进 web profile
#   scripts/install.sh --profile tui           # 指定 profile
#   scripts/install.sh --home /path/to/.dsh    # 覆盖 DSH_HOME（默认取 $DSH_HOME 或 ~/.dsh）
#   scripts/install.sh --dry-run               # 只打印将要做的改动，不落盘
#   scripts/install.sh --uninstall             # 移除依赖 / 软链 / patch 行（skill 保留）
#   scripts/install.sh --help
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PKG="$REPO/plugin"
PKG_NAME="amap-trip"
SKILL_SRC="$REPO/skill"

PROFILE="web"
DSH_HOME_OPT=""
DRY_RUN=0
UNINSTALL=0

usage() {
  sed -n '3,30p' "$0" | sed 's/^#\{1,2\} \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile)   PROFILE="${2:?--profile 需要一个值}"; shift 2 ;;
    --home)      DSH_HOME_OPT="${2:?--home 需要一个值}"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           printf '未知参数：%s（用 --help 看用法）\n' "$1" >&2; exit 2 ;;
  esac
done

DSH_HOME="${DSH_HOME_OPT:-${DSH_HOME:-$HOME/.dsh}}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH="$PROFILE_DIR/cordis.patch.yml"
NM="$PROFILE_DIR/node_modules"
SKILLS="$DSH_HOME/skills"
SKILL_DST="$SKILLS/$PKG_NAME"
STAMP="$(date +%Y%m%d%H%M%S)"

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }
die()  { printf '错误：%s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }
show() { [ "$DRY_RUN" = 1 ] || "$@"; }
# 内联 node 脚本很长，dry-run 时只打印一行说明，别把源码刷屏。
# 注意：这些脚本整体包在 bash 的单引号里，**里面不能出现裸单引号**
# ——那会提前结束 bash 的引号串，把参数切碎（踩过一次：patch 被写坏成
# `name:  + id + `）。需要单引号字符时用 String.fromCharCode(39)。
run_node() { local label="$1"; shift; if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run] %s\n' "$label"; else node "$@"; fi; }

# ---------------------------------------------------------------------------
# 前置检查
# ---------------------------------------------------------------------------
[ -f "$PKG/package.json" ] || die "找不到 $PKG/package.json —— 本脚本必须从仓库的 scripts/ 下运行"
[ -d "$SKILL_SRC" ] || die "找不到 $SKILL_SRC"
[ -d "$PROFILE_DIR" ] || die "profile 目录不存在：$PROFILE_DIR
  先建一个：dsh --profile $PROFILE --from-default-profile web"
[ -f "$PATCH" ] || die "找不到 profile 的 patch 层：$PATCH"

say "仓库      : $REPO"
say "包根      : $PKG"
say "DSH_HOME  : $DSH_HOME"
say "profile   : $PROFILE_DIR"
if [ "$DRY_RUN" = 1 ]; then say "模式      : dry-run（不做任何写入）"; fi

# ---------------------------------------------------------------------------
# 计算 link 目标：能相对就相对
# ---------------------------------------------------------------------------
if [ "${PKG#"$DSH_HOME"/}" != "$PKG" ]; then
  SPEC="$(node -e 'console.log(require("path").relative(process.argv[1], process.argv[2]))' "$PROFILE_DIR" "$PKG")"
  LNKTGT="$(node -e 'console.log(require("path").relative(process.argv[1], process.argv[2]))' "$NM" "$PKG")"
  say "路径形式  : 相对（仓库在 \$DSH_HOME 下）"
else
  SPEC="$PKG"
  LNKTGT="$PKG"
  say "路径形式  : 绝对（仓库不在 \$DSH_HOME 下）"
  say "            建议把检出放到 \$DSH_HOME/plugins/$PKG_NAME/，那样能用相对路径"
fi
say "link 依赖 : link:$SPEC"
say "软链目标  : $LNKTGT"

# ---------------------------------------------------------------------------
# 卸载
# ---------------------------------------------------------------------------
if [ "$UNINSTALL" = 1 ]; then
  step "卸载 $PKG_NAME"

  if [ -e "$PROFILE_DIR/package.json.bak-$PKG_NAME" ]; then
    say "  package.json.bak-$PKG_NAME 已存在，保留不动"
  else
    run cp "$PROFILE_DIR/package.json" "$PROFILE_DIR/package.json.bak-$PKG_NAME"
  fi
  run_node "从 dependencies 移除 $PKG_NAME" -e '
    const fs = require("fs")
    const [file, name] = process.argv.slice(1)
    const j = JSON.parse(fs.readFileSync(file, "utf8"))
    if (j.dependencies && Object.hasOwn(j.dependencies, name)) {
      const prev = j.dependencies[name]
      delete j.dependencies[name]
      fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n")
      console.log("  已从 dependencies 移除 " + name + "（原 " + prev + "）")
    } else {
      console.log("  dependencies 里本来就没有 " + name)
    }
  ' "$PROFILE_DIR/package.json" "$PKG_NAME"

  if [ -L "$NM/$PKG_NAME" ]; then
    run rm -f "$NM/$PKG_NAME"
    say "  已删除软链 $NM/$PKG_NAME"
  else
    say "  软链本来就不存在"
  fi

  run cp "$PATCH" "$PATCH.bak-$PKG_NAME-$STAMP"
  run_node "从 patch 层删除 $PKG_NAME 的 insert 行" -e '
    const fs = require("fs")
    const [file, id] = process.argv.slice(1)
    const lines = fs.readFileSync(file, "utf8").split("\n")
    const out = []
    let removed = 0
    const isTop = (l) => /^- /.test(l)
    for (let i = 0; i < lines.length;) {
      if (isTop(lines[i]) && lines[i].trimEnd() === "- insert:") {
        // 一个条目 = 从 "- insert:" 到下一个顶层 "- " 之前
        let j = i + 1
        while (j < lines.length && !isTop(lines[j])) j++
        const block = lines.slice(i + 1, j)
        if (block.some((l) => l.trim() === "- id: " + id)) {
          // 连同紧贴其上的注释一起删；但只在注释块前面是空行时才动，
          // 免得把文件开头的说明性注释也吃掉
          let cs = out.length
          while (cs > 0 && /^#/.test(out[cs - 1])) cs--
          if (out.length - cs > 0 && cs > 0 && out[cs - 1].trim() === "") out.length = cs
          i = j
          removed++
          continue
        }
      }
      out.push(lines[i++])
    }
    if (removed === 0) {
      console.log("  patch 层里没有 " + id + " 的 insert 行")
    } else {
      fs.writeFileSync(file, out.join("\n"))
      console.log("  已删除 " + removed + " 个 insert 行（连同其上方注释）")
    }
  ' "$PATCH" "$PKG_NAME"

  step "完成"
  say "skill 保留在 $SKILL_DST（不需要就 rm -rf）"
  say "patch 层备份：$PATCH.bak-$PKG_NAME-$STAMP"
  say "重启 DSH 生效。"
  exit 0
fi

# ---------------------------------------------------------------------------
# 1/5 备份
# ---------------------------------------------------------------------------
step "1/5 备份 profile 的 package.json 与 patch 层"
if [ -e "$PROFILE_DIR/package.json.bak-$PKG_NAME" ]; then
  say "  已存在 package.json.bak-$PKG_NAME（首次安装前的整份快照），保留不动"
else
  run cp "$PROFILE_DIR/package.json" "$PROFILE_DIR/package.json.bak-$PKG_NAME"
fi
run cp "$PATCH" "$PATCH.bak-$PKG_NAME-$STAMP"
say "  patch 备份：$PATCH.bak-$PKG_NAME-$STAMP"

# ---------------------------------------------------------------------------
# 2/5 link 依赖
# ---------------------------------------------------------------------------
step "2/5 写 link 依赖到 profile 的 package.json"
run_node "写 dependencies[\"$PKG_NAME\"] = link:$SPEC" -e '
  const fs = require("fs")
  const [file, name, spec] = process.argv.slice(1)
  const j = JSON.parse(fs.readFileSync(file, "utf8"))
  j.dependencies = j.dependencies || {}
  const prev = j.dependencies[name]
  j.dependencies[name] = spec
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n")
  if (prev === spec) console.log("  dependencies[\"" + name + "\"] 已是 " + spec + "，保持不变")
  else if (prev === undefined) console.log("  新增 dependencies[\"" + name + "\"] = " + spec)
  else console.log("  dependencies[\"" + name + "\"]：" + prev + " → " + spec)
' "$PROFILE_DIR/package.json" "$PKG_NAME" "link:$SPEC"

# ---------------------------------------------------------------------------
# 3/5 node_modules 软链
# ---------------------------------------------------------------------------
step "3/5 建/更新 node_modules 软链"
run mkdir -p "$NM"
run ln -sfn "$LNKTGT" "$NM/$PKG_NAME"
show ls -ld "$NM/$PKG_NAME"

# ---------------------------------------------------------------------------
# 4/5 patch 行
# ---------------------------------------------------------------------------
step "4/5 确保 patch 层按包名挂载"
if grep -q "id: $PKG_NAME" "$PATCH"; then
  if grep -qE "^[[:space:]]+name:[[:space:]]*['\"]?$PKG_NAME['\"]?[[:space:]]*$" "$PATCH"; then
    say "  已有 insert 行且 name 为 '$PKG_NAME'，保持不变"
  else
    say "  已有 insert 行但 name 不是包名（旧版写的是 index.mjs 绝对路径），就地改正"
    run_node "把 patch 里 $PKG_NAME 的 name: 改成包名" -e '
      const fs = require("fs")
      const [file, id] = process.argv.slice(1)
      const lines = fs.readFileSync(file, "utf8").split("\n")
      const start = lines.findIndex((l) => l.trim() === "- id: " + id)
      if (start < 0) { console.log("  没找到 id 行，跳过"); process.exit(0) }
      for (let i = start + 1; i < lines.length; i++) {
        if (/^- /.test(lines[i])) break
        const m = lines[i].match(/^(\s*name:\s*).*$/)
        if (m) {
          const q = String.fromCharCode(39)
          const before = lines[i].trim()
          lines[i] = m[1] + q + id + q
          fs.writeFileSync(file, lines.join("\n"))
          console.log("  " + before + "  →  name: " + q + id + q)
          process.exit(0)
        }
      }
      console.log("  id 行下面没有 name: 字段，跳过")
    ' "$PATCH" "$PKG_NAME"
  fi
else
  say "  没有 insert 行，追加一段"
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry-run] 向 $PATCH 追加 id: $PKG_NAME / name: '$PKG_NAME'"
  else
    cat >> "$PATCH" <<YAML

# $PKG_NAME — 高德出行工具（日常 / 工作双模式）。由 scripts/install.sh 维护。
- insert:
    - id: $PKG_NAME
      name: '$PKG_NAME'
YAML
  fi
fi

# ---------------------------------------------------------------------------
# 5/5 skill
# ---------------------------------------------------------------------------
step "5/5 部署 skill"
if [ -d "$SKILL_DST" ] && diff -rq "$SKILL_SRC" "$SKILL_DST" >/dev/null 2>&1; then
  say "  已与仓库逐字节一致，保持不变（重复安装不会堆积 .bak）"
else
  if [ -d "$SKILL_DST" ]; then
    run mv "$SKILL_DST" "$SKILL_DST.bak.$STAMP"
    say "  旧 skill 备份为 $SKILL_DST.bak.$STAMP"
  fi
  run mkdir -p "$SKILLS"
  run cp -R "$SKILL_SRC" "$SKILL_DST"
  say "  skill → $SKILL_DST"
fi

# ---------------------------------------------------------------------------
# 自检
# ---------------------------------------------------------------------------
step "自检"
if [ "$DRY_RUN" = 1 ]; then
  say "  [dry-run] 跳过"
else
  if node --check "$PKG/index.mjs"; then say "  ✓ index.mjs 语法 OK"; fi

  RESOLVED="$(cd "$PROFILE_DIR" && node -e '
    try {
      const r = require("module").createRequire(process.cwd() + "/")
      console.log(r.resolve(process.argv[1] + "/package.json"))
    } catch (e) { console.log("FAIL " + e.code) }
  ' "$PKG_NAME")"
  case "$RESOLVED" in
    FAIL*) say "  ✗ profile 无法按包名解析 $PKG_NAME：$RESOLVED"; exit 1 ;;
    *)     say "  ✓ profile 按包名解析到：$RESOLVED" ;;
  esac

  WANT="$(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  GOT="$(node -e 'console.log(require(process.argv[1]).version)' "$RESOLVED")"
  if [ "$WANT" = "$GOT" ]; then
    say "  ✓ 解析到的版本与仓库一致：$GOT"
  else
    say "  ! 版本不一致：仓库 $WANT，profile 解析到 $GOT（软链可能指向别处）"
  fi

  # 裸 import 在 DSH 之外**应当**失败：@deepseek-ai/schemastery 由 DSH 的 peer
  # 拦截在运行期提供，Node 自己从插件目录往上找不到它。
  PEER="$(cd "$PROFILE_DIR" && node -e '
    import(process.argv[1])
      .then((m) => console.log("ok " + m.name + " apply=" + typeof m.apply))
      .catch((e) => console.log((e && e.code) + " " + String(e && e.message).split("\n")[0]))
  ' "$PKG_NAME" 2>&1 || true)"
  case "$PEER" in
    ok*)    say "  ✓ 裸 import 成功：$PEER" ;;
    *ERR_MODULE_NOT_FOUND*schemastery*)
            say "  ✓ 裸 import 如期失败在 @deepseek-ai/schemastery —— 该依赖由 DSH 的 peer 拦截提供，属正常" ;;
    *)      say "  ! 裸 import 失败得不像预期，值得看一眼：$PEER" ;;
  esac
fi

# ---------------------------------------------------------------------------
# 收尾
# ---------------------------------------------------------------------------
step "完成"
say "重启 DSH 后生效（profile 的 patch 层与 bundles 只在启动时组合）。"
say "验证：让模型跑一次 amap_diagnose，或在插件列表里确认有 $PKG_NAME。"
say ""
say "回滚（推荐，只动 $PKG_NAME，不碰 profile 的其它改动）："
say "  scripts/install.sh --uninstall"
say ""
say "要整份文件回退时（谨慎）："
say "  dependencies 快照：$PROFILE_DIR/package.json.bak-$PKG_NAME"
say "    —— 那是**首次**安装本插件之前的整份 package.json，可能已经很旧，"
say "       直接覆盖会连带回退之后装过的别的插件，优先用 --uninstall"
say "  本次 patch 快照：$PATCH.bak-$PKG_NAME-$STAMP"
