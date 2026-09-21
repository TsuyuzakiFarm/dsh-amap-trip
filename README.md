# dsh-amap-trip

高德地图出行助手：一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件 + skill。
**日常模式**编排行程（吃/玩/购/休），**工作模式**做沿线地理要素摸底（路口桥隧/人员密集/应急力量/补给维修）。两套偏好物理隔离，可一键切换。

> A dual-mode Amap (Gaode Maps) assistant for DeepSeek Harness — itinerary planning for daily life, along-route geographic asset surveys for field work.

## 功能

- **10 个工具**：`amap_diagnose` `amap_geocode` `amap_route` `amap_poi` `amap_traffic` `amap_weather` `amap_corridor` `amap_map` `amap_mode` `amap_pref`
- **走廊检索**：给定起终点 → 沿路线按步长采样 → 逐点检索指定类别 → 去重 → 计算每个点位的**里程桩号与垂直偏离** → 出 CSV；同时产出**路线分段表**（起止里程 / 路名 / 路口·桥隧标签 / 实时路况）
- **道路锚定**：`road` + `city` 把一个道路名解析成锚定途经点，让路线贴着指定道路走
- **出图**：`amap_map` 生成可直接打开的 HTML 地图（路线 polyline + 点位 + 里程列表）
- **双模式与偏好记忆**：`daily.md` / `ops.md` 两套文件互不可见；工作模式默认不保存起终点
- **工程特性**：零运行时依赖（除 `@deepseek-ai/schemastery`）、响应缓存、QPS 限速与退避重试、`exec.signal` 取消透传、**HTTP 层统一遮蔽 key**（高德错误响应会回显 key）

## 快速开始

### 1. 准备高德 key

| key | 平台 | 用途 |
|---|---|---|
| `AMAP_WS_KEY` | Web**服务** | 服务端查询：地理编码 / 路径规划 / POI / 路况 / 天气 |
| `AMAP_JSAPI_KEY` + `AMAP_SECURITY_JS_CODE` | Web端(JS API) | 仅 `amap_map` 出图用 |

写入 `~/.dsh/.env`。两个平台是分开的：Web端 key 调服务端接口会报 `10009 USERKEY_PLAT_NOMATCH`。

### 2. 安装

**方式 A（推荐，本机脚本）**

```bash
git clone git@github.com:TsuyuzakiFarm/dsh-amap-trip.git
bash dsh-amap-trip/scripts/install.sh
```

脚本会：把 `plugin/` 部署到 `<profile>/plugins/amap-trip/` → 写入 `link:` 依赖并建立 `node_modules` 软链 → 在 profile 的 `cordis.patch.yml` 挂载包名 → 安装 skill 到 `~/.dsh/skills/amap-trip/`。重启 DSH 生效。

**方式 B（手工）**：把 `plugin/` 放到 `<profile>/plugins/amap-trip/`，然后在 profile 的 `cordis.patch.yml` 里挂载包名 `amap-trip`，并让该名字可解析（写进 profile 的 `package.json` 依赖 + `node_modules/amap-trip` 软链）。

> ⚠️ 包必须放在 **profile 树内**（`~/.dsh/profiles/<profile>/plugins/amap-trip/`）：插件 `import '@deepseek-ai/schemastery'`，只有该目录链能解析到 DSH 自带的 `@deepseek-ai/*` 包。

### 3. 自检

让助手调用 `amap_diagnose`，应看到 7 项探针全 ✓，并打印生效配置。

## 配置（`Config`，Schemastery schema）

| 字段 | 默认 | 说明 |
|---|---|---|
| `envFile` | `~/.dsh/.env` | 凭据文件 |
| `wsKey` | 空 | 直接给 key（优先于文件） |
| `keyNames` | `AMAP_WS_KEY, AMAP_WEB_SERVICE_KEY` | 查找顺序 |
| `stateDir` | `~/.dsh/amap-trip` | 模式状态与偏好文件 |
| `cacheDir` / `outDir` | `~/.dsh/amap-trip/{cache,out}` | 缓存与落盘 |
| `presetsDir` | `<包目录>/presets` | 类别预设 JSON |
| `workspaceDir` | 进程 cwd | `amap_map` 产物写到 `<workspaceDir>/amap-jsapi/` |
| `defaultMode` | `daily` | 默认模式 |
| `allowSavedEndpoints` | `false` | 工作模式是否允许把起终点写进偏好 |
| `timeoutMs` / `minIntervalMs` / `retries` | 20000 / 250 / 2 | HTTP 行为 |
| `bigBytes` | 4096 | 超过即落盘，只回摘要 |
| `corridor.{stepM,radiusM,maxSamples,pageSize}` | 500 / 300 / 120 / 25 | 走廊检索默认值 |

