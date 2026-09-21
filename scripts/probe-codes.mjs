import { resolveCredential, AmapClient } from '../plugin/core.mjs'
import { join } from 'node:path'
const WS = process.argv[2]
const cred = resolveCredential({})
const client = new AmapClient({ key: cred.key, cacheDir: join(WS, 'amap-trip/cache'), minIntervalMs: 320 })
const candidates = ['130100', '130200', '130300', '130500', '130700', '130800', '080100', '080200', '080400', '080500', '080600', '060700', '060900', '090200', '090300']
for (const c of candidates) {
  try {
    const r = await client.poi({ around: { location: '116.482086,39.990496', radius: 5000 }, types: c, source: 'v5', pageSize: 3 })
    console.log(c + ' hits=' + r.count + ' → ' + (r.pois.map((p) => p.type).slice(0, 3).join(' || ') || '(空)'))
  } catch (e) { console.log(c + ' ERR ' + e.message) }
}
console.log('--- 关键字兜底 ---')
for (const kw of ['派出所', '消防队', '电影院', '体育场馆', '农贸市场', '避难场所']) {
  try {
    const r = await client.poi({ around: { location: '116.482086,39.990496', radius: 5000 }, keywords: kw, source: 'v5', pageSize: 3 })
    console.log(kw + ' hits=' + r.count + ' → ' + (r.pois.map((p) => p.name + '[' + p.typecode + ']').slice(0, 3).join(' || ') || '(空)'))
  } catch (e) { console.log(kw + ' ERR ' + e.message) }
}
console.log('stats=' + JSON.stringify(client.stats))
