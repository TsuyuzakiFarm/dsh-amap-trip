# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的结构，版本号用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.6] - 2026-09-24

### 修复
- **走廊检索的类别标签不再取决于调用者传参顺序。** `classify()` 取「第一个命中的类别」，
  而 ops 预设里 `crowd` 与 `transit` 曾共用 `150500`（地铁站）/ `150700`（公交站），于是
  `categories: ["crowd","transit"]` 会把它们全部标成"人员密集"、让"交通枢纽"永远为空，换个
  顺序又得到另一套标签。`resolveCategories()` 现固定按**预设定义的顺序**返回。
- **`crowd`（人员密集）不再包含地铁站与公交站**，两者归 `transit`（交通枢纽），预设内不再有
  跨类别的重复类型码。同步更新 `presets/ops.json`、代码兜底预设、README 与 `skill/references/ops.md`。
- 新增 `scripts/test-categories.mjs`：校验预设无重复类型码、兜底表与 JSON 逐项一致、类别顺序
  与标签结果不随传参顺序变化。

### 变更
- **适配 DSH `0.1.7-rc.1` 的插件依赖声明。** 插件此前在包内 `node_modules/` 放了一条指向
  `~/.npm/_npx/<hash>/node_modules/@deepseek-ai/schemastery` 的绝对软链（`<hash>` 是 npx
  缓存的内容哈希，DSH 重装一次就断；而且按 0.1.7-rc.1 的新解析规则，物理更近的包会遮蔽宿主实例）。
  现删除该软链，改为在 `peerDependencies` + `devDependencies` 里声明
  `@deepseek-ai/schemastery: ~3.18.4`，运行时使用宿主那一份。
- 新增 `peerDependencies["@deepseek-ai/dsh"]: ">=0.1.5-rc.2"`：接入 0.1.7-rc.1 新增的
  插件兼容性预检（该预检读 `peerDependencies`，不认自造的 `dsh.engines` 字段）。
- 新增包内 `README.md` 与 `ADAPTATION.md`（安装、配置项、逐条适配记录），并加入 `files`。

### 未变
- 插件代码（`index.mjs` / `core.mjs` / `corridor.mjs` / `prefs.mjs` / `map-html.mjs` /
  `presets/*.json` / `cordis.patch.yml`）逐字节未改；10 个工具的行为不变。

## [0.1.5] - 2026-09-23

### 修复
- **地图：点击点位清单报 `Invalid Object: Pixel(NaN, NaN)`、地图不移动。** 标注位置原先传字符串坐标，信息窗做像素换算时得到 NaN。现改为：坐标解析为数值并构造 `AMap.LngLat`；信息窗延迟到首次点击创建，且**按坐标**打开（`info.open(map, pos)`）；缩放同样用该坐标。
- 地图：跨域脚本异常（浏览器只显示 `Script error.`）改为中性提示，不再被误读为致命错误。

### 新增
- `scripts/browser-load-test.cjs`、`scripts/browser-click-test.cjs`：用无头 Chrome 验证生成页面的加载与"点击点位定位"链路（含瓦片数量、控制台错误、缩放/中心变化断言）。

## [0.1.4] - 2026-09-23

### 修复
- **产物目录解析**：DSH 运行期取不到 `exec.agent.session.cwd` 时，改为回退读取会话日志 header 的 `cwd`。解析顺序：会话对象 → 对象图探测 → 会话 `header.cwd` → 会话日志 → 配置 `workspaceDir` → 进程 cwd；工具返回里会打印实际来源。

## [0.1.3] - 2026-09-23

### 修复
- **地图白屏。** 移除 `map.setFitView()`：在 JSAPI v2 + `viewMode:"2D"` 下，对「多段线 + 多个标注」调用它会抛 `LngLat(NaN, NaN)`，异常中断渲染链路——底图瓦片一张都不请求，页面全白。改用 `AMap.Bounds` + `setBounds` 定位，并对初始化/定位/点击全部兜错。

### 新增
- 地图点位清单**可折叠**：默认收起，点击清单项会自动收起面板并放大定位到该点，不再遮挡地图。
- 页面内置**加载诊断条**：SDK 加载失败、脚本异常、点位为空、`file://` 限制都会直接显示。
- `scripts/check-map-html.mjs`、`scripts/browser-check.cjs`、`scripts/browser-compact.cjs`。

## [0.1.2] - 2026-09-22

### 变更
- **产物统一写入当前会话工作区**：`<工作区>/amap-trip-production/`（地图 `map-*.html`、点位表 `corridor-*.csv`、分段表 `route-nodes-*.csv`、几何 `route-*.json`），不再写宿主家目录。
- 新增配置 `outSubdir`（默认 `amap-trip-production`）；`outDir` 从"默认值"改为**绝对路径覆盖**（留空即按工作区推导）。
- skill 与 README 同步更新产物路径说明。

## [0.1.1] - 2026-09-21

### 修复
- `amap_route`、`amap_poi` 现在**接受中文地址**（此前只有走廊检索与出图做了地址解析，路径规划会直接被高德判为参数错误 `20000`）。
- 走廊 `withWeather`：逆地理编码对直辖市返回的 `city` 是空数组，导致天气查询报 `20000`；改取 `adcode`。
- 走廊日常模式默认改用 `source=v3`：v5 的 POI 没有评分/人均/电话字段，`sort=rating` 会失效。
- `scripts/install.sh`：备份由 `mv` 改为 `cp`，复制失败时不会把已部署的插件目录清空。

## [0.1.0] - 2026-09-21

### 新增
- 首个版本：DSH 插件 `amap-trip` + skill `amap-trip`。
- 10 个工具：`amap_diagnose` `amap_geocode` `amap_route` `amap_poi` `amap_traffic` `amap_weather` `amap_corridor` `amap_map` `amap_mode` `amap_pref`。
- 走廊检索：沿路线采样检索→去重→计算**里程桩号与垂直偏离**→出 CSV，同时产出**路线分段表**（起止里程/路名/路口·桥隧标签/实时路况）。
- 双模式（日常/工作）与两套**物理隔离**的偏好文件；工作模式默认不保存起终点。
- HTML 出图（JSAPI v2，遵守埋点与 appname 规范）。
- 工程：`Config` 用 Schemastery 定义与校验、`exec.signal` 取消透传、HTTP 层统一遮蔽 key、响应缓存与 QPS 限速、错误码翻译。

[0.1.6]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TsuyuzakiFarm/dsh-amap-trip/releases/tag/v0.1.0
