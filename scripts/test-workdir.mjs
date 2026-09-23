const mod = await import(process.argv[2] + '/amap-trip/plugin/index.mjs')
const WS = process.argv[2]
const reg = []
mod.apply({ tools: { register: (d) => reg.push(d) } }, {})
const t = reg.find((x) => x.name === 'amap_map')
const v = await t.execute({ origin: '116.482086,39.990496', destination: '116.397428,39.90923', title: '会话工作区解析测试' }, { signal: AbortSignal.timeout(120000) })
console.log(String(v).split('\n').slice(0, 3).join('\n'))