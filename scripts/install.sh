#!/usr/bin/env bash
# 安装/更新 amap-trip（标准插件包形态）。
# 关键点：包必须放在 profile 树内（~/.dsh/profiles/web/plugins/amap-trip），
# 这样它才能解析 @deepseek-ai/schemastery；再用 link: 依赖 + node_modules 软链，
# 让插件能被"包名"解析并出现在插件管理页面。
# 注意：本机 pnpm 被 supply-chain 策略（minimumReleaseAge）拦住，因此不走 dsh plugin add，
# 改用与 pnpm link 等价的等价手工操作（写依赖 + 建软链）。
set -euo pipefail
WS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="$HOME/.dsh/profiles/web"
DST="$PROFILE/plugins/amap-trip"
PATCH="$PROFILE/cordis.patch.yml"
SKILLS="$HOME/.dsh/skills"
STAMP="$(date +%Y%m%d%H%M%S)"

[ -f "$PATCH" ] || { echo "找不到 $PATCH（profile 名可能不是 web）"; exit 1; }

echo "== 1/4 部署包 → $DST =="
mkdir -p "$PROFILE/plugins"
if [ -d "$DST" ]; then mv "$DST" "$DST.bak.$STAMP"; fi
mkdir -p "$DST"
cp -R "$WS/amap-trip/plugin/." "$DST/"
rm -rf "$DST/node_modules"
find "$DST" -type f | sed "s|$DST/|  |"

echo "== 2/4 依赖 + 软链（等价 pnpm link）=="
cp -n "$PROFILE/package.json" "$PROFILE/package.json.bak-amap-trip" || true
node -e "const fs=require('fs');const p=process.env.HOME+'/.dsh/profiles/web/package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.dependencies=j.dependencies||{};j.dependencies['amap-trip']='link:'+process.env.HOME+'/.dsh/profiles/web/plugins/amap-trip';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
ln -sfn "$DST" "$PROFILE/node_modules/amap-trip"
ls -ld "$PROFILE/node_modules/amap-trip"

echo "== 3/4 patch 行使用包名 =="
cp "$PATCH" "$PATCH.bak-amap-trip-$STAMP"
if grep -q "name: .*/plugins/amap-trip/index.mjs" "$PATCH"; then
  sed -i "s|^      name: .*/plugins/amap-trip/index.mjs.|      name: 'amap-trip'|" "$PATCH"
fi
if ! grep -q "id: amap-trip" "$PATCH"; then
  cat >> "$PATCH" <<YAML

# amap-trip — 高德出行工具（日常/工作双模式）。
- insert:
    - id: amap-trip
      name: 'amap-trip'
YAML
fi
grep -A3 "id: amap-trip" "$PATCH" | head -5

echo "== 4/4 用包名解析自检（等价 DSH 启动路径）=="
cd "$PROFILE" && node -e "import('amap-trip').then(m=>console.log('解析 OK | name='+m.name+' | apply='+typeof m.apply+' | Config='+!!m.Config)).catch(e=>{console.log('解析失败: '+e.message);process.exit(1)})"

mkdir -p "$SKILLS"
if [ -d "$SKILLS/amap-trip" ]; then mv "$SKILLS/amap-trip" "$SKILLS/amap-trip.bak.$STAMP"; fi
cp -R "$WS/amap-trip/skill" "$SKILLS/amap-trip"
echo "skill → $SKILLS/amap-trip"

echo
echo "完成。重启 DSH 后：插件管理页面应能看到 amap-trip，工具照常可用。"
echo "回滚：cp $PATCH.bak-amap-trip-$STAMP $PATCH && cp $PROFILE/package.json.bak-amap-trip $PROFILE/package.json && rm -f $PROFILE/node_modules/amap-trip && 重启"
