import { apply } from '../plugin/index.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const WS = process.argv[2]
const outDir = join(WS, 'amap-trip/out')
const reg = []
apply({ tools: { register: (d) => reg.push(d) } }, { cacheDir: join(WS, 'amap-trip/cache'), outDir })

console.log('tools=' + reg.map((t) => t.name).join(','))
const call = async (name, args) => {
  const t = reg.find((x) => x.name === name)
  const v = await t.execute(args, { signal: AbortSignal.timeout(180000) })
  const r = t.output.render(args, v)
  if (!Array.isArray(r) || r[0].type !== 'text') throw new Error('render 非法')
  return v
}
const t0 = Date.now()
const out = await call('amap_corridor', { origin: '北京市朝阳区阜通东大街6号', destination: '天安门', preset: 'ops', categories: ['crowd', 'emergency'], stepM: 800, radiusM: 300, maxSamples: 40 })
console.log('--- amap_corridor (' + ((Date.now() - t0) / 1000).toFixed(1) + 's) ---')
console.log(out.slice(0, 1800))
console.log('--- 落盘文件 ---')
for (const f of readdirSync(outDir).filter((f) => f.indexOf('corridor-') === 0 || f.indexOf('route-nodes-') === 0).slice(-2)) {
  const txt = readFileSync(join(outDir, f), 'utf8').split('\n')
  console.log(f + ' (' + (txt.length - 1) + ' 行) 表头: ' + txt[0])
  console.log('   样例: ' + (txt[1] || '').slice(0, 110))
}
