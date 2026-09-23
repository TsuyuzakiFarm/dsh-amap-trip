// amap-trip · DSH 插件（第一方）
// 规范：Config 用 Schemastery（默认值+校验）；ctx.tools.register 注册即效果；
// exec.signal 全链路透传；可调常量全部进 Config。
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { AmapClient, resolveCredential, parseEnv } from './core.mjs'
import { corridorSearch, nodesFromRoute, resolveCategories, classify, toCsv, CATEGORY_PRESETS } from './corridor.mjs'
import { getMode, setMode, readPrefs, appendPref, forgetPref, ensureProfile } from './prefs.mjs'
import { buildMapHtmlV2 } from './map-html.mjs'

export const name = 'amap-trip'
export const inject = ['tools']

const HOME = process.env.HOME || ''
const HERE = dirname(fileURLToPath(import.meta.url))

/** 插件配置：默认值写在 schema 字段上，由 Cordis 校验并填充。 */
export const Config = Schema.object({
  envFile: Schema.string().default(join(HOME, '.dsh/.env')),
  wsKey: Schema.string().default(''),
  keyNames: Schema.array(Schema.string()).default(['AMAP_WS_KEY', 'AMAP_WEB_SERVICE_KEY']),
  stateDir: Schema.string().default(join(HOME, '.dsh/amap-trip')),
  cacheDir: Schema.string().default(join(HOME, '.dsh/amap-trip/cache')),
  outDir: Schema.string().default(''),
  outSubdir: Schema.string().default('amap-trip-production'),
  presetsDir: Schema.string().default(join(HERE, 'presets')),
  workspaceDir: Schema.string().default(process.cwd()),
  defaultMode: Schema.union(['daily', 'ops']).default('daily'),
  allowSavedEndpoints: Schema.boolean().default(false),
  timeoutMs: Schema.number().default(20000),
  minIntervalMs: Schema.number().default(250),
  retries: Schema.number().default(2),
  bigBytes: Schema.number().default(4096),
  corridor: Schema.object({
    stepM: Schema.number().default(500),
    radiusM: Schema.number().default(300),
    maxSamples: Schema.number().default(120),
    pageSize: Schema.number().default(25)
  }).default({ stepM: 500, radiusM: 300, maxSamples: 120, pageSize: 25 })
})

function text(s) { return [{ type: 'text', text: String(s) }] }

/** 极简 CSV 解析（支持双引号包裹与 "" 转义）。 */
function splitCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  const s = String(text)
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.length > 1 || (r[0] || '').trim())
}

/** 生成 JSAPI 页面（appname 铁律写在回调第一行）。 */
/** 产出目录解析：优先当前会话的工作区，其次配置，最后进程 cwd。 */
function resolveWorkdir(cfg, exec) {
  const s = exec && exec.agent && exec.agent.session
  const candidates = [
    ['会话 cwd', s && s.cwd],
    ['会话 cwd(meta)', s && s.meta && s.meta.cwd],
    ['配置 workspaceDir', cfg.workspaceDir],
    ['进程 cwd', process.cwd()]
  ]
  for (const pair of candidates) {
    const v = pair[1]
    if (typeof v === 'string' && v.trim()) return { base: v.trim(), src: pair[0] }
  }
  return { base: process.cwd(), src: '进程 cwd' }
}

function outputsFor(cfg, exec) {
  if (cfg.outDir && String(cfg.outDir).trim()) {
    const d = String(cfg.outDir).trim()
    return { base: d, src: '配置 outDir（绝对路径覆盖）', outDir: d, mapDir: d }
  }
  const w = resolveWorkdir(cfg, exec)
  const outDir = join(w.base, cfg.outSubdir)
  return { base: w.base, src: w.src, outDir: outDir, mapDir: outDir }
}

function saveBig(s, outDir, tag, bigBytes) {
  if (s.length <= bigBytes) return s
  try {
    mkdirSync(outDir, { recursive: true })
    const p = join(outDir, tag + '-' + Date.now() + '.json')
    writeFileSync(p, s)
    return s.slice(0, 1200) + '\n... (完整内容已落盘: ' + p + ', ' + s.length + ' 字节)'
  } catch (e) { return s.slice(0, bigBytes) }
}

function makeClient(cfg, signal) {
  const cred = cfg.wsKey
    ? { key: cfg.wsKey, source: 'config:wsKey' }
    : resolveCredential({ envFile: cfg.envFile, names: cfg.keyNames })
  const client = new AmapClient({
    key: cred.key, cacheDir: cfg.cacheDir, timeoutMs: cfg.timeoutMs,
    minIntervalMs: cfg.minIntervalMs, retries: cfg.retries, signal
  })
  return { client, cred }
}

