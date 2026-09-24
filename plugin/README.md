# amap-trip 🗺

**DSH 双模式高德出行助手** —— 日常出行（吃/玩/购/歇脚）与沿线要素摸底（人员密集 / 应急 / 补给 / 枢纽）共用一套工具面。

| 项目 | 说明 |
| --- | --- |
| 形态 | 标准 DSH 插件包（`dsh.plugin`），纯 ESM，无构建步骤 |
| 工具 | 10 个：`amap_diagnose` / `amap_geocode` / `amap_route` / `amap_corridor` / `amap_map` / `amap_poi` / `amap_traffic` / `amap_weather` / `amap_mode` / `amap_pref` |
| 需要 | DSH `>= 0.1.5-rc.2`（已在 `0.1.7-rc.1` 上验证）、Node `>= 22`、高德 **Web 服务** key |
| 同伴 | skill `amap-trip`（把工具用法、双模式口径、产出约定交给模型） |
| 许可 | MIT |

## 一、安装

### 1. 准备 key

在 `~/.dsh/.env` 里写一行（或设成环境变量）：

```env
AMAP_WS_KEY=你的高德Web服务key
```

key 必须是**Web 服务**类型（不是 Web 端 JS API key）。插件按
`Config.keyNames` 的顺序找，找不到就由 `amap_diagnose` 明确报出来。
凭据解析顺序：显式 `Config.wsKey` → `.env` 文件 → `process.env`。

### 2. 挂进 profile

把本目录软链进 profile 的 `node_modules`，再在 profile 的 `cordis.patch.yml` 里插一行：

```yaml
- insert:
    - id: amap-trip
      name: 'amap-trip'
      config:
        envFile: '/home/你/.dsh/.env'
```

或者以 `link:` 依赖装进 profile：

```bash
cd ~/.dsh/profiles/web
pnpm add link:/path/to/amap-trip
```

**装完重启 DSH**：补丁层变更要重新组合。

### 3. 自检

对模型说「跑一下 amap_diagnose」，或在任意会话里让它调用该工具。
它会逐项报告凭据来源、地理编码 / 逆地理 / 路径规划 / POI(v3+v5) / 路况 / 天气的探针结果。

## 二、配置项

全部可调参数都在 `index.mjs` 的 `Config`（Schemastery schema，带默认值与校验）里，profile 的 patch 行可逐项覆盖：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `envFile` | `~/.dsh/.env` | 读 key 的 env 文件 |
| `wsKey` | `''` | 直接给 key（优先于 envFile） |
| `keyNames` | `['AMAP_WS_KEY','AMAP_WEB_SERVICE_KEY']` | 在 env 里找哪些名字 |
| `stateDir` | `~/.dsh/amap-trip` | 模式与偏好落盘目录 |
| `cacheDir` | `~/.dsh/amap-trip/cache` | 接口缓存 |
| `presetsDir` | 包内 `presets/` | 类别预设（`daily.json` / `ops.json`） |
| `workspaceDir` | `process.cwd()` | 产物落盘的基准目录 |
| `outSubdir` | `amap-trip-production` | 工作区下的产物子目录 |
| `defaultMode` | `daily` | 未显式切换时的模式 |
| `allowSavedEndpoints` | `false` | 是否允许使用偏好里存的起终点 |
| `timeoutMs` / `minIntervalMs` / `retries` | 20000 / 250 / 2 | 请求超时、限流间隔、重试次数 |
| `corridor.*` | 500 / 300 / 120 / 25 | 走廊采样步长、半径、采样上限、分页大小 |

## 三、产物

- 走廊清单落成 CSV，路线几何落成 JSON，二者都写到 `<workspaceDir>/<outSubdir>/`。
- `amap_map` 渲染可本地打开的 HTML 地图（高德 JSAPI v2），同样落在该目录。

## 四、更新日志

### 0.1.5（2026-09-24）适配 DSH 0.1.7-rc.1

- **删掉包内 `node_modules/@deepseek-ai/schemastery` 软链**。它原来指向
  `/home/<user>/.npm/_npx/<hash>/node_modules/...`——npx 缓存目录名是内容哈希，
  重装一次 DSH 就断；而且按 0.1.7-rc.1 的新解析规则，**linked 插件自己的
  `node_modules` 会遮蔽宿主实例**，容易拿到第二份 schemastery。
  现在按官方约定在 `peerDependencies` + `devDependencies` 里声明
  `@deepseek-ai/schemastery: ~3.18.4`，运行时用宿主那一份
- **补 `peerDependencies["@deepseek-ai/dsh"]: ">=0.1.5-rc.2"`**：0.1.7-rc.1 新增的
  「插件兼容性预检」读的正是这个字段（`dsh.engines` 那种自造字段它不认）
- `files` 补上 `README.md`
- 兼容性验证：真实 `0.1.7-rc.1` 进程内探针确认 10 个工具全部注册、`Config`
  校验通过、工具定义形状（`parameters` / `output.schema` / `output.render` /
  `execute`）与内核一致

### 0.1.4

- 10 工具 + 双模式 + 走廊检索的当前形态。

## 五、许可

MIT
