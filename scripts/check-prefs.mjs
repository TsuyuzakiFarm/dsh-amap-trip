import { apply } from '../plugin/index.mjs'
import { join } from 'node:path'
const WS = process.argv[2]
const reg = []
apply({ tools: { register: (d) => reg.push(d) } }, { stateDir: join(WS, 'amap-trip'), cacheDir: join(WS, 'amap-trip/cache'), outDir: join(WS, 'amap-trip/out') })
const call = async (n, a) => (await reg.find((x) => x.name === n).execute(a, { signal: AbortSignal.timeout(30000) }))
await call('amap_mode', { action: 'set', mode: 'daily' })
await call('amap_pref', { action: 'append', section: '交通偏好', text: '短途自驾优先；超 2 小时倾向高铁' })
console.log((await call('amap_pref', { action: 'read' })).split('\n').join('\n'))
await call('amap_pref', { action: 'forget', query: '高铁' })
console.log('after forget → ' + (await call('amap_pref', { action: 'read' })).split('\n').filter((l) => l.trim()).slice(-2).join(' | '))
