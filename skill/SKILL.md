---
name: amap-trip
description: 高德出行助手（日常 / 工作双模式）。路径规划、沿线走廊检索（点位+里程+偏离）、路线分段、POI 检索、交通态势、偏好记忆。日常用于吃玩购行程编排，工作用于沿线地理要素摸底（人员密集/应急力量/补给维修/交通枢纽）。
whenToUse: 用户提到出行、行程、路线、自驾、沿线、沿途、勘察、踩点、途经点、里程、要素清单，或需要按口味/节奏安排一天安排时。
---

# amap-trip · 高德出行助手

## 0. 铁律：先读模式，再动手

**每个会话第一次涉及出行任务时，第一步必须调用 `amap_mode`（action=get）。**

- `daily`（日常）：允许个性化建议，读 `daily.md` 偏好；类别预设 `food/sight/shop/fun/rest`。
- `ops`（工作）：只输出可核验事实，不写"推荐/适合"这类评价，也不出现"稳控/布控/设防"等结论词；类别预设 `crowd/emergency/supply/transit`。

模式不一致时**先问一句再切**（`amap_mode {action:"set", mode:"..."}`），不要静默切换。两套偏好文件物理隔离：ops 模式读不到 daily 偏好，反之亦然。

## 1. 工具

| 工具 | 用途 | 要点 |
|---|---|---|
| `amap_diagnose` | 自检 | key 来源、各接口可用性、缓存统计。任何异常先跑它 |
| `amap_geocode` | 地名↔坐标 | 地址要带城市；交叉口用"XX路与YY路交叉口"提高命中 |
| `amap_route` | 路径规划 v5 | 返回多条备选；几何落盘，只回摘要 |
| `amap_poi` | POI 检索 | `source=v3` 带评分/人均/电话（日常用）；`source=v5` 支持 types/城市限定（工作用） |
| `amap_traffic` | 交通态势 | 矩形范围；返回整体评价 + 按拥堵排序的路段 |
| `amap_weather` | 天气实况 | 城市名或 adcode；行程与户外作业前先看一眼 |
| `amap_corridor` | **走廊检索** | 给起终点 → 采样 → "里程+偏离"清单 + 路线分段表；CSV 落盘。可选 `road`+`city`（把某条路锚定成途经点）、`withTraffic`（按路名叠加实时路况）、`withWeather`、`sort=rating`（日常按评分排） |
| `amap_map` | **出图** | 把路线+点位渲染成 HTML 地图（内置 JSAPI 埋点与 appname 铁律，产物落到工作区 `amap-jsapi/`） |
| `amap_mode` | 读/切模式 | 默认类别与参数来自当前模式的偏好文件 |
| `amap_pref` | 偏好记忆 | 仅当前模式；`read/append/forget`；写入需用户明确表达长期偏好 |

## 2. 日常模式工作流

1. `amap_mode` 读模式；`amap_pref {action:"read"}` 读偏好（口味/节奏/预算/常去地点）。
2. 补齐缺失约束（日期时间、人数、交通方式、可接受总时长、忌口），缺一个问一个，不要自行假设。
3. 用 `amap_route` 定骨架（起终点 + 途经点），看备选与耗时。
4. 用 `amap_corridor`（preset=daily）沿路找吃/玩/补给；按里程顺序挑选，注意营业时间与折返。
5. 出**时间轴行程单**（见 `templates/itinerary.md`）：每站到达/离开时间、停留时长、车程、备选、以及"为什么选它"（引用偏好里的原话）。
6. 用户说"太赶""换一家"时**增量重跑**：只改参数重调对应工具，不要重推演全案。
7. 用户明确表达长期偏好时才 `amap_pref append`（例如"以后超过 2 小时我都坐高铁"）。写前把要写的内容念给用户确认。

## 3. 工作模式工作流

1. `amap_mode` 读模式；`amap_pref {action:"read"}` 取默认类别/走廊宽度/步长/排序。
2. 确认输入：起终点（地址或坐标）、走廊宽度、类别集合、是否需要交通态势叠加。**不要追问与任务无关的个人信息**。
3. `amap_corridor` 出两份产物：`corridor-*.csv`（点位：里程/偏离/类别/名称/地址/坐标/电话）与 `route-nodes-*.csv`（分段：起止里程/长度/路名/标签/转向指令）。
4. 需要路况时叠加 `amap_traffic`（把路线包围盒作为矩形），把"慢/堵"路段与分段表按**路名**对齐。
5. 输出用 `templates/survey-table.md` 的表头，**只列事实**：里程、偏离、类别、名称、地址、坐标、电话、备注（数据时间）。
6. 结尾固定标注：数据来自高德公开 POI 库、查询时间、以及"地址为登记地址，现场需核实"。

## 4. 输入安全（写进流程，不阻断）

只接受公开地名/坐标。若用户输入了车牌号、人名、单位番号、警卫时间表、内部代号等，**提醒一次**"这类信息不必进入查询"，不要写进任何查询参数、不要落盘到 CSV、不要写进偏好文件。

## 5. 可视化交接（复用现有 amap-jsapi-skill）

**首选：直接调 `amap_map`** —— 它已经把下面 4 条铁律内置好了（自动发埋点、回调首行设 appname、产物写工作区 `amap-jsapi/`、自动读 JSAPI 凭据）。
只有在需要自定义页面（图层、时间轴侧栏、交互）时才手写 JSAPI 代码，并走 `amap-jsapi-skill`，遵守它的铁律：

1. 生成 JSAPI 页面前，先发一次埋点：`curl -s "https://restapi.amap.com/v3/log/init?eventId=skill.call&s=rsv3&product=skill_openclaw&platform=JS&label=generate-code&value=call"`
2. `AMapLoader.load().then((AMap) => { AMap.getConfig().appname = 'amap-jsapi-skill'; ... })` 必须是回调第一行。
3. 产物放进工作区 `amap-jsapi/` 目录，文件名 kebab-case。
4. Web端 key 与安全密钥从 `~/.dsh/.env` 的 `AMAP_JSAPI_KEY` / `AMAP_SECURITY_JS_CODE` 取；**不要**把 Web服务 key 写进前端页面。

## 6. 产物与路径

- 插件数据目录：`~/.dsh/amap-trip/`（`profiles/` 偏好、`cache/` HTTP 缓存、`out/` 落盘结果）
- 大结果一律落盘，工具只回摘要；CSV 用 UTF-8 无 BOM，逗号分隔，字段已在表头声明。

## 7. 常见故障

| 现象 | 含义与处置 |
|---|---|
| `10009 USERKEY_PLAT_NOMATCH` | key 未开通 Web服务 平台（Web端 JS API key 不能做服务端调用） |
| `10003` | 当日配额用尽，次日恢复 |
| `10004` | 触发 QPS 限制，插件会自动退避重试；仍失败则降低采样密度 |
| 结果为空 | 检查 types 是否为高德编码（见 `references/ops.md` 已实测码表） |
