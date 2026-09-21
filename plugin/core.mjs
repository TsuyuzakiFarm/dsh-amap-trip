// amap-trip · 零依赖核心（P1a）：凭据 / HTTP / 缓存 / 错误翻译 / 查询原语
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export const KEY_NAMES = ['AMAP_WS_KEY', 'AMAP_WEB_SERVICE_KEY', 'AMAP_JSAPI_KEY']
export const DEFAULT_ENV_FILE = join(process.env.HOME || '', '.dsh/.env')
export const BASE = 'https://restapi.amap.com'

export function parseEnv(text) {
  const out = {}
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/^\s*export\s+/, '').trim()
    if (!line || line[0] === '#' || line.indexOf('=') < 0) continue
    const i = line.indexOf('=')
    let v = line.slice(i + 1).trim()
    if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) v = v.slice(1, -1)
    out[line.slice(0, i).trim()] = v
  }
  return out
}

export function resolveCredential(opts) {
  const o = opts || {}
  const names = o.names || KEY_NAMES
  const env = o.env || process.env
  for (const n of names) { const v = env[n]; if (v && v.length >= 16) return { key: v, source: 'env:' + n } }
  let fileEnv = {}
  try { fileEnv = parseEnv(readFileSync(o.envFile || DEFAULT_ENV_FILE, 'utf8')) } catch (e) {}
  for (const n of names) { const v = fileEnv[n]; if (v && v.length >= 16) return { key: v, source: 'file:' + n } }
  return { key: '', source: 'none' }
}

export function mask(text) {
  return String(text)
    .replace(/("[A-Za-z_]*key[A-Za-z_]*"\s*:\s*")[^"]*/gi, '$1***')
    .replace(/(key=)[0-9A-Za-z]{16,}/gi, '$1***')
}

export const ERROR_TEXT = {
  '10001': 'key 无效或已过期',
  '10003': '日调用量已超出配额',
  '10004': '单位时间访问过于频繁（QPS 超限）',
  '10009': '平台不匹配：该 key 未开通「Web服务」平台（Web端 JS API key 不能做服务端调用）',
  '10012': '权限不足：该服务未开通',
  '10013': '无权使用该服务',
  '20000': '参数错误',
  '20003': '参数错误或数据不存在',
  '20800': '规划点不在中国境内',
  '20802': '规划点在道路上不可达',
  '20803': '途经点数量超限'
}

export function explain(payload) {
  const code = String((payload && payload.infocode) || '')
  const info = String((payload && payload.info) || '')
  return { code, info, text: ERROR_TEXT[code] || info || '未知错误' }
}

export function isRetryable(code) {
  return code === '' || code === '10004' || code === '10021' || code === '10019'
}

export class AmapError extends Error {
  constructor(message, code, info) {
    super(message)
    this.name = 'AmapError'
    this.infocode = code || ''
    this.info = info || ''
    this.retryable = isRetryable(this.infocode)
  }
}

export function decodePolyline(polyline) {
  const out = []
  for (const seg of String(polyline || '').split(';')) {
    if (!seg) continue
    const parts = seg.split(',')
    if (parts.length !== 2) continue
    const lng = Number(parts[0]), lat = Number(parts[1])
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat])
  }
  return out
}

function num(v, dflt) {
  if (v === undefined || v === null || v === '' || Array.isArray(v)) return dflt === undefined ? null : dflt
  const n = Number(v)
  return Number.isFinite(n) ? n : (dflt === undefined ? null : dflt)
}

function pickBiz(biz, field) {
  const v = biz ? biz[field] : undefined
  if (Array.isArray(v)) return v.length ? v[0] : ''
  return v === undefined || v === null ? '' : v
}

