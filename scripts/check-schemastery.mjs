// 核对 Schemastery 行为（默认值填充 / 非法值拒绝 / Standard Schema 接口）
// 在 profile 目录下运行（那里能解析 @deepseek-ai/*）: cd ~/.dsh/profiles/web && node <本文件>
const { default: Schema } = await import('@deepseek-ai/schemastery')
const Config = Schema.object({
  mode: Schema.union(['daily', 'ops']).default('daily'),
  timeoutMs: Schema.number().default(20000),
  corridor: Schema.object({ stepM: Schema.number().default(500) }).default({ stepM: 500 })
})
console.log('callable:', typeof Config === 'function')
console.log('partial →', JSON.stringify(Config({ timeoutMs: 5000 })))
try { Config({ mode: 'nope' }) } catch (e) { console.log('非法值被拒绝 ✓') }
console.log('~standard:', !!Config['~standard'])
