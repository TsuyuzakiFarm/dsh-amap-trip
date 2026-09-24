// 类别归类回归：预设内不得有跨类别重复的类型码；标签不得随调用者传参顺序变化。
// 运行：node scripts/test-categories.mjs
import { readFileSync } from 'node:fs'
import { resolveCategories, classify, normCode, CATEGORY_PRESETS } from '../plugin/corridor.mjs'

let fail = 0
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg)
  if (!cond) fail++
}
const json = (mode) => JSON.parse(readFileSync(new URL(`../plugin/presets/${mode}.json`, import.meta.url), 'utf8'))

console.log('1) 预设内类型码唯一（不再跨类别重叠）')
for (const mode of ['ops', 'daily']) {
  const table = json(mode)
  const seen = new Map()
  const dup = []
  for (const [key, cat] of Object.entries(table)) {
    for (const t of String(cat.types).split('|')) {
      const p = normCode(t)
      if (seen.has(p)) dup.push(`${p}（${seen.get(p)} / ${key}）`)
      else seen.set(p, key)
    }
  }
  ok(dup.length === 0, `${mode}.json：无重复${dup.length ? ' → ' + dup.join('、') : ''}`)
}

console.log('2) 代码兜底表与 JSON 逐项一致')
for (const mode of ['ops', 'daily']) {
  const table = json(mode)
  const fb = CATEGORY_PRESETS[mode] || {}
  ok(Object.keys(fb).join(',') === Object.keys(table).join(','), `${mode}：键与顺序一致（${Object.keys(table).join(',')}）`)
  for (const k of Object.keys(table)) ok(fb[k] && fb[k].label === table[k].label && fb[k].types === table[k].types, `${mode}.${k}：label 与 types 一致`)
}

console.log('3) 类别顺序取自预设声明，与传参顺序无关')
const a = resolveCategories('ops', ['crowd', 'transit']).map((c) => c.key)
const b = resolveCategories('ops', ['transit', 'crowd']).map((c) => c.key)
ok(JSON.stringify(a) === JSON.stringify(b), `两种传参顺序结果相同（${a.join(' → ')}）`)
ok(a.join(',') === 'crowd,transit', '顺序等于预设声明顺序，而非调用者顺序')
ok(resolveCategories('ops', null).map((c) => c.key).join(',') === 'crowd,emergency,supply,transit', '不传类别 = 预设全部（声明顺序）')
const unknown = resolveCategories('ops', ['crowd', 'zzz'])
ok(unknown.length === 2 && unknown[1].key === 'zzz' && unknown[1].types === 'zzz', '未知类别原样保留并排在声明类别之后')

console.log('4) 标签结果')
const cats = resolveCategories('ops', ['crowd', 'transit'])
const cases = [
  ['150500', 'transit', '150500 地铁站'],
  ['150700', 'transit', '150700 公交站'],
  ['150100', 'transit', '150100 机场'],
  ['141200', 'crowd', '141200 学校'],
  ['080111', 'crowd', '080111 健身中心'],
  ['060400|061100', 'crowd', '复合类型码取首个命中'],
  ['090100', '', '未选中的类别不参与归类'],
]
for (const [code, want, label] of cases) ok(classify(code, cats) === want, `${label} → ${want || '（不归类）'}`)

console.log('5) 日常模式预设')
const dailyCats = resolveCategories('daily', ['rest', 'food'])
ok(dailyCats.map((c) => c.key).join(',') === 'food,rest', 'daily 顺序同样取自声明（food → rest）')
ok(classify('050500', dailyCats) === 'food' && classify('100000', dailyCats) === 'rest', 'daily 归类正确')

console.log(fail ? `\n${fail} 项失败` : '\n全部通过')
process.exit(fail ? 1 : 0)