export function normalizePoi(p) {
  return {
    name: p.name || '',
    address: Array.isArray(p.address) ? p.address.join('') : (p.address || ''),
    typecode: p.typecode || '',
    type: p.type || '',
    location: p.location || '',
    distanceM: num(p.distance),
    adname: p.adname || '',
    cityname: p.cityname || '',
    adcode: p.adcode || '',
    tel: Array.isArray(p.tel) ? p.tel.join(' / ') : (p.tel || ''),
    rating: pickBiz(p.biz_ext, 'rating'),
    cost: pickBiz(p.biz_ext, 'cost'),
    businessArea: p.business ? (p.business.business_area || '') : ''
  }
}

export class AmapClient {
  constructor(cfg) {
    const c = cfg || {}
    this.key = c.key || ''
    this.cacheDir = c.cacheDir || join(process.cwd(), '.amap-cache')
    this.timeoutMs = c.timeoutMs || 20000
    this.retries = c.retries === undefined ? 2 : c.retries
    this.minIntervalMs = c.minIntervalMs === undefined ? 220 : c.minIntervalMs
    this.ttl = Object.assign({ geocode: 2592000000, poi: 604800000, route: 86400000, traffic: 0, weather: 21600000 }, c.ttl)
    this.stats = { calls: 0, cacheHits: 0, retries: 0, errors: 0 }
    this.signal = c.signal || null
    this._last = 0
    try { mkdirSync(this.cacheDir, { recursive: true }) } catch (e) {}
  }

  cacheKey(path, params) {
    const clean = {}
    for (const k of Object.keys(params || {})) if (k !== 'key') clean[k] = params[k]
    return createHash('sha1').update(path + '?' + new URLSearchParams(clean).toString()).digest('hex')
  }

