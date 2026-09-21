import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const WS = process.argv[2]
const HOME = process.env.HOME
const samples = join(WS, 'amap-trip/docs/samples')
const docs = join(WS, 'amap-trip/docs')
mkdirSync(samples, { recursive: true })
mkdirSync(docs, { recursive: true })

function loadEnv(file) {
  const out = {}
  try {
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.replace(/^\s*export\s+/, '').trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch (e) {}
  return out
}
const env = Object.assign({}, loadEnv(join(HOME, '.dsh/.env')), process.env)
const KEY_NAMES = ['AMAP_WS_KEY', 'AMAP_WEB_SERVICE_KEY', 'AMAP_JSAPI_KEY']
const picked = KEY_NAMES.find((n) => env[n] && String(env[n]).length >= 16)
const KEY = picked ? env[picked] : ''

function describe(j) {
  const parts = []
  for (const k of Object.keys(j)) {
    const v = j[k]
    if (Array.isArray(v)) parts.push(k + '[' + v.length + ']')
    else if (v && typeof v === 'object') parts.push(k + '{' + Object.keys(v).slice(0, 6).join(',') + '}')
    else parts.push(k + '=' + String(v).slice(0, 30))
  }
  return parts.join(' ')
}

function extra(name, j) {
  try {
    if (name === 'v3-geocode') { const g = j.geocodes && j.geocodes[0]; return g ? ' | addr=' + g.formatted_address + ' loc=' + g.location : '' }
    if (name === 'v3-regeo') { const r = j.regeocode; return r ? ' | addr=' + r.formatted_address : '' }
    if (name === 'v5-driving') { const p = j.route && j.route.paths && j.route.paths[0]; return p ? ' | dist=' + p.distance + 'm dur=' + p.duration + 's steps=' + ((p.steps && p.steps.length) || 0) + ' polyChars=' + String((p.steps && p.steps[0] && p.steps[0].polyline) || '').length : '' }
    if (name === 'v3-around' || name === 'v5-around' || name === 'v3-text') { const p = j.pois && j.pois[0]; return p ? ' | poi0=' + p.name + ' / ' + p.address + ' / type=' + p.typecode : '' }
    if (name === 'v3-traffic-rect') { const r = j.trafficinfo && j.trafficinfo.roads && j.trafficinfo.roads[0]; return r ? ' | road0=' + r.name + ' status=' + r.status + ' speed=' + r.speed + ' polyChars=' + String(r.polyline || '').length : '' }
    if (name === 'v3-weather') { const w = j.lives && j.lives[0]; return w ? ' | ' + w.province + w.city + ' ' + w.weather + ' ' + w.temperature + 'C' : '' }
  } catch (e) { return ' | extra-fail:' + e.message }
  return ''
}

const probes = [
  ['v3-geocode', 'https://restapi.amap.com/v3/geocode/geo', { address: '北京市朝阳区阜通东大街6号', city: '北京' }],
  ['v3-regeo', 'https://restapi.amap.com/v3/geocode/regeo', { location: '116.481028,39.989643' }],
  ['v5-driving', 'https://restapi.amap.com/v5/direction/driving', { origin: '116.481028,39.989643', destination: '116.434446,39.90816', show_fields: 'cost,polyline' }],
  ['v3-around', 'https://restapi.amap.com/v3/place/around', { location: '116.481028,39.989643', radius: '1000', offset: '5', page: '1', types: '050000' }],
  ['v5-around', 'https://restapi.amap.com/v5/place/around', { location: '116.481028,39.989643', radius: '1000', page_size: '5' }],
  ['v3-text', 'https://restapi.amap.com/v3/place/text', { keywords: '学校', city: '北京', offset: '3', page: '1' }],
  ['v3-traffic-rect', 'https://restapi.amap.com/v3/traffic/status/rectangle', { rectangle: '116.35,39.93;116.42,39.88', level: '6' }],
  ['v3-weather', 'https://restapi.amap.com/v3/weather/weatherInfo', { city: '110101', extensions: 'base' }],
]

const rows = []
for (const p of probes) {
  const name = p[0], url = p[1], params = p[2]
  const qs = new URLSearchParams(Object.assign({}, params, { key: KEY }))
  let http = 0, json = null, err = ''
  try {
    const res = await fetch(url + '?' + qs.toString(), { signal: AbortSignal.timeout(20000) })
    http = res.status
    const text = await res.text()
    const masked = text
      .replace(/"key"\s*:\s*"[0-9a-fA-F]{20,}"/gi, '"key":"***MASKED***"')
      .replace(/key=[0-9a-fA-F]{20,}/gi, 'key=***MASKED***')
    writeFileSync(join(samples, name + '.json'), masked)
    try { json = JSON.parse(text) } catch (e2) { err = 'not-json:' + text.slice(0, 60) }
  } catch (e) { err = String((e && e.message) || e) }
  const row = { name: name, http: http, status: (json && json.status) || '-', info: (json && json.info) || '-', infocode: (json && json.infocode) || '-', shape: json ? describe(json) : '', extra: json ? extra(name, json) : '', err: err }
  rows.push(row)
  console.log([row.name, 'http=' + row.http, 'status=' + row.status, 'info=' + row.info, 'code=' + row.infocode].join(' ') + row.extra + (row.err ? ' ERR=' + row.err : ''))
}

const L = ['# 高德接口探活记录（P0）', '', '- 生成时间：' + new Date().toISOString(), '- 使用凭据变量名：' + (picked || '(未找到)'), '- 原始响应：docs/samples/*.json', '', '| 接口 | HTTP | status | info | infocode | 结构 |', '|---|---:|---:|---|---:|---|']
for (const r of rows) L.push('| ' + [r.name, r.http, r.status, r.info, r.infocode, String(r.shape).replace(/\|/g, '/')].join(' | ') + ' |')
L.push('', '## 关键字段摘录', '')
for (const r of rows) if (r.extra || r.err) L.push('- ' + r.name + ': ' + (r.extra || '') + (r.err ? '  **错误: ' + r.err + '**' : ''))
L.push('', '## 结论（待填）', '', '- 凭据平台权限：', '- 需补充：', '')
writeFileSync(join(docs, 'field-notes.md'), L.join('\n'))
console.log('NOTES -> ' + join(docs, 'field-notes.md'))