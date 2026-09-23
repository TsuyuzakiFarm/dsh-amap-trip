import { readFileSync } from 'node:fs'
const f = process.argv[2]
const html = readFileSync(f, 'utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
console.log('内联脚本块数: ' + scripts.length)
scripts.forEach((s, i) => {
  const body = s.replace(/^\s*const ROUTE = [\s\S]*?;\s*$/m, 'const ROUTE = [];')
  try { new Function(body); console.log('  脚本' + (i + 1) + ': 语法 ✓ (' + s.length + ' 字符)') } catch (e) { console.log('  脚本' + (i + 1) + ': ✗ ' + e.message) }
})
const need = [['折叠面板', /id="panel"/], ['切换按钮', /id="toggle"/], ['诊断条', /id="diag"/], ['隐藏类', /\.hidden\{/], ['安全密钥', /securityJsCode/], ['loader', /webapi\.amap\.com\/loader\.js/], ['Polyline', /AMap\.Polyline/], ['setFitView', /setFitView/], ['点击清单定位', /setZoomAndCenter/]]
console.log('结构自检: ' + need.map(([n, re]) => n + (re.test(html) ? '✓' : '✗')).join(' | '))