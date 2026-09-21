import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const WS = process.argv[2]
function loadEnv(f) { const o = {}; try { for (const raw of readFileSync(f, 'utf8').split('\n')) { const l = raw.replace(/^\s*export\s+/, '').trim(); if (!l || l.startsWith('#') || !l.includes('=')) continue; const i = l.indexOf('='); o[l.slice(0,i).trim()] = l.slice(i+1).trim().replace(/^["']|["']$/g, '') } } catch (e) {} return o }
const env = Object.assign({}, loadEnv(join(process.env.HOME, '.dsh/.env')), process.env)
const K = env.AMAP_WS_KEY || env.AMAP_WEB_SERVICE_KEY || env.AMAP_JSAPI_KEY || ''
const dir = join(WS, 'amap-trip/docs/samples'); mkdirSync(dir, { recursive: true })
const probes = [
  ['v3-traffic-rect2', 'https://restapi.amap.com/v3/traffic/status/rectangle', { rectangle: '116.35,39.88;116.42,39.93', level: '6', extensions: 'all' }],
  ['v3-traffic-road2', 'https://restapi.amap.com/v3/traffic/status/road', { name: '长安街', city: '北京', level: '6', extensions: 'all' }],
  ['v3-around-rich', 'https://restapi.amap.com/v3/place/around', { location: '116.481028,39.989643', radius: '800', types: '141200', offset: '3', page: '1', extensions: 'all' }],
]
for (const p of probes) {
  const qs = new URLSearchParams(Object.assign({}, p[2], { key: K }))
  let http = 0, body = '', err = ''
  try { const res = await fetch(p[1] + '?' + qs.toString(), { signal: AbortSignal.timeout(25000) }); http = res.status; body = await res.text() } catch (e) { err = String(e && e.message || e) }
  const masked = body.replace(/"key"\s*:\s*"[0-9a-fA-F]{20,}"/gi, '"key":"***"').replace(/key=[0-9a-fA-F]{20,}/gi, 'key=***')
  writeFileSync(join(dir, p[0] + '.json'), masked)
  let st='-', info='-', code='-', extra=''
  try { const j = JSON.parse(masked); st=j.status; info=j.info; code=j.infocode
    const ti = j.trafficinfo || {}
    if (p[0].indexOf('traffic') >= 0) { const roads = ti.roads || []; extra = ' evaluation=' + JSON.stringify(ti.evaluation) + ' roads=' + roads.length + ' road0=' + (roads[0] ? (roads[0].name + '/' + roads[0].status + '/speed=' + roads[0].speed + '/poly=' + String(roads[0].polyline||'').length + '/angle=' + roads[0].angle) : '-') }
    if (p[0] === 'v3-around-rich') { const q = (j.pois||[])[0]; extra = ' pois=' + (j.pois||[]).length + ' | ' + (q ? (q.name + ' | biz_ext=' + JSON.stringify(q.biz_ext) + ' | tel=' + q.tel + ' | typecode=' + q.typecode) : '-') }
  } catch (e) {}
  console.log([p[0], 'http=' + http, 'status=' + st, 'info=' + info, 'code=' + code].join(' ') + (err ? ' ERR=' + err : '') + extra)
}