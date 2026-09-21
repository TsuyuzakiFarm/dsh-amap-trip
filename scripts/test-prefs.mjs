import { apply } from '../plugin/index.mjs'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const WS = process.argv[2]
const stateDir = join(WS, 'amap-trip')
const reg = []
const cfg = { cacheDir: join(WS, 'amap-trip/cache'), outDir: join(WS, 'amap-trip/out'), stateDir }
apply({ tools: { register: (d) => reg.push(d) } }, cfg)
console.log('工具数=' + reg.length + ': ' + reg.map((t) => t.name).join(','))

const call = async (name, args) => {
  const t = reg.find((x) => x.name === name)
  const v = await t.execute(args, { signal: AbortSignal.timeout(180000) })
  const r = t.output.render(args, v)
  if (!Array.isArray(r) || r[0].type !== 'text') throw new Error('render 非法')
  return v
}
console.log('\n[1] 初始模式:', (await call('amap_mode', { action: 'get' })).split('\n')[0])
console.log('\n[2] 写入日常偏好:\n' + (await call('amap_pref', { action: 'append', section: '口味与忌口', text: '不吃香菜；能吃辣但不爱重油' })))
console.log('\n[3] 切到 ops:\n' + (await call('amap_mode', { action: 'set', mode: 'ops' })).split('\n').slice(0, 3).join('\n'))
const opsRead = await call('amap_pref', { action: 'read' })
console.log('\n[4] ops 模式读偏好（应看不到香菜）:\n' + opsRead.split('\n').slice(0, 8).join('\n'))
console.log('  包含「香菜」? ' + (opsRead.indexOf('香菜') >= 0 ? '是（隔离失败）' : '否（隔离 OK）'))
console.log('\n[5] ops 模式下试图写 daily:\n' + (await call('amap_pref', { action: 'append', mode: 'daily', text: '偷写一条' })).split('\n')[0])
await call('amap_mode', { action: 'set', mode: 'daily' })
const dailyRead = await call('amap_pref', { action: 'read' })
console.log('\n[6] 回到 daily 读取:\n' + dailyRead.split('\n').filter((l) => l.indexOf('香菜') >= 0 || l.indexOf('##') === 0).slice(0, 4).join('\n'))
console.log('\n[7] forget 香菜:\n' + (await call('amap_pref', { action: 'forget', query: '香菜' })).split('\n').slice(0, 3).join('\n'))
await call('amap_mode', { action: 'set', mode: 'ops' })
console.log('\n[8] ops 模式跑走廊（不传 preset/类别，应自动用 ops 默认值 crowd+emergency）:')
const out = await call('amap_corridor', { origin: '北京市朝阳区阜通东大街6号', destination: '天安门', stepM: 800, maxSamples: 30 })
console.log(out.split('\n').slice(0, 6).join('\n'))
console.log('\nstate.json: ' + readFileSync(join(stateDir, 'state.json'), 'utf8').replace(/\s+/g, ' '))
