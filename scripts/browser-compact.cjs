const puppeteer = require('/home/abinkaiki/.dsh/profiles/web/node_modules/puppeteer-core')
const EXE = process.argv[2]
const urls = process.argv.slice(3)
const main = async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] })
  for (const u of urls) {
    const logs = [], tiles = []
    const page = await browser.newPage()
    await page.setViewport({ width: 1100, height: 700 })
    page.on('pageerror', (e) => logs.push(String(e.message).slice(0, 70)))
    page.on('response', (r) => { const s = r.url(); if (/is\.autonavi\.com/.test(s)) tiles.push(r.status()) })
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 7000))
    const diag = await page.$eval('#diag', (el) => el.textContent.slice(0, 60)).catch(() => '')
    console.log(u.split('/').pop().padEnd(28) + ' 瓦片=' + String(tiles.length).padStart(3) + ' 错误=' + logs.length + ' ' + (logs[0] || '').padEnd(30) + (diag ? ' diag=' + diag : ''))
    await page.close()
  }
  await browser.close()
}
main().catch((e) => console.log('FAIL ' + e.message))