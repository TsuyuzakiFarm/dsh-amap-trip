/**
 * 开发期解析垫片：让**裸 node** 也能解析到 DSH 宿主自带的 `@deepseek-ai/*` 包。
 *
 * ## 为什么需要
 *
 * `plugin/index.mjs` 里有一行 `import Schema from '@deepseek-ai/schemastery'`。在 DSH
 * 进程里，这个裸导入由 **DSH 自己的解析路由**接管（一个挂在 Node ESM/CJS 解析器上的
 * 拦截层），会就近落到 DSH 安装自带的那一份实例上——所以插件**不需要**任何本地
 * `node_modules/`。但在 DSH 之外直接用裸 `node` 跑测试时没有这层拦截，于是报
 * `ERR_MODULE_NOT_FOUND`。
 *
 * 这个垫片用 Node 的 `module.registerHooks()` 复刻同样一件事：只有当常规解析失败，
 * 且说明符是 `@deepseek-ai/*` 时，才改用 **DSH 安装根** 作为解析锚点重试一次。
 * 常规解析成功的导入一律原样放行，不改变任何既有语义。
 *
 * ## 用法
 *
 * ```bash
 * DSH_INSTALL_ROOT=/path/to/dsh-install/node_modules \
 *   node --import ./scripts/dsh-resolve.mjs scripts/test-prefs.mjs .
 * ```
 *
 * `DSH_INSTALL_ROOT` 未设时，会尝试从本文件向上解析 `@deepseek-ai/dsh/package.json`
 * 自动定位（插件被放在 DSH 安装树内时可自动生效）。
 *
 * ## 为什么不用本地 node_modules 软链
 *
 * 「更近的物理包优先于 peer 声明」——插件目录下真的放一份 `node_modules/@deepseek-ai/
 * schemastery`，运行期它就会**盖住宿主那一份**，插件拿到第二个实例。垫片只在裸 node
 * 测试进程里生效，不会污染 DSH 运行期的解析结果。
 *
 * @module dsh-resolve
 */

import { registerHooks } from 'node:module'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 定位 DSH 安装根（即含 `@deepseek-ai/dsh` 的那个 `node_modules`）。
 * @returns {string | undefined} 绝对路径；定位不到时为 undefined。
 */
function findInstallRoot() {
  const fromEnv = process.env.DSH_INSTALL_ROOT
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  try {
    // `<root>/@deepseek-ai/dsh/package.json` → 去掉两段得到 `<root>`。
    return dirname(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')))
  } catch {
    return undefined
  }
}

const installRoot = findInstallRoot()
const anchor = installRoot === undefined ? undefined : pathToFileURL(join(installRoot, 'dsh-resolve-anchor.mjs')).href

registerHooks({
  /**
   * 解析钩子：常规解析失败时，把 `@deepseek-ai/*` 改锚到 DSH 安装根再试一次。
   * @param {string} specifier - 被导入的说明符。
   * @param {object} context - Node 提供的解析上下文（含 parentURL / conditions）。
   * @param {(specifier: string, context: object) => object} nextResolve - 下一层解析器。
   * @returns {object} 解析结果。
   */
  resolve(specifier, context, nextResolve) {
    if (anchor === undefined || !specifier.startsWith('@deepseek-ai/')) return nextResolve(specifier, context)
    try {
      return nextResolve(specifier, context)
    } catch (original) {
      try {
        return nextResolve(specifier, { ...context, parentURL: anchor })
      } catch {
        throw original
      }
    }
  },
})
