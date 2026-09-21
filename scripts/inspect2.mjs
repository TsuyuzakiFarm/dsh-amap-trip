import { readFileSync } from 'node:fs'
const dir = process.argv[2] + '/amap-trip/docs/samples/'
function rd(n) { try { return JSON.parse(readFileSync(dir + n + '.json', 'utf8')) } catch (e) { return null } }
function k(o) { return o && typeof o === 'object' ? Object.keys(o).join(',') : String(o) }
const f = rd('v5-driving-full')
if (f) { const p = f.route && f.route.paths && f.route.paths[0]; console.log('v5-driving-full: strategy32 paths=', (f.route.paths||[]).length, 'dist=', p.distance, 'cost=', JSON.stringify(p.cost), 'steps=', (p.steps||[]).length); let c=0; for (const s of p.steps||[]) c += (s.polyline||'').length; console.log('  polyChars=', c) }
const a = rd('v5-around-types')
if (a) { console.log('v5-around-types pois=', (a.pois||[]).length, '| distances=', (a.pois||[]).map(x=>x.distance).join(',')); console.log('  poi0 full:', JSON.stringify((a.pois||[])[0]).slice(0, 400)) }
const b = rd('v3-around')
if (b) { const p=(b.pois||[])[0]; console.log('v3-around poi0 biz_ext=', JSON.stringify(p.biz_ext), '| tel=', p.tel, '| childtype=', p.childtype, '| keytag=', JSON.stringify(p.keytag||[]).slice(0,80)) }