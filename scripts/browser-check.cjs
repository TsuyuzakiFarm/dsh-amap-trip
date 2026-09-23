const puppeteer = require('/home/abinkaiki/.dsh/profiles/web/node_modules/puppeteer-core')
const EXE = process.argv[2], TARGET = process.argv[3], OUT = process.argv[4]
const main = async () => {
  const logs = [], net = []
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  page.on('console', (m) => { const t = m.text(); if (t) logs.push('[console.' + m.type() + '] ' + t.slice(0, 150)) })
  page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e.message).slice(0, 150)))
  page.on('requestfailed', (r) => logs.push('[failed] ' + r.url().slice(0, 80) + ' :: ' + (r.failure() && r.failure().errorText)))
  page.on('response', (r) => { const u = r.url(); if (/amap|autonavi/.test(u)) net.push(r.status() + ' ' + u.slice(0, 76)) })
  try { await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 }) } catch (e) { logs.push('[goto] ' + e.message) }
  await new Promise((r) => setTimeout(r, 9000))
  const diag = await page.$eval('#diag', (el) => el.textContent).catch(() => '(无)')
  const meta = await page.$eval('#meta', (el) => el.textContent).catch(() => '')
  const tiles = net.filter((x) => /is\.autonavi\.com/.test(x)).length
  await page.screenshot({ path: OUT })
  await browser.close()
  console.log('== ' + TARGET.slice(0, 72))
  console.log('诊断条: ' + (diag || '(空)'))
  console.log('meta : ' + meta)
  console.log('高德响应 ' + net.length + ' 条（底图瓦片 ' + tiles + '）')
  net.slice(0, 5).forEach((x) => console.log('   ' + x))
  console.log('控制台/错误 ' + logs.length + ' 条:')
  logs.slice(0, 8).forEach((x) => console.log('   ' + x))
}
main().catch((e) => console.log('FAIL ' + e.message))