## 用法示例

**日常**：`周六带爸妈去郊外，午饭想吃清淡的，来回不超过 3 小时车程`

助手会：读偏好 → 定骨架路线 → `amap_corridor {preset:"daily", categories:["food","sight"], sort:"rating"}` → 出时间轴行程单。

**工作**：`从 A 路口到 B 路口，沿线 500 米内的路口/学校/商场/派出所，按里程给地址（叠加实时路况）`

助手会：`amap_corridor {preset:"ops", radiusM:500, withTraffic:true}` → 点位表 + 分段表两份 CSV（`~/.dsh/amap-trip/out/`），需要时 `amap_map` 出图。

## 类别预设

`presets/ops.json`（可自行增改）：

| 键 | 含义 | 高德类型码（已实测） |
|---|---|---|
| `crowd` | 人员密集 | 141200 学校 · 141400 体育场馆 · 080100 运动场馆 · 080600 影剧院 · 060100 商场 · 060400 超市 · 060700 综合市场 · 150500 地铁站 · 150700 公交站 |
| `emergency` | 应急力量 | 090100 医院 · 090200 专科 · 090300 诊所 · 130500 公检法（130501 派出所、130504 消防） · 200400 紧急避难场所 |
| `supply` | 补给维修 | 010100 加油站 · 011100 充电站 · 010400 汽车维修养护 |
| `transit` | 交通枢纽 | 1501xx–1507xx |

`presets/daily.json`：`food` 050000 · `sight` 110000 · `shop` 060000 · `fun` 080000 · `rest` 100000。

> 高德类型码是**层级码**：写 `050000` 会覆盖 `0503xx`。已实测踩坑：`080300` 是娱乐场所（含酒吧）不是影剧院；消防在 `130500` 下（`130504`）。

## 安全与合规

- 高德错误响应会**原样回显 key**；本插件在 HTTP 层统一遮蔽，日志与落盘都不会出现明文 key。
- `amap_map` 生成的 HTML **内嵌** `AMAP_SECURITY_JS_CODE`（本地开发约定）：只在本机打开，不要上传或转发；对外发布请改成服务端代理。
- 点位与地址来自高德公开 POI 库，存在滞后与误差，现场需核实。
- **不要**把车牌、人名、单位、时间表等敏感信息作为查询参数送入任何公网地图接口。

## 目录结构

```
plugin/           # DSH 插件包（package.json 在此，作为安装单元）
  index.mjs       # 10 个工具注册 + Config
  core.mjs        # 凭据 / HTTP / 缓存 / 错误翻译 / 查询原语
  corridor.mjs    # 采样 · 里程偏离 · 类别归类 · 路线分段 · CSV
  prefs.mjs       # 模式状态与两套偏好文件
  presets/        # 类别预设 JSON
skill/            # DSH skill（SKILL.md + references + templates）
scripts/          # 安装脚本与探针/测试
docs/             # 接口实测记录
```

## 开发

```bash
node scripts/probe.mjs .            # 探活：凭据来源 + 各接口可用性
node scripts/test-plugin.mjs .      # 假 ctx 端到端跑查询类工具
node scripts/test-corridor.mjs .    # 走廊检索 + 类别码校验
bash scripts/install.sh             # 部署到本机 DSH profile
```

## 已知限制

- 交通事件（施工/管制）接口未接入：未找到公开的 Web 服务路径。
- 长路线走廊检索受日配额与 QPS 约束，默认 120 个采样点上限；长路线请分段跑。
- 工作模式类别预设偏宽（健身工作室会落入"人员密集"、诊所会落入"应急力量"），可按任务在 `presets/ops.json` 里收窄。

## License

[MIT](LICENSE)