  readCache(file, ttlMs) {
    if (!ttlMs) return null
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'))
      if (Date.now() - j.t < ttlMs) return j.body
    } catch (e) {}
    return null
  }

  writeCache(file, body) {
    try { writeFileSync(file, JSON.stringify({ t: Date.now(), body })) } catch (e) {}
  }

  async call(path, params, kind) {
    if (!this.key) throw new AmapError('未找到可用的高德 Web 服务 key', '10001', 'NO_KEY')
    if (this.signal && this.signal.aborted) throw new AmapError('调用已取消', '', 'ABORTED')
    const ttlMs = this.ttl[kind] === undefined ? 0 : this.ttl[kind]
    const file = join(this.cacheDir, this.cacheKey(path, params) + '.json')
    const hit = this.readCache(file, ttlMs)
    if (hit) { this.stats.cacheHits++; return JSON.parse(hit) }

    const qs = new URLSearchParams(Object.assign({}, params, { key: this.key }))
    const url = BASE + path + '?' + qs.toString()
    let lastErr = null
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const wait = this.minIntervalMs - (Date.now() - this._last)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      this._last = Date.now()
      this.stats.calls++
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
        const sig = this.signal ? AbortSignal.any([ctrl.signal, this.signal]) : ctrl.signal
        let text = ''
        try {
          const res = await fetch(url, { signal: sig })
          text = await res.text()
        } finally { clearTimeout(timer) }
        let json = null
        try { json = JSON.parse(text) } catch (e) { throw new AmapError('响应不是合法 JSON: ' + mask(text).slice(0, 140), '', 'BAD_JSON') }
        if (json.status === '1') { this.writeCache(file, JSON.stringify(json)); return json }
        const ex = explain(json)
        throw new AmapError('高德接口报错 [' + ex.code + '] ' + ex.text, ex.code, ex.info)
      } catch (e) {
        lastErr = e
        const retryable = e instanceof AmapError ? e.retryable : true
        this.stats.errors++
        if (!retryable || attempt === this.retries) break
        this.stats.retries++
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)))
      }
    }
    throw lastErr || new AmapError('请求失败', '', 'UNKNOWN')
  }

  async geocode(address, city) {
    const j = await this.call('/v3/geocode/geo', { address: address, city: city || '' }, 'geocode')
    return (j.geocodes || []).map((g) => ({ address: g.formatted_address, location: g.location, level: g.level, adcode: g.adcode, city: g.city, district: g.district }))
  }

  async regeocode(location) {
    const j = await this.call('/v3/geocode/regeo', { location: location }, 'geocode')
    const r = j.regeocode || {}
    return { address: r.formatted_address, component: r.addressComponent }
  }

  async poi(opts) {
    const o = opts || {}
    const source = o.source === 'v3' ? 'v3' : 'v5'
    let path, params
    if (o.around) {
      path = source === 'v3' ? '/v3/place/around' : '/v5/place/around'
      params = source === 'v3'
        ? { location: o.around.location, radius: String(o.around.radius || 1000), types: o.types || '', keywords: o.keywords || '', offset: String(o.pageSize || 20), page: String(o.page || 1), extensions: 'all' }
        : { location: o.around.location, radius: String(o.around.radius || 1000), types: o.types || '', keywords: o.keywords || '', page_size: String(o.pageSize || 20), page_num: String(o.page || 1), show_fields: 'business' }
    } else {
      path = source === 'v3' ? '/v3/place/text' : '/v5/place/text'
      params = source === 'v3'
        ? { keywords: o.keywords || '', types: o.types || '', city: o.region || '', citylimit: o.cityLimit ? 'true' : 'false', offset: String(o.pageSize || 20), page: String(o.page || 1), extensions: 'all' }
        : { keywords: o.keywords || '', types: o.types || '', region: o.region || '', city_limit: o.cityLimit ? 'true' : 'false', page_size: String(o.pageSize || 20), page_num: String(o.page || 1), show_fields: 'business' }
    }
    const j = await this.call(path, params, 'poi')
    return { source, count: num(j.count, 0) || 0, pois: (j.pois || []).map(normalizePoi) }
  }

  async route(opts) {
    const o = opts || {}
    const mode = o.mode || 'driving'
    const path = '/v5/direction/' + mode
    const params = { origin: o.origin, destination: o.destination, show_fields: o.showFields || 'cost,polyline' }
    if (o.waypoints && o.waypoints.length) params.waypoints = o.waypoints.join(';')
    if (o.strategy !== undefined && o.strategy !== null) params.strategy = String(o.strategy)
    if (o.plate) params.plate = o.plate
    const j = await this.call(path, params, 'route')
    const paths = (j.route && j.route.paths) || []
    return paths.map((p) => {
      const steps = (p.steps || []).map((s) => ({ instruction: s.instruction || '', road: s.road_name || '', distanceM: num(s.step_distance, 0), polyline: s.polyline || '' }))
      const points = decodePolyline(steps.map((s) => s.polyline).join(';'))
      return {
        distanceM: num(p.distance, 0),
        durationS: num(p.cost && p.cost.duration, 0),
        tolls: num(p.cost && p.cost.tolls, 0),
        trafficLights: num(p.cost && p.cost.traffic_lights, 0),
        steps: steps,
        points: points,
        pointCount: points.length
      }
    })
  }

  async trafficRectangle(rect, level) {
    const j = await this.call('/v3/traffic/status/rectangle', { rectangle: rect, level: String(level || 6), extensions: 'all' }, 'traffic')
    const ti = j.trafficinfo || {}
    return {
      description: ti.description || '',
      evaluation: ti.evaluation || null,
      roads: (ti.roads || []).map((r) => ({ name: r.name || '', status: r.status || '', speed: num(r.speed), angle: num(r.angle), direction: r.direction || '', polyline: r.polyline || '' }))
    }
  }

  async weather(city) {
    const j = await this.call('/v3/weather/weatherInfo', { city: city, extensions: 'base' }, 'weather')
    const l = (j.lives || [])[0] || {}
    return { province: l.province, city: l.city, weather: l.weather, temperature: l.temperature, winddirection: l.winddirection, windpower: l.windpower, humidity: l.humidity, reporttime: l.reporttime }
  }
}
