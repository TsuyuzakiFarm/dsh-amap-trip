// amap-trip · 模式状态与偏好记忆（P3，零依赖）
// 两个模式物理隔离：daily 记个人偏好，ops 只记作业默认值；互不读取、互不写入。
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export const MODES = ['daily', 'ops']

export const DAILY_TEMPLATE = [
  '# 日常偏好（amap-trip）',
  '',
  '> 本项目只记录「你自己说的、长期有效的」出行偏好；插件不会自行推测写入。',
  '',
  '## 口味与忌口',
  '',
  '## 节奏与体力',
  '',
  '## 预算',
  '',
  '## 交通偏好',
  '',
  '## 常去地点',
  '',
  '## 随行与设备',
  ''
].join('\n')

export const OPS_TEMPLATE = [
  '# 工作模式默认值（amap-trip）',
  '',
  '> 只放作业参数，不放行程信息、不放起终点、不放与个人有关的内容。',
  '',
  '## 默认类别',
  'crowd, emergency',
  '',
  '## 走廊宽度（米）',
  '300',
  '',
  '## 采样步长（米）',
  '500',
  '',
  '## 排序',
  'chainage',
  '',
  '## 叠加',
  'none',
  ''
].join('\n')

export function profilePath(mode, stateDir) {
  return join(stateDir, 'profiles', (MODES.indexOf(mode) >= 0 ? mode : 'daily') + '.md')
}

function statePath(stateDir) { return join(stateDir, 'state.json') }

export function readState(stateDir) {
  try { return JSON.parse(readFileSync(statePath(stateDir), 'utf8')) } catch (e) { return { mode: 'daily', updatedAt: null } }
}

export function writeState(stateDir, state) {
  mkdirSync(stateDir, { recursive: true })
  const p = statePath(stateDir)
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, p)
}

export function getMode(stateDir, fallback) {
  const s = readState(stateDir)
  return MODES.indexOf(s.mode) >= 0 ? s.mode : (fallback || 'daily')
}

export function setMode(stateDir, mode) {
  if (MODES.indexOf(mode) < 0) throw new Error('未知模式: ' + mode + '（可选 daily | ops）')
  const s = readState(stateDir)
  s.mode = mode
  s.updatedAt = new Date().toISOString()
  writeState(stateDir, s)
  return s
}

export function ensureProfile(mode, stateDir) {
  const p = profilePath(mode, stateDir)
  if (!existsSync(p)) {
    mkdirSync(join(stateDir, 'profiles'), { recursive: true })
    writeFileSync(p, mode === 'ops' ? OPS_TEMPLATE : DAILY_TEMPLATE)
  }
  return p
}

export function readPrefs(mode, stateDir) {
  const p = ensureProfile(mode, stateDir)
  const raw = readFileSync(p, 'utf8')
  const sections = {}
  let cur = '(未分节)'
  sections[cur] = []
  for (const line of raw.split('\n')) {
    const m = /^##\s+(.*)$/.exec(line)
    if (m) { cur = m[1].trim(); sections[cur] = sections[cur] || []; continue }
    if (line.trim() && line.trim()[0] !== '>' && line.trim()[0] !== '#') sections[cur].push(line.trim())
  }
  return { path: p, raw, sections }
}

export function appendPref(mode, stateDir, section, text) {
  const p = ensureProfile(mode, stateDir)
  const raw = readFileSync(p, 'utf8')
  const stamp = new Date().toISOString().slice(0, 10)
  const line = '- ' + stamp + ' ' + String(text).replace(/\s+/g, ' ').trim()
  const key = String(section || '').trim()
  let out
  if (!key) out = raw.replace(/\s*$/, '') + '\n' + line + '\n'
  else {
    const idx = raw.indexOf('## ' + key)
    if (idx < 0) out = raw.replace(/\s*$/, '') + '\n\n## ' + key + '\n\n' + line + '\n'
    else {
      const rest = raw.slice(idx)
      const nextSec = rest.slice(3).search(/^##\s/m)
      const endAbs = nextSec < 0 ? raw.length : idx + 3 + nextSec
      const head = raw.slice(0, endAbs).replace(/\s*$/, '')
      out = head + '\n' + line + '\n\n' + raw.slice(endAbs).replace(/^\s+/, '')
    }
  }
  writeFileSync(p, out)
  return { path: p, added: line, bytes: out.length }
}

export function forgetPref(mode, stateDir, query) {
  const p = ensureProfile(mode, stateDir)
  const q = String(query || '').trim().toLowerCase()
  if (!q) throw new Error('forget 需要 query')
  const raw = readFileSync(p, 'utf8')
  const keep = []
  const removed = []
  for (const line of raw.split('\n')) {
    if (line.trim().toLowerCase().indexOf(q) >= 0) removed.push(line.trim())
    else keep.push(line)
  }
  writeFileSync(p, keep.join('\n'))
  return { path: p, removed }
}
