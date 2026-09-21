import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCredential, AmapClient } from '../plugin/core.mjs'
import { corridorSearch, nodesFromRoute, toCsv, polylineLength } from '../plugin/corridor.mjs'

const WS = process.argv[2]
const cred = resolveCredential({})
const client = new AmapClient({ key: cred.key, cacheDir: join(WS, 'amap-trip/cache'), minIntervalMs: 300 })

console.log('=== 1. POI 类型码校验（避免瞎猜分类码）===')
const checks = [['141200', '学校'], ['090100', '医疗'], ['060100', '购物中心'], ['060400', '超市'], ['080300', '影剧院'], ['150500', '地铁站'], ['130400', '公检法'], ['130600', '消防?'], ['010100', '加油站'], ['011100', '充电站'], ['010400', '汽车养护']]
for (const [code, guess] of checks) {
  const r = await client.poi({ around: { location: '116.482086,39.990496', radius: 3000 }, types: code, source: 'v5', pageSize: 2 })
  console.log('  ' + code + ' [' + guess + '] hits=' + r.count + ' → ' + (r.pois.map((p) => p.type + '(' + p.typecode + ')').slice(0, 2).join(' / ') || '(空)'))
}

console.log('=== 2. 路线切分（路口/桥隧口，带里程区间）===')
const routes = await client.route({ origin: '116.482086,39.990496', destination: '116.397428,39.90923' })
const path = routes[0]
const nodes = nodesFromRoute(path)
console.log('路线: ' + (path.distanceM / 1000).toFixed(1) + ' km | 分段 ' + nodes.length + ' | 几何点 ' + path.pointCount + ' | 折线长 ' + (polylineLength(path.points) / 1000).toFixed(2) + ' km')
for (const n of nodes.slice(0, 8)) console.log('  ' + n.fromKm.toFixed(2) + '-' + n.toKm.toFixed(2) + 'km | ' + (n.road || '(无路名)') + ' | ' + n.instruction.slice(0, 30) + ' | ' + n.tags.join('/'))

console.log('=== 3. 走廊检索（500m 采样 / 300m 半径 / 人员密集+应急）===')
const t0 = Date.now()
const res = await corridorSearch(client, {
  points: path.points, stepM: 500, radiusM: 300, source: 'v5', pageSize: 25,
  types: '141200|141300|090100|060100|060400|060700|080100|080300|150500|150700|130400|010100',
  onProgress: (p) => console.log('  progress ' + p.done + '/' + p.total + ' 累计去重=' + p.found),
})
const ms = Date.now() - t0
console.log('采样点=' + res.samples + ' 调用=' + res.calls + ' 耗时=' + (ms / 1000).toFixed(1) + 's 去重后=' + res.total)
for (const r of res.rows.slice(0, 15)) console.log('  ' + (r.chainageM / 1000).toFixed(2) + 'km ±' + Math.round(r.deviationM) + 'm | ' + r.name + ' | ' + r.typecode + ' | ' + r.address.slice(0, 30))

mkdirSync(join(WS, 'amap-trip/out'), { recursive: true })
const csv = toCsv(res.rows)
const p = join(WS, 'amap-trip/out', 'corridor-demo.csv')
writeFileSync(p, csv)
console.log('CSV → ' + p + ' (' + res.rows.length + ' 行, ' + csv.length + ' 字节)')
console.log('stats=' + JSON.stringify(client.stats))
