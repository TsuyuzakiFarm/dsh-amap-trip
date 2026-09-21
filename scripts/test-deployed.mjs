import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const WS = process.argv[2]
const DEPLOYED = '/home/abinkaiki/.dsh/profiles/web/plugins/amap-trip/index.mjs'
const mod = await import(DEPLOYED)
const reg = []
mod.apply({ tools: { register: (d) => reg.push(d) } }, {
  workspaceDir: WS,
  outDir: join(WS, 'amap-trip/out'),
  cacheDir: join(WS, 'amap-trip/cache'),
  stateDir: join(WS, 'amap-trip/.test-state'),
})
console.log('已加载工具(' + reg.length + '): ' + reg.map((t) => t.name).join(','))
console.log('Config 导出: ' + (mod.Config ? '有 Schemastery schema ✓' : '无 ✗'))
const call = async (name, args, sig) => {
  const t = reg.find((x) => x.name === name)
  const v = await t.execute(args, { signal: sig || AbortSignal.timeout(180000) })
  const r = t.output.render(args, v)
  if (!Array.isArray(r) || r[0].type !== 'text') throw new Error('render 非法')
  return v
}
// 1) 取消信号是否被尊重（Config/signal 修复的实证）
try { await call('amap_geocode', { address: '北京市朝阳区阜通东大街6号', city: '北京' }, AbortSignal.abort()); console.log('[取消测试] ✗ 未生效') }
catch (e) { console.log('[取消测试] ✓ ' + String(e.message).slice(0, 40)) }
// 2) 走廊：道路锚定 + 路况叠加 + 按评分排序
const out = await call('amap_corridor', { origin: '北京市朝阳区望京SOHO', destination: '北京市东城区东直门桥', preset: 'ops', categories: ['emergency', 'supply'], stepM: 1500, maxSamples: 8, withTraffic: true, road: '东直门外大街', city: '北京' })
console.log('--- corridor ---')
console.log(out.split('\n').slice(0, 12).join('\n'))
// 3) 出图
const files = readdirSync(join(WS, 'amap-trip/out')).filter((f) => f.indexOf('corridor-') === 0).sort()
const csv = join(WS, 'amap-trip/out', files[files.length - 1])
const mapOut = await call('amap_map', { origin: '北京市朝阳区望京SOHO', destination: '北京市东城区东直门桥', markersFile: csv, title: '验收地图' })
console.log('--- map ---')
console.log(String(mapOut).slice(0, 260))
const htmlPath = String(mapOut).split('\n')[0].replace('✓ 已生成 HTML 地图: ', '').trim()
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf8')
  console.log('HTML 自检: appname=' + (html.indexOf("AMap.getConfig().appname = \"amap-jsapi-skill\"") > 0) + ' | polyline=' + (html.indexOf('AMap.Polyline') > 0) + ' | 安全密钥=' + (html.indexOf('securityJsCode') > 0) + ' | 大小=' + html.length)
} else console.log('HTML 未生成 ✗')