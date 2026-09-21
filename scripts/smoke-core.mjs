import { join } from 'node:path'
import { resolveCredential, AmapClient, explain, mask, decodePolyline } from '../plugin/core.mjs'

const WS = process.argv[2]
const t0 = Date.now()
const cred = resolveCredential({})
console.log('cred: source=' + cred.source + ' keyLen=' + (cred.key ? cred.key.length : 0))
const client = new AmapClient({ key: cred.key, cacheDir: join(WS, 'amap-trip/cache'), minIntervalMs: 250 })

const g = await client.geocode('北京市朝阳区阜通东大街6号', '北京')
console.log('geocode:', g.length, '|', g[0] && g[0].location, '|', g[0] && g[0].address, '| level=', g[0] && g[0].level)

const r = await client.route({ origin: g[0].location, destination: '116.397428,39.90923' })
console.log('route: paths=' + r.length + ' dist=' + r[0].distanceM + 'm dur=' + r[0].durationS + 's lights=' + r[0].trafficLights + ' steps=' + r[0].steps.length + ' points=' + r[0].pointCount)
console.log('  step0:', r[0].steps[0].instruction, '| road=' + r[0].steps[1].road)

const p5 = await client.poi({ source: 'v5', around: { location: g[0].location, radius: 800 }, types: '141200', pageSize: 5 })
console.log('poi v5: count=' + p5.count + ' got=' + p5.pois.length)
for (const p of p5.pois.slice(0, 3)) console.log('  -', p.name, '|', p.address, '| type=' + p.typecode, '| d=' + p.distanceM + 'm', '| area=' + p.businessArea)

const p3 = await client.poi({ source: 'v3', around: { location: g[0].location, radius: 800 }, types: '050000', pageSize: 5 })
console.log('poi v3: got=' + p3.pois.length)
for (const p of p3.pois.slice(0, 3)) console.log('  -', p.name, '| rating=' + JSON.stringify(p.rating), '| cost=' + JSON.stringify(p.cost), '| tel=' + JSON.stringify(p.tel))

const t = await client.trafficRectangle('116.35,39.88;116.42,39.93', 6)
console.log('traffic: roads=' + t.roads.length + ' eval=' + (t.evaluation ? t.evaluation.description : '-') + ' | road0=' + (t.roads[0] ? t.roads[0].name + '/' + t.roads[0].status + '/speed=' + t.roads[0].speed + '/pts=' + decodePolyline(t.roads[0].polyline).length : '-'))

const w = await client.weather('110101')
console.log('weather:', w.city, w.weather, w.temperature + 'C')

console.log('errors:', JSON.stringify(explain({ status: '0', info: 'USERKEY_PLAT_NOMATCH', infocode: '10009' })))
console.log('mask:', mask('{"key":"deadbeefdeadbeefdeadbeefdeadbeef","x":1}'))

const t1 = Date.now()
await client.geocode('北京市朝阳区阜通东大街6号', '北京')
const t2 = Date.now()
console.log('cache: first=' + (t1 - t0) + 'ms second=' + (t2 - t1) + 'ms | stats=' + JSON.stringify(client.stats))
