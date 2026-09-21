import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const WS = process.argv[2]
function loadEnv(f) { const o = {}; try { for (const raw of readFileSync(f, 'utf8').split('\n')) { const l = raw.replace(/^\s*export\s+/, '').trim(); if (!l || l.startsWith('#') || !l.includes('=')) continue; const i = l.indexOf('='); o[l.slice(0,i).trim()] = l.slice(i+1).trim().replace(/^["']|["']$/g, '') } } catch (e) {} return o }
const env = Object.assign({}, loadEnv(join(process.env.HOME, '.dsh/.env')), process.env)
const K = env.AMAP_WS_KEY || env.AMAP_WEB_SERVICE_KEY || env.AMAP_JSAPI_KEY || ''
const dir = join(WS, 'amap-trip/docs/samples'); mkdirSync(dir, { recursive: true })
const probes = [
  ['v5-around-types', 'https://restapi.amap.com/v5/place/around', { location: '116.481028,39.989643', radius: '800', types: '141200', page_size: '5', show_fields: 'business' }],
  ['v5-text-types', 'https://restapi.amap.com/v5/place/text', { keywords: '', types: '141200', region: '北京', city_limit: 'true', page_size: '5' }],
  ['v3-traffic-road', 'https://restapi.amap.com/v3/traffic/status/road', { name: '阜通东大街', city: '北京', level: '6' }],
  ['v5-driving-full', 'https://restapi.amap.com/v5/direction/driving', { origin: '116.481028,39.989643', destination: '116.434446,39.90816', strategy: '32', show_fields: 'cost,navi,polyline' }],
]
for (const p of probes) {
  const qs = new URLSearchParams(Object.assign({}, p[2], { key: K }))
  let http = 0, body = '', err = ''
  try { const res = await fetch(p[1] + '?' + qs.toString(), { signal: AbortSignal.timeout(25000) }); http = res.status; body = await res.text() } catch (e) { err = String(e && e.message || e) }
  const masked = body.replace(/"key"\s*:\s*"[0-9a-fA-F]{20,}"/gi, '"key":"***"').replace(/key=[0-9a-fA-F]{20,}/gi, 'key=***')
  writeFileSync(join(dir, p[0] + '.json'), masked)
  let st = '-', info = '-', code = '-', extra = ''
  try { const j = JSON.parse(masked); st = j.status; info = j.info; code = j.infocode
    if (p[0] === 'v5-driving-full') { const pa = j.route && j.route.paths && j.route.paths[0]; if (pa) { let c = 0; for (const s of pa.steps || []) c += (s.polyline || '').length; extra = ' dist=' + pa.distance + ' cost=' + JSON.stringify(pa.cost) + ' steps=' + (pa.steps || []).length + ' polyChars=' + c } }
    if (pa0(j)) extra = ' pois=' + (j.pois || []).length + ' poi0=' + ((j.pois || [])[0] || {}).name + ' / ' + ((j.pois || [])[0] || {}).typecode
    if (p[0] === 'v3-traffic-road') { const ti = j.trafficinfo || {}; extra = ' evaluate=' + ti.evaluation + ' roads=' + (ti.roads || []).length + ' road0=' + ((ti.roads || [])[0] || {}).name + ' status=' + ((ti.roads || [])[0] || {}).status + ' polyChars=' + String(((ti.roads || [])[0] || {}).polyline || '').length }
  } catch (e) {}
  function pa0() { return true }
  console.log([p[0], 'http=' + http, 'status=' + st, 'info=' + info, 'code=' + code].join(' ') + (err ? ' ERR=' + err : '') + extra)
}