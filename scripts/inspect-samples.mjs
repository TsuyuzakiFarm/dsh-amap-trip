import { readFileSync } from 'node:fs'
const dir = process.argv[2] + '/amap-trip/docs/samples/'
function rd(n) { try { return JSON.parse(readFileSync(dir + n + '.json', 'utf8')) } catch (e) { return null } }
function keys(o) { return o && typeof o === 'object' ? Object.keys(o).join(',') : String(o) }
function trunc(v, n) { const s = typeof v === 'string' ? v : JSON.stringify(v); return s ? s.slice(0, n || 45) : String(v) }

const d = rd('v5-driving')
if (d) {
  const p = d.route && d.route.paths && d.route.paths[0]
  console.log('== v5-driving ==')
  console.log('top:', keys(d))
  console.log('route:', keys(d.route))
  console.log('paths[0]:', keys(p))
  console.log('distance=', p.distance, 'cost=', JSON.stringify(p.cost), 'steps=', (p.steps || []).length)
  let chars = 0, pts = 0
  for (const s of p.steps || []) { const pl = s.polyline || ''; chars += pl.length; pts += pl ? pl.split(';').length : 0 }
  console.log('polyline total chars=', chars, 'points=', pts)
  console.log('step0 keys:', keys(p.steps[0]), '| instruction=', trunc(p.steps[0].instruction, 40), '| polyline=', trunc(p.steps[0].polyline, 60))
  console.log('step1 keys:', keys(p.steps[1]), '| polyline pts=', ((p.steps[1].polyline || '').split(';').length))
}
for (const n of ['v5-around', 'v3-around', 'v3-text']) {
  const j = rd(n); if (!j) continue
  console.log('== ' + n + ' ==', 'top:', keys(j), 'pois=', (j.pois || []).length)
  const p = (j.pois || [])[0]; if (p) console.log('  poi0 keys:', keys(p))
  if (p) console.log('  poi0:', trunc(p.name, 30), '|', trunc(p.address, 40), '| type=', p.typecode, '| loc=', p.location, '| dist=', p.distance, '| adname=', p.adname, '| cityname=', p.cityname)
}
const t = rd('v3-traffic-rect')
if (t) { console.log('== v3-traffic-rect ==', 'top:', keys(t)); console.log('  trafficinfo:', keys(t.trafficinfo)); console.log('  raw:', trunc(t.trafficinfo, 300)) }