/** 预设：优先读 presetsDir 下的 json，缺文件回退到内置默认（保证新装即可用）。 */
function loadPresets(cfg) {
  const out = { ops: Object.assign({}, CATEGORY_PRESETS.ops), daily: Object.assign({}, CATEGORY_PRESETS.daily) }
  for (const m of ['ops', 'daily']) {
    try {
      const p = join(cfg.presetsDir, m + '.json')
      if (existsSync(p)) out[m] = Object.assign(out[m], JSON.parse(readFileSync(p, 'utf8')))
    } catch (e) { /* 读不动就用内置默认 */ }
  }
  return out
}

/** 地址或 "lng,lat" → 坐标串。 */
function makeResolver(client) {
  const isCoord = (s) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(String(s).trim())
  return async (s) => {
    if (isCoord(s)) return String(s).trim()
    const g = await client.geocode(String(s))
    if (!g.length) throw new Error('无法解析地点: ' + s)
    return g[0].location
  }
}

function fail(e) {
  if (e && e.name === 'AmapError') return '✗ ' + e.message + (e.infocode ? ' (infocode=' + e.infocode + ')' : '')
  if (e && e.code) return '✗ ' + String(e.message || e)
  return '✗ ' + String((e && e.message) || e)
}

export function apply(ctx, config) {
  const cfg = Config(config || {})
  const presets = loadPresets(cfg)

  ctx.tools.register({
    name: 'amap_diagnose',
    description: '检查高德凭据与各接口可用性（凭据来源、地理编码/路径规划/POI/路况/天气探针）。排查 key 平台权限或网络问题时先跑它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      const lines = []
      const { client, cred } = makeClient(cfg, exec.signal)
      lines.push('配置: mode=' + getMode(cfg.stateDir, cfg.defaultMode) + ' | presets=' + cfg.presetsDir + ' | env=' + cfg.envFile)
      const wd = resolveWorkdir(cfg, exec)
      lines.push('产物目录: ' + join(wd.base, cfg.outSubdir) + '（工作区来源: ' + wd.src + '，可通过 Config.workspaceDir 覆盖）')
      lines.push('凭据: ' + (cred.key ? '已找到, 来源=' + cred.source + ', 长度=' + cred.key.length : '✗ 未找到（设置 AMAP_WS_KEY 或 Config.wsKey）'))
      if (!cred.key) return lines.join('\n')
      const probe = async (label, fn) => {
        try { const r = await fn(); lines.push('✓ ' + label + ': ' + r) } catch (e) { lines.push('✗ ' + label + ': ' + fail(e)) }
      }
      const g = []
      await probe('地理编码', async () => { const r = await client.geocode('北京市朝阳区阜通东大街6号', '北京'); g.push(r[0]); return (r[0] && r[0].location) || '空结果' })
      await probe('逆地理编码', async () => { const r = await client.regeocode('116.481028,39.989643'); return r.address })
      await probe('路径规划 v5', async () => { const o = (g[0] && g[0].location) || '116.481028,39.989643'; const r = await client.route({ origin: o, destination: '116.397428,39.90923' }); return '备选=' + r.length + ' 距离=' + r[0].distanceM + 'm 用时=' + r[0].durationS + 's 点=' + r[0].pointCount })
      await probe('POI v5', async () => { const o = (g[0] && g[0].location) || '116.481028,39.989643'; const r = await client.poi({ source: 'v5', around: { location: o, radius: 800 }, types: '141200', pageSize: 3 }); return '命中=' + r.count + ' 返回=' + r.pois.length })
      await probe('POI v3(富字段)', async () => { const o = (g[0] && g[0].location) || '116.481028,39.989643'; const r = await client.poi({ source: 'v3', around: { location: o, radius: 800 }, types: '050000', pageSize: 3 }); return '返回=' + r.pois.length + ' 首条评分=' + JSON.stringify(r.pois[0] && r.pois[0].rating) })
      await probe('交通态势', async () => { const r = await client.trafficRectangle('116.35,39.88;116.42,39.93', 6); return '路段=' + r.roads.length + ' 评价=' + (r.evaluation ? r.evaluation.description : '-') })
      await probe('天气', async () => { const w = await client.weather('110101'); return w.city + ' ' + w.weather + ' ' + w.temperature + 'C' })
      lines.push('缓存目录: ' + cfg.cacheDir + ' | 调用统计: ' + JSON.stringify(client.stats))
      return lines.join('\n')
    }
  })

  ctx.tools.register({
    name: 'amap_geocode',
    description: '地名 → 坐标（可含城市限定）。返回格式化地址、坐标(GCJ-02)、匹配级别。批量请多次调用。',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: '结构化地址，如「北京市朝阳区阜通东大街6号」' },
        city: { type: 'string', description: '限定城市（可选，中文/城市名/adcode）' }
      },
      required: ['address'],
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const { client, cred } = makeClient(cfg, exec.signal)
        if (!cred.key) return '✗ 未找到高德 Web 服务 key（AMAP_WS_KEY），先跑 amap_diagnose'
        const r = await client.geocode(args.address, args.city)
        if (!r.length) return '无匹配结果'
        return r.map((x, i) => (i + 1) + '. ' + x.address + '\n   坐标: ' + x.location + ' | 级别: ' + x.level + ' | adcode: ' + (x.adcode || '')).join('\n')
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_route',
    description: '路径规划（v5）：driving/walking/bicycling。返回各备选方案的距离/用时/步数与转向级分段；完整几何落盘。',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '起点：地址或 "lng,lat"' },
        destination: { type: 'string', description: '终点：地址或 "lng,lat"' },
        waypoints: { type: 'array', items: { type: 'string' }, description: '途经点数组（可选，地址或坐标）' },
        mode: { type: 'string', enum: ['driving', 'walking', 'bicycling'], description: '出行方式，默认 driving' },
        strategy: { type: 'string', description: '驾车算路策略（可选，v5 策略号）' }
      },
      required: ['origin', 'destination'],
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const { client, cred } = makeClient(cfg, exec.signal)
        if (!cred.key) return '✗ 未找到高德 Web 服务 key（AMAP_WS_KEY）'
        const toCoord = makeResolver(client)
        const origin = await toCoord(args.origin)
        const destination = await toCoord(args.destination)
        const wps = []
        for (const w of args.waypoints || []) wps.push(await toCoord(w))
        const paths = await client.route({ origin, destination, waypoints: wps.length ? wps : undefined, mode: args.mode, strategy: args.strategy })
        if (!paths.length) return '无规划结果'
        const lines = []
        paths.forEach((p, i) => {
          lines.push((i + 1) + '. 距离 ' + (p.distanceM / 1000).toFixed(1) + ' km | 用时 ' + Math.round(p.durationS / 60) + ' 分钟 | 过路费 ' + p.tolls + ' 元 | 红绿灯 ' + p.trafficLights + ' | 分段 ' + p.steps.length + ' | 几何点 ' + p.pointCount)
          const head = p.steps.slice(0, 6).map((s) => '   - ' + (s.road ? s.road + ': ' : '') + s.instruction + ' (' + s.distanceM + 'm)')
          lines.push(head.join('\n'))
          if (p.steps.length > 6) lines.push('   ... 其余 ' + (p.steps.length - 6) + ' 段已省略')
        })
        const geo = { generatedAt: new Date().toISOString(), paths: paths.map((p) => ({ distanceM: p.distanceM, durationS: p.durationS, points: p.points })) }
        const outs = outputsFor(cfg, exec)
        const saved = saveBig(JSON.stringify(geo), outs.outDir, 'route', cfg.bigBytes)
        if (saved.indexOf('已落盘') > 0) lines.push('几何数据: ' + saved.slice(saved.indexOf('已落盘')))
        else lines.push('几何数据(点数少，直接给出): ' + saved.slice(0, 300))
        return lines.join('\n')
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_poi',
    description: 'POI 检索。周边搜索给 location+radius；关键字搜索给 keywords+region。source=v3 返回评分/人均/电话（日常用），source=v5 支持 types/城市限定/更大分页（工作用）。',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '周边搜索中心点：地址或 "lng,lat"' },
        radius: { type: 'number', description: '周边搜索半径（米，默认 1000）' },
        keywords: { type: 'string', description: '关键字' },
        types: { type: 'string', description: 'POI 类型编码（高德分类码，如 141200 学校、050000 餐饮）' },
        region: { type: 'string', description: '关键字搜索的城市/区域限定' },
        source: { type: 'string', enum: ['v3', 'v5'], description: '接口版本，默认 v5' },
        pageSize: { type: 'number', description: '每页条数（默认 10，最大 25）' },
        page: { type: 'number', description: '页码（默认 1）' }
      },
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const { client, cred } = makeClient(cfg, exec.signal)
        if (!cred.key) return '✗ 未找到高德 Web 服务 key（AMAP_WS_KEY）'
        let center = args.location
        if (center && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(String(center).trim())) {
          const g = await client.geocode(String(center))
          if (!g.length) return '✗ 无法解析中心点: ' + center
          center = g[0].location
        }
        const around = center ? { location: center, radius: args.radius || 1000 } : null
        if (!around && !args.keywords) return '✗ 需要 location（周边）或 keywords（关键字）之一'
        const raw = await client.poi({ around, keywords: args.keywords, types: args.types, region: args.region, source: args.source, pageSize: Math.min(args.pageSize || 10, 25), page: args.page || 1 })
        if (!raw.pois.length) return '无结果（source=' + raw.source + '）'
        const lines = ['source=' + raw.source + ' 命中≈' + raw.count + ' 返回=' + raw.pois.length]
        raw.pois.forEach((p, i) => {
          const extra = [p.typecode, p.distanceM !== null ? p.distanceM + 'm' : '', p.rating ? '评分' + p.rating : '', p.cost ? '人均' + p.cost : '', p.tel || ''].filter(Boolean).join(' | ')
          lines.push((i + 1) + '. ' + p.name + '\n   ' + p.address + '\n   ' + p.location + ' | ' + extra)
        })
        return lines.join('\n')
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_traffic',
    description: '交通态势（按矩形范围）：整体拥堵评价 + 路段列表（名称/拥堵等级/速度/粗略几何）。矩形格式 "minLng,minLat;maxLng,maxLat"。',
    parameters: {
      type: 'object',
      properties: {
        rectangle: { type: 'string', description: '"minLng,minLat;maxLng,maxLat"' },
        level: { type: 'number', description: '道路等级过滤（默认 6=全部）' },
        top: { type: 'number', description: '返回最拥堵的前 N 条（默认 15）' }
      },
      required: ['rectangle'],
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const { client, cred } = makeClient(cfg, exec.signal)
        if (!cred.key) return '✗ 未找到高德 Web 服务 key（AMAP_WS_KEY）'
        const t = await client.trafficRectangle(args.rectangle, args.level)
        const rank = { '4': 4, '3': 3, '2': 2, '1': 1 }
        const roads = t.roads.slice().sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0) || (a.speed || 99) - (b.speed || 99))
        const lines = ['路段总数=' + t.roads.length + ' | 评价=' + (t.evaluation ? t.evaluation.description + ' (拥堵' + t.evaluation.congested + ')' : '-')]
        if (t.description) lines.push('概述: ' + String(t.description).slice(0, 200))
        for (const r of roads.slice(0, args.top || 15)) lines.push('- ' + r.name + ' | 等级' + r.status + ' | ' + (r.speed === null ? '?' : r.speed) + ' km/h | 方向' + (r.direction || '-') + ' | 几何点' + (r.polyline ? r.polyline.split(';').length : 0))
        return lines.join('\n')
      } catch (e) { return fail(e) }
    }
  })

  function prefsDefaults(cfg2, presets2) {
    const mode = getMode(cfg2.stateDir, cfg2.defaultMode)
    const p = readPrefs(mode, cfg2.stateDir)
    const one = (k) => ((p.sections[k] || [])[0] || '').trim()
    const names = one('默认类别').split(/[,，|]/).map((s) => s.trim()).filter(Boolean)
    return {
      mode,
      categories: names.length ? resolveCategories(mode, names, presets2) : [],
      radiusM: Number(one('走廊宽度（米）')) || cfg2.corridor.radiusM,
      stepM: Number(one('采样步长（米）')) || cfg2.corridor.stepM
    }
  }

  ctx.tools.register({
    name: 'amap_map',
    description: '把路线与点位渲染成一张本地可打开的 HTML 地图（高德 JSAPI v2）。遵守 amap-jsapi-skill 规范：生成前发一次埋点、回调首行设置 appname、产物写入工作区 amap-jsapi/ 目录。',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '起点（地址或坐标）；给 routeFile 时可省' },
        destination: { type: 'string', description: '终点（地址或坐标）；给 routeFile 时可省' },
        routeFile: { type: 'string', description: '可选：已落盘的路线 JSON（amap_route 的 route-*.json）' },
        markersFile: { type: 'string', description: '可选：点位 CSV（amap_corridor 的 corridor-*.csv）' },
        title: { type: 'string', description: '页面标题' }
      },
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const env = Object.assign({}, existsSync(cfg.envFile) ? parseEnv(readFileSync(cfg.envFile, 'utf8')) : {}, process.env)
        const jsKey = env.AMAP_JSAPI_KEY || ''
        const secCode = env.AMAP_SECURITY_JS_CODE || ''
        if (!jsKey) return '✗ 缺少 AMAP_JSAPI_KEY（HTML 地图用 Web端 JSAPI key，与 Web服务 key 不同平台）'

        const { client, cred } = makeClient(cfg, exec.signal)
        let points = []
        const title = args.title || '行程地图'
        if (args.routeFile) {
          const j = JSON.parse(readFileSync(args.routeFile, 'utf8'))
          points = (j.paths && j.paths[0] && j.paths[0].points) || []
        } else if (args.origin && args.destination) {
          if (!cred.key) return '✗ 未找到高德 Web 服务 key（用于算路线）'
          const toCoord = makeResolver(client)
          const paths = await client.route({ origin: await toCoord(args.origin), destination: await toCoord(args.destination) })
          points = (paths[0] && paths[0].points) || []
        }
        if (!points.length) return '✗ 没有可绘制的几何：给 routeFile，或给 origin + destination'

        const markers = []
        if (args.markersFile) {
          const text = readFileSync(args.markersFile, 'utf8')
          const rows = splitCsv(text)
          const head = rows[0] || []
          const iName = head.indexOf('name'), iLoc = head.indexOf('location'), iCat = head.indexOf('category'), iKm = head.indexOf('chainageKm')
          for (const r of rows.slice(1, 301)) {
            const loc = String((r[iLoc] || '')).trim()
            if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(loc)) continue
            markers.push({ name: r[iName] || '点', loc, cat: iCat >= 0 ? (r[iCat] || '') : '', km: iKm >= 0 ? (r[iKm] || '') : '' })
          }
        }

        // 铁律 1：生成 JSAPI 代码前发一次埋点
        try { await fetch('https://restapi.amap.com/v3/log/init?eventId=skill.call&s=rsv3&product=skill_openclaw&platform=JS&label=generate-code&value=call', { signal: AbortSignal.timeout(8000) }) } catch (e) {}

        const outs = outputsFor(cfg, exec)
        const mapDir = outs.mapDir
        mkdirSync(mapDir, { recursive: true })
        const file = join(mapDir, 'map-' + Date.now() + '.html')
        const html = buildMapHtmlV2({ title, key: jsKey, sec: secCode, route: points, markers })
        writeFileSync(file, html)
        return '✓ 已生成 HTML 地图: ' + file + '\n  路线点 ' + points.length + ' 个 | 标注 ' + markers.length + ' 个 | ' + html.length + ' 字节\n  产物目录: ' + outs.outDir + '（工作区来源: ' + outs.src + '）\n  凭据: JSAPI key 与安全密钥已按 amap-jsapi-skill 的本地约定内嵌，仅在本机打开，勿上传。'
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_weather',
    description: '天气查询（实况）：按城市名或 adcode 查当前天气，用于行程与户外作业的天气判断。',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名（如「北京市」）或 adcode（如 110101）' } },
      required: ['city'], additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const { client, cred } = makeClient(cfg, exec.signal)
        if (!cred.key) return '✗ 未找到高德 Web 服务 key'
        const w = await client.weather(args.city)
        if (!w.city) return '无结果（city 建议用 adcode 或「北京市」这类全称）'
        return [w.province, w.city, w.weather, w.temperature + 'C', '风 ' + (w.winddirection || '-') + ' ' + (w.windpower || '') + ' 级', '湿度 ' + (w.humidity || '-') + '%', '发布 ' + (w.reporttime || '-')].join(' | ')
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_mode',
    description: '查看或切换工作模式。daily=日常（吃玩购+个人偏好），ops=工作（人员密集/应急/补给/枢纽，中性事实清单）。模式决定默认类别、默认参数与偏好文件，两套偏好互不可见。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'], description: 'get=查看当前模式；set=切换（需给 mode）' },
        mode: { type: 'string', enum: ['daily', 'ops'], description: 'set 时的目标模式' }
      },
      required: ['action'],
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        if (args.action === 'set') {
          if (!args.mode) return '✗ set 需要 mode（daily | ops）'
          const s = setMode(cfg.stateDir, args.mode)
          const p = ensureProfile(args.mode, cfg.stateDir)
          const d = prefsDefaults(cfg, presets)
          const allSet = resolveCategories(args.mode, null, presets).map((c) => c.key + '(' + c.label + ')').join(' / ')
          return '✓ 已切换到 ' + s.mode + ' 模式\n偏好/默认值文件: ' + p + '\n生效默认: 类别=' + (d.categories.map((c) => c.key).join(',') || '(预设全部)') + ' | 走廊 ' + d.radiusM + 'm | 步长 ' + d.stepM + 'm\n可用类别: ' + allSet
        }
        const mode = getMode(cfg.stateDir, cfg.defaultMode)
        const p = ensureProfile(mode, cfg.stateDir)
        const d = prefsDefaults(cfg, presets)
        const allSet = resolveCategories(mode, null, presets).map((c) => c.key + '(' + c.label + ')').join(' / ')
        return '当前模式: ' + mode + '\n偏好文件: ' + p + '\n默认类别: ' + (d.categories.map((c) => c.key).join(',') || '(预设全部)') + '\n默认参数: 走廊 ' + d.radiusM + 'm | 步长 ' + d.stepM + 'm\n可用类别: ' + allSet
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_pref',
    description: '偏好记忆（仅当前模式的文件）：read/append/forget。只应在用户明确表达长期偏好时 append。跨模式写入会被拒绝——需要先 amap_mode 切换。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'append', 'forget'], description: 'read=读当前模式偏好；append=追加一条；forget=按关键词删除' },
        section: { type: 'string', description: 'append 时的分节名（如「口味与忌口」；不填则追加到文件末尾）' },
        text: { type: 'string', description: 'append 的内容（一句话）' },
        query: { type: 'string', description: 'forget 的关键词' },
        mode: { type: 'string', enum: ['daily', 'ops'], description: '可选：显式指定模式；与当前模式不一致时会被拒绝（防串味）' }
      },
      required: ['action'],
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const active = getMode(cfg.stateDir, 'daily')
        if (args.mode && args.mode !== active) {
          return '✗ 跨模式访问被拒绝：当前为 ' + active + ' 模式，请求的是 ' + args.mode + '。\n如需访问请先 amap_mode {action:"set", mode:"' + args.mode + '"}。'
        }
        if (args.action === 'read') {
          const p = readPrefs(active, cfg.stateDir)
          const lines = ['模式: ' + active + ' | 文件: ' + p.path]
          for (const k of Object.keys(p.sections)) {
            if (!p.sections[k].length) continue
            lines.push('## ' + k)
            for (const l of p.sections[k]) lines.push('  ' + l)
          }
          return lines.join('\n')
        }
        if (args.action === 'append') {
          if (!args.text) return '✗ append 需要 text'
          if (active === 'ops' && !cfg.allowSavedEndpoints && /起点|终点|出发地|目的地|地址|驻地|会场/.test(String(args.text))) {
            return '✗ 工作模式默认不保存起终点/地址类信息（Config.allowSavedEndpoints=false）。如需保存请显式打开该配置项。'
          }
          const r = appendPref(active, cfg.stateDir, args.section, args.text)
          return '✓ 已写入 ' + active + ' 偏好\n' + r.added + '\n文件: ' + r.path
        }
        if (args.action === 'forget') {
          const r = forgetPref(active, cfg.stateDir, args.query)
          return '✓ 已从 ' + active + ' 偏好中删除 ' + r.removed.length + ' 行' + (r.removed.length ? '\n' + r.removed.join('\n') : '') + '\n文件: ' + r.path
        }
        return '✗ 未知 action: ' + args.action
      } catch (e) { return fail(e) }
    }
  })

  ctx.tools.register({
    name: 'amap_corridor',
    description: '走廊检索：给起终点规划路线，沿路按步长采样检索指定类别点位，输出去重后的「里程+偏离」清单（CSV 落盘），并给出路线分段表（路口/桥隧口，带里程区间）。工作模式用于沿线要素摸底，日常模式用于沿途找吃/玩/补给。',
    parameters: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '起点：地址或 "lng,lat"' },
        destination: { type: 'string', description: '终点：地址或 "lng,lat"' },
        waypoints: { type: 'array', items: { type: 'string' }, description: '途经点（可选，地址或坐标）' },
        preset: { type: 'string', enum: ['ops', 'daily'], description: '类别预设，默认 ops' },
        categories: { type: 'array', items: { type: 'string' }, description: 'ops: crowd|emergency|supply|transit；daily: food|sight|shop|fun|rest（默认该预设全部）' },
        stepM: { type: 'number', description: '采样步长（米，默认 500）' },
        radiusM: { type: 'number', description: '走廊半径（米，默认 300）' },
        source: { type: 'string', enum: ['v3', 'v5'], description: 'POI 接口版本，默认 v5' },
        maxSamples: { type: 'number', description: '采样点上限（默认取配置）' },
        routeIndex: { type: 'number', description: '用第几条备选路线（默认 1）' },
        road: { type: 'string', description: '可选：想贴着走的道路名（如「G104」「阜通东大街」）。会解析成锚定途经点，几何仍由路径规划给出' },
        city: { type: 'string', description: '可选：道路名所在城市，提高解析命中' },
        withTraffic: { type: 'boolean', description: '可选：叠加实时路况（按路名对齐到分段表，并给拥堵摘要）' },
        withWeather: { type: 'boolean', description: '可选：叠加终点城市天气（日常出行用）' },
        sort: { type: 'string', enum: ['chainage', 'rating'], description: '点位排序：chainage=按里程（默认，工作用）；rating=按评分（日常用）' }
      },
      required: ['origin', 'destination'],
      additionalProperties: false
    },
    output: { schema: { type: 'string' }, render: (a, v) => text(v) },
    async execute(args, exec) {
      try {
        const { client, cred } = makeClient(cfg, exec.signal)
        if (!cred.key) return '✗ 未找到高德 Web 服务 key（AMAP_WS_KEY）'
        const toCoord = makeResolver(client)
        const origin = await toCoord(args.origin)
        const destination = await toCoord(args.destination)
        const wps = []
        for (const w of args.waypoints || []) wps.push(await toCoord(w))
        let roadAnchor = ''
        if (args.road) {
          const g = await client.geocode((args.city ? args.city + ' ' : '') + args.road)
          if (g.length) { wps.push(g[0].location); roadAnchor = g[0].location + '（' + g[0].address + '）' }
          else roadAnchor = '未解析到，已忽略（路线按起终点规划）'
        }
        const paths = await client.route({ origin, destination, waypoints: wps.length ? wps : undefined })
        if (!paths.length) return '✗ 无规划结果'
        const idx = Math.min(Math.max((args.routeIndex || 1) - 1, 0), paths.length - 1)
        const path = paths[idx]
        const d = prefsDefaults(cfg, presets)
        const preset = args.preset || d.mode
        const wantCats = args.categories && args.categories.length
          ? args.categories
          : (args.preset ? null : d.categories.map((c) => c.key))
        const cats = resolveCategories(preset, wantCats, presets)
        const types = Array.from(new Set(cats.map((c) => c.types).join('|').split('|'))).join('|')
        const res = await corridorSearch(client, {
          points: path.points, stepM: args.stepM || d.stepM, radiusM: args.radiusM || d.radiusM,
          source: args.source || (preset === 'daily' ? 'v3' : 'v5'), pageSize: cfg.corridor.pageSize, types, categories: cats,
          maxSamples: args.maxSamples || cfg.corridor.maxSamples, signal: exec.signal
        })
        const nodes = nodesFromRoute(path)
        const rows = res.rows.map((r) => { const k = classify(r.typecode, cats); return Object.assign({}, r, { category: (cats.find((c) => c.key === k) || {}).label || k, chainageKm: (r.chainageM / 1000).toFixed(2) }) })
        if (args.sort === 'rating') rows.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || a.deviationM - b.deviationM)

        let weatherLine = ''
        if (args.withWeather) {
          try {
            const rg = await client.regeocode(destination)
            const comp = rg.component || {}
            const pick = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''))
            const city = pick(comp.adcode) || pick(comp.city) || pick(comp.province) || ''
            const w = city ? await client.weather(city) : null
            weatherLine = w && w.city ? (w.city + ' ' + w.weather + ' ' + w.temperature + 'C 风' + (w.winddirection || '-') + (w.windpower || '') + '级') : '未取到'
          } catch (e) { weatherLine = '未取到（' + String((e && e.message) || e) + '）' }
        }

        // 可选：叠加实时路况，并按"路名"对齐到分段表（不是按坐标比对）
        let traffic = null
        if (args.withTraffic) {
          const lngs = path.points.map((p) => p[0])
          const lats = path.points.map((p) => p[1])
          const rect = Math.min.apply(null, lngs) + ',' + Math.min.apply(null, lats) + ';' + Math.max.apply(null, lngs) + ',' + Math.max.apply(null, lats)
          try { traffic = await client.trafficRectangle(rect, 6) } catch (e) { traffic = { error: String((e && e.message) || e), roads: [] } }
        }
        const statusText = { '1': '畅通', '2': '缓行', '3': '拥堵', '4': '严重拥堵' }
        const normRoad = (s) => String(s || '').replace(/[（(].*?[)）]/g, '').replace(/(辅路|主路|入口|出口)$/g, '').replace(/(大街|大道|路|街|桥)$/g, '').trim()
        if (traffic && traffic.roads && traffic.roads.length) {
          const idxRoad = new Map()
          for (const r of traffic.roads) {
            const key = normRoad(r.name)
            if (!key) continue
            const prev = idxRoad.get(key)
            if (!prev || (Number(r.status) || 0) > (Number(prev.status) || 0)) idxRoad.set(key, r)
          }
          for (const n of nodes) {
            const key = normRoad(n.road)
            if (!key) continue
            let hit = idxRoad.get(key)
            if (!hit) { for (const k2 of idxRoad.keys()) { if (k2 && (k2.indexOf(key) === 0 || key.indexOf(k2) === 0)) { hit = idxRoad.get(k2); break } } }
            if (hit) n.congestion = (statusText[hit.status] || hit.status) + ' ' + (hit.speed === null ? '?' : hit.speed) + ' km/h'
          }
        }
        const outs = outputsFor(cfg, exec)
        mkdirSync(outs.outDir, { recursive: true })
        const stamp = Date.now()
        const csvP = join(outs.outDir, 'corridor-' + stamp + '.csv')
        const nodeP = join(outs.outDir, 'route-nodes-' + stamp + '.csv')
        writeFileSync(csvP, toCsv(rows, ['chainageKm', 'deviationM', 'category', 'name', 'typecode', 'address', 'location', 'tel', 'rating', 'cost']))
        writeFileSync(nodeP, toCsv(nodes.map((n) => ({ fromKm: n.fromKm.toFixed(2), toKm: n.toKm.toFixed(2), lengthM: n.lengthM, road: n.road, tags: n.tags.join('/'), congestion: n.congestion || '', instruction: n.instruction })), ['fromKm', 'toKm', 'lengthM', 'road', 'tags', 'congestion', 'instruction']))
        const lines = []
        lines.push('模式: ' + d.mode + ' | 查询时间: ' + new Date().toLocaleString('zh-CN') + ' | 数据源: 高德公开数据')
        if (args.road) lines.push('锚定道路: ' + args.road + ' → ' + roadAnchor)
        if (args.withTraffic) {
          const jam = nodes.filter((n) => n.congestion && /拥堵|缓行/.test(n.congestion))
          lines.push('路况: ' + (traffic && traffic.evaluation ? traffic.evaluation.description + '（拥堵 ' + traffic.evaluation.congested + '）| 路段 ' + traffic.roads.length + ' 条 | 与本路线同名的缓行/拥堵段 ' + jam.length + ' 处' : '未取到（' + ((traffic && traffic.error) || '') + '）'))
        }
        lines.push('路线: ' + (path.distanceM / 1000).toFixed(1) + ' km | 用时 ' + Math.round(path.durationS / 60) + ' 分钟 | 备选 ' + paths.length + ' 条（用第 ' + (idx + 1) + ' 条）| 分段 ' + nodes.length)
        lines.push('走廊: 步长 ' + (args.stepM || d.stepM) + 'm | 半径 ' + (args.radiusM || d.radiusM) + 'm | 采样 ' + res.samples + ' 点 | 去重后 ' + res.total + ' 个点位')
        lines.push('类别: ' + cats.map((c) => c.label + '(' + c.key + ')').join(' / '))
        const byCat = {}
        for (const r of rows) byCat[r.category || '(未归类)'] = (byCat[r.category || '(未归类)'] || 0) + 1
        lines.push('分布: ' + Object.keys(byCat).map((k) => k + '=' + byCat[k]).join(' | '))
        if (args.withWeather) lines.push('终点天气: ' + weatherLine)
        lines.push('前 12 个点位（按' + (args.sort === 'rating' ? '评分' : '里程') + '）:')
        for (const r of rows.slice(0, 12)) lines.push('  ' + r.chainageKm + 'km ±' + Math.round(r.deviationM) + 'm [' + (r.category || '-') + '] ' + r.name + ' | ' + r.address)
        lines.push('CSV: ' + csvP)
        lines.push('分段表: ' + nodeP)
        lines.push('产物目录: ' + outs.outDir + '（工作区来源: ' + outs.src + '）')
        return lines.join('\n')
      } catch (e) { return fail(e) }
    }
  })
}
