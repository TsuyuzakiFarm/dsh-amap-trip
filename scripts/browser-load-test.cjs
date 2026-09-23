const puppeteer = require('/home/abinkaiki/.dsh/profiles/web/node_modules/puppeteer-core')
const EXE = process.argv[2], URL_ = process.argv[3]
const main = async () => {
  const errs = []
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage()
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 60)))
  const resp = await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ status: () => 'ERR ' + e.message }))
  await new Promise((r) => setTimeout(r, 8000))
  const info = await page.evaluate(() => ({ url: location.href.slice(0, 60), title: document.title, hasM: !!window.__m, li: document.querySelectorAll('#list li').length, diag: (document.getElementById('diag') || {}).textContent || '' }))
  console.log('status=' + (resp && resp.status ? resp.status() : '?') + ' | url=' + info.url)
  console.log('title=' + info.title + ' | __m=' + info.hasM + ' | 清单项=' + info.li)
  console.log('诊断: ' + String(info.diag).slice(0, 100))
  console.log('错误 ' + errs.length + ' 条: ' + errs.slice(0, 3).join(' / '))
  await browser.close()
}
main().catch((e) => console.log('FAIL ' + e.message))