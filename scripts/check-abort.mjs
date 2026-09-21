const mod = await import('/home/abinkaiki/.dsh/profiles/web/plugins/amap-trip/index.mjs')
const reg = []
mod.apply({ tools: { register: (d) => reg.push(d) } }, { workspaceDir: process.argv[2], outDir: process.argv[2] + '/amap-trip/out', cacheDir: process.argv[2] + '/amap-trip/cache', stateDir: process.argv[2] + '/amap-trip/.test-state' })
const t = reg.find((x) => x.name === 'amap_geocode')
const v = await t.execute({ address: '北京市朝阳区阜通东大街6号', city: '北京' }, { signal: AbortSignal.abort() })
console.log('已取消时返回: ' + String(v).slice(0, 60))
const v2 = await t.execute({ address: '北京市朝阳区阜通东大街6号', city: '北京' }, { signal: AbortSignal.timeout(60000) })
console.log('正常时返回: ' + String(v2).split('\n')[0].slice(0, 60))