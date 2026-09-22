const WS = process.argv[2]
// 用法: node scripts/check-outdir.mjs <workspace> [插件模块路径]
const mod = await import(process.argv[3] || new URL('../plugin/index.mjs', import.meta.url).href)
const reg = []
mod.apply({ tools: { register: (d) => reg.push(d) } }, {})
const call = async (n, a, exec) => String(await reg.find((x) => x.name === n).execute(a, exec || { signal: AbortSignal.timeout(150000) }))
const exec = { signal: AbortSignal.timeout(150000), agent: { session: { cwd: WS } } }
const r = await call('amap_map', { origin: '116.482086,39.990496', destination: '116.397428,39.90923', title: '产物目录复验' }, exec)
console.log(r.split('\n').slice(0, 1).join('\n'))
console.log(r.split('\n').filter((l) => l.indexOf('产物目录') >= 0).join('\n'))
console.log('诊断行:')
const d = await call('amap_diagnose', {}, exec)
console.log(d.split('\n').filter((l) => l.indexOf('产物目录') >= 0).join('\n'))