const { default: Schema } = await import('/home/abinkaiki/.npm/_npx/c8633a242642d858/node_modules/@deepseek-ai/schemastery/lib/index.mjs')
const Config = Schema.object({
  mode: Schema.union(['daily', 'ops']).default('daily'),
  timeoutMs: Schema.number().default(20000),
  cacheDir: Schema.string().default('/tmp/x'),
  bigBytes: Schema.number().default(4096),
  keys: Schema.array(Schema.string()).default(['A', 'B']),
  nested: Schema.object({ stepM: Schema.number().default(500), radiusM: Schema.number().default(300) }).default({ stepM: 500, radiusM: 300 })
})
console.log('typeof schema:', typeof Config, '| callable:', typeof Config === 'function')
const filled = Config({ timeoutMs: 5000 })
console.log('partial →', JSON.stringify(filled))
try { const bad = Config({ mode: 'nope' }); console.log('invalid accepted (bad):', JSON.stringify(bad)) } catch (e) { console.log('invalid rejected ✓:', String(e.message).slice(0, 90)) }
try { const bad2 = Config({ timeoutMs: 'abc' }); console.log('type-coerced/bad accepted:', JSON.stringify(bad2)) } catch (e) { console.log('type error rejected ✓:', String(e.message).slice(0, 90)) }
console.log('schema has ~standard:', !!(Config['~standard']))