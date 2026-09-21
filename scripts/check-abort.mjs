// 验证 exec.signal 取消是否被尊重（对已部署副本或本仓库插件均可）
// 用法: node scripts/check-abort.mjs <workspace> [插件模块路径]
const WS = process.argv[2] || '.'
const target = process.argv[3] || new URL('../plugin/index.mjs', import.meta.url).href
const mod = await import(target)
const reg = []
mod.apply({ tools: { register: (x) => reg.push(x) } }, { workspaceDir: WS, outDir: WS + '/amap-trip/out', cacheDir: WS + '/amap-trip/cache', stateDir: WS + '/amap-trip/.test-state' })
const t = reg.find((x) => x.name === 'amap_geocode')
const cancelled = await t.execute({ address: '北京市朝阳区阜通东大街6号', city: '北京' }, { signal: AbortSignal.abort() })
console.log('已取消时返回: ' + String(cancelled).slice(0, 60))
const ok = await t.execute({ address: '北京市朝阳区阜通东大街6号', city: '北京' }, { signal: AbortSignal.timeout(60000) })
console.log('正常时返回: ' + String(ok).split('\n')[0].slice(0, 60))
