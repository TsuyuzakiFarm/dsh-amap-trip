const WS = process.argv[2]
const mod = await import(WS + '/amap-trip/plugin/index.mjs')
const reg = []
mod.apply({ tools: { register: (d) => reg.push(d) } }, {})
const t = reg.find((x) => x.name === 'amap_map')
const v = await t.execute({ routeFile: WS + '/meixian-route-geometry.json', markersFile: WS + '/meixian-junctions-12.csv', title: '梅县：天虹 → 烟花爆竹仓库 → 西山村台铃｜12 处路口' }, { signal: AbortSignal.timeout(120000) })
console.log(String(v).split('\n').slice(0, 3).join('\n'))