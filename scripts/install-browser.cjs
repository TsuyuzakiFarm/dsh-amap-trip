// 下载 chrome-headless-shell（用于验证生成的地图页真能渲染）
// 用法: node scripts/install-browser.cjs <工作区目录>
// 依赖 @puppeteer/browsers：优先用 profile 里的那份，找不到就用本机全局的
const path = require('path')
const os = require('os')
const candidates = [
  path.join(os.homedir(), '.dsh/profiles/web/node_modules/@puppeteer/browsers'),
  '@puppeteer/browsers'
]
let b = null
for (const c of candidates) { try { b = require(c); break } catch (e) {} }
if (!b) { console.log('缺少 @puppeteer/browsers，请先 npm i -g @puppeteer/browsers'); process.exit(1) }
const main = async () => {
  const platform = b.detectBrowserPlatform()
  const buildId = await b.resolveBuildId(b.Browser.CHROMEHEADLESSSHELL, platform, 'stable')
  console.log('chrome-headless-shell ' + buildId + ' (' + platform + ')')
  const r = await b.install({ browser: b.Browser.CHROMEHEADLESSSHELL, buildId, cacheDir: process.argv[2] + '/.browsers' })
  console.log('INSTALLED ' + r.executablePath)
}
main().catch((e) => console.log('FAIL ' + e.message))
