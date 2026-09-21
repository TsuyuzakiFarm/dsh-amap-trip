import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const WS = process.argv[2]
// 用法: node scripts/verify-fixes.mjs <workspace> [插件模块路径]
const mod = await import(process.argv[3] || new URL('../plugin/index.mjs', import.meta.url).href)
const reg = []
mod.apply({ tools: { register: (d) => reg.push(d) } }, { workspaceDir: WS, outDir: join(WS, 'amap-trip/out'), cacheDir: join(WS, 'amap-trip/cache'), stateDir: join(WS, 'amap-trip/.test-state') })
const call = async (n, a) => String(await reg.find((x) => x.name === n).execute(a, { signal: AbortSignal.timeout(150000) }))
console.log('== 修复后复测 T7（日常：v3 字段 + 按评分 + 天气）==')
const r = await call('amap_corridor', { origin: '北京市朝阳区望京SOHO', destination: '北京市怀柔区雁栖湖', preset: 'daily', categories: ['food'], sort: 'rating', withWeather: true, stepM: 6000, radiusM: 800, maxSamples: 5 })
console.log(r.split('\n').filter((l) => /模式:|走廊:|分布:|终点天气:|CSV:/.test(l)).join('\n'))
const csv = (r.split('\n').find((l) => l.indexOf('CSV: ') === 0) || '').replace('CSV: ', '').trim()
console.log('CSV 前 3 行（应带评分/人均/电话）:')
console.log(readFileSync(csv, 'utf8').split('\n').slice(0, 3).join('\n'))
console.log('')
console.log('== T13 缓存命中 ==')
const t0 = Date.now(); await call('amap_geocode', { address: '北京市朝阳区阜通东大街6号', city: '北京' }); const t1 = Date.now()
await call('amap_geocode', { address: '北京市朝阳区阜通东大街6号', city: '北京' }); const t2 = Date.now()
console.log('首次 ' + (t1 - t0) + 'ms / 二次 ' + (t2 - t1) + 'ms → ' + ((t2 - t1) < (t1 - t0) / 3 ? '✓ 命中缓存' : '(未命中)'))
console.log('缓存文件数: ' + readdirSync(join(WS, 'amap-trip/cache')).length)