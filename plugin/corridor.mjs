// amap-trip · 走廊检索与路线切分（P2 核心，零依赖）
// 里程/偏离用局部平面近似（等距圆柱投影），精度对 300m 量级足够。

const R_EARTH = 6371008.8
const D2R = Math.PI / 180

export function haversine(a, b) {
  const dLat = (b[1] - a[1]) * D2R
  const dLng = (b[0] - a[0]) * D2R
  const lat1 = a[1] * D2R
  const lat2 = b[1] * D2R
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function polylineLength(points) {
  let s = 0
  for (let i = 1; i < points.length; i++) s += haversine(points[i - 1], points[i])
  return s
}

/** 沿折线按 stepM 采样（含首尾）。 */
export function samplePolyline(points, stepM, maxSamples) {
  if (!points || points.length === 0) return []
  if (points.length === 1) return [{ point: points[0], chainageM: 0 }]
  const out = []
  let acc = 0
  let next = 0
  out.push({ point: points[0], chainageM: 0 })
  next = stepM
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const segLen = haversine(a, b)
    if (segLen <= 0) continue
    while (next <= acc + segLen) {
      const t = (next - acc) / segLen
      out.push({ point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], chainageM: next })
      next += stepM
      if (maxSamples && out.length >= maxSamples) return out
    }
    acc += segLen
  }
  const last = points[points.length - 1]
  if (out[out.length - 1].chainageM < acc) out.push({ point: last, chainageM: acc })
  return out
}

function projector(points) {
  const lat0 = points.reduce((s, p) => s + p[1], 0) / points.length
  const lng0 = points.reduce((s, p) => s + p[0], 0) / points.length
  const kx = 111320 * Math.cos(lat0 * D2R)
  const ky = 110540
  return (p) => [(p[0] - lng0) * kx, (p[1] - lat0) * ky]
}

/** 点到折线的最近投影：返回 { chainageM, deviationM } */
export function projectToPolyline(point, points) {
  const toXY = projector(points)
  const p = toXY(point)
  let best = { chainageM: 0, deviationM: Infinity }
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const a = toXY(points[i - 1]), b = toXY(points[i])
    const vx = b[0] - a[0], vy = b[1] - a[1]
    const len2 = vx * vx + vy * vy
    let t = 0
    if (len2 > 0) t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    const qx = a[0] + vx * t, qy = a[1] + vy * t
    const d = Math.hypot(p[0] - qx, p[1] - qy)
    if (d < best.deviationM) best = { chainageM: acc + t * Math.sqrt(len2), deviationM: d }
    acc += Math.sqrt(len2)
  }
  return best
}

/**
 * 类别预设：类型码全部经真实接口校验（2026-09-21 实测）。
 * 高德类型码按前缀展开，所以写 4 位码会覆盖其下所有子类。
 * 已验：141200 学校 / 090100 医院 / 090200 专科 / 090300 诊所 / 060100 商场 /
 * 060400 超市 / 060700 综合市场 / 080100 运动场馆 / 080600 影剧院 /
 * 150500 地铁站 / 150700 公交站 / 130500 公检法(含 130501 派出所、130504 消防) /
 * 200400 紧急避难场所 / 010100 加油站 / 011100 充电站 / 010400 汽车维修养护
 */
export const CATEGORY_PRESETS = {
  ops: {
    crowd: { label: '人员密集', types: '141200|141400|080100|080600|060100|060400|060700' },
    emergency: { label: '应急力量', types: '090100|090200|090300|130500|200400' },
    supply: { label: '补给维修', types: '010100|011100|010400' },
    transit: { label: '交通枢纽', types: '150100|150200|150300|150400|150500|150700' }
  },
  daily: {
    food: { label: '餐饮', types: '050000' },
    sight: { label: '风景名胜', types: '110000' },
    shop: { label: '购物', types: '060000' },
    fun: { label: '休闲娱乐', types: '080000' },
    rest: { label: '住宿', types: '100000' }
  }
}

/** 解析类别：一律按预设定义的顺序返回，而不是调用者的传参顺序。
 *  原因：classify 取「第一个命中的类别」，而预设允许类别码重叠；若顺序随调用者变化，
 *  同一份数据会贴出不同标签（例如 crowd/transit 曾共用 150500|150700）。 */
export function resolveCategories(mode, names, table) {
  const presets = (table && table[mode]) || CATEGORY_PRESETS[mode] || CATEGORY_PRESETS.ops
  const declared = Object.keys(presets)
  const pick = (n) => (presets[n] ? Object.assign({ key: n }, presets[n]) : { key: n, label: n, types: n })
  if (!names || !names.length) return declared.map(pick)
  const want = Array.from(new Set(names))
  return declared.filter((n) => want.indexOf(n) >= 0)
    .concat(want.filter((n) => declared.indexOf(n) < 0))
    .map(pick)
}

/** 按类型码前缀把一条 POI 归到某个类别键（找不到返回 ''）。 */
export function normCode(code) {
  return String(code || '').trim().replace(/(00)+$/, '')
}

export function classify(typecode, cats) {
  const code = normCode(typecode)
  if (!code) return ''
  for (const c of cats || []) {
    for (const t of String(c.types || '').split('|')) {
      const prefix = normCode(t)
      if (prefix && code.indexOf(prefix) === 0) return c.key
    }
  }
  return ''
}

function roundKey(p) {
  return p.name + '@' + (p.location || '').split(',').map((x) => Number(x).toFixed(5)).join(',')
}

/** 走廊检索：采样 → 逐点周边搜索 → 去重 → 里程/偏离 → 排序 */
export async function corridorSearch(client, opts) {
  const o = opts || {}
  const signal = o.signal || (client && client.signal) || null
  const points = o.points || []
  const stepM = o.stepM || 400
  const radiusM = o.radiusM || 300
  const maxSamples = o.maxSamples || 240
  const source = o.source || 'v5'
  const pageSize = o.pageSize || 25
  const onProgress = o.onProgress
  const cats = o.categories || []
  const samples = samplePolyline(points, stepM, maxSamples)
  const found = new Map()
  let calls = 0
  for (let i = 0; i < samples.length; i++) {
    if (signal && signal.aborted) throw new Error('走廊检索已取消')
    const s = samples[i]
    const loc = s.point[0].toFixed(6) + ',' + s.point[1].toFixed(6)
    let res = null
    try { res = await client.poi({ around: { location: loc, radius: radiusM }, types: o.types || undefined, keywords: o.keywords || undefined, source, pageSize }) } catch (e) { res = null }
    calls++
    if (res && res.pois) {
      for (const p of res.pois) {
        if (!p.location) continue
        const key = p.name + '|' + p.typecode + '|' + p.location
        const prev = found.get(key)
        const proj = projectToPolyline(p.location.split(',').map(Number), points)
        const rec = {
          name: p.name, address: p.address, typecode: p.typecode, type: p.type, location: p.location,
          adname: p.adname, cityname: p.cityname, tel: p.tel, rating: p.rating, cost: p.cost,
          chainageM: proj.chainageM, deviationM: proj.deviationM, fromSample: i, nearSampleM: s.chainageM
        }
        if (!prev || rec.deviationM < prev.deviationM) found.set(key, rec)
      }
    }
    if (onProgress && (i % 10 === 0 || i === samples.length - 1)) onProgress({ done: i + 1, total: samples.length, found: found.size })
  }
  const rows = Array.from(found.values())
    .filter((r) => r.deviationM <= (o.maxDeviationM || radiusM + 50))
    .sort((a, b) => a.chainageM - b.chainageM)
  return { samples: samples.length, calls, total: rows.length, rows }
}

/** 路线切分：把每个 step 变成带里程区间的路段/节点条目 */
export function nodesFromRoute(path) {
  const out = []
  let acc = 0
  for (const step of path.steps || []) {
    const pts = String(step.polyline || '').split(';').filter(Boolean).map((s) => s.split(',').map(Number))
    const len = pts.length > 1 ? polylineLength(pts) : (step.distanceM || 0)
    const text = step.instruction || ''
    const tags = []
    if (/桥|隧道|立交|环岛|匝道|地下通道|天桥/.test(text)) tags.push('桥隧/立交')
    if (/路口|交叉|左转|右转|掉头|进入/.test(text)) tags.push('路口/转向')
    out.push({ index: out.length + 1, fromKm: acc / 1000, toKm: (acc + len) / 1000, lengthM: Math.round(len), road: step.road || '', instruction: text, tags })
    acc += len
  }
  return out
}

export function toCsv(rows, columns) {
  const cols = columns || ['chainageKm', 'deviationM', 'name', 'typecode', 'address', 'location', 'tel']
  const head = cols.join(',')
  const body = rows.map((r) => cols.map((c) => {
    const v = c === 'chainageKm' ? (r.chainageM / 1000).toFixed(2) : (c === 'deviationM' ? Math.round(r.deviationM) : r[c])
    const s = v === undefined || v === null ? '' : String(v).replace(/"/g, '""')
    return /[",\n]/.test(s) ? '"' + s + '"' : s
  }).join(','))
  return [head].concat(body).join('\n')
}
