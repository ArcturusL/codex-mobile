const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

async function main() {
  const listeners = {}
  const deleted = []
  const actions = []
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    self: {
      addEventListener: (name, listener) => { listeners[name] = listener },
      skipWaiting: async () => { actions.push('skipWaiting') },
      clients: { claim: async () => { actions.push('claim') } },
      registration: { unregister: async () => { actions.push('unregister') } },
    },
    caches: {
      keys: async () => ['codexweb-shell-v1', 'codexweb-shell-v2', 'unrelated-cache'],
      delete: async (name) => { deleted.push(name); return true },
    },
  })
  const pending = []
  const event = { waitUntil: (promise) => pending.push(promise) }
  listeners.install(event)
  await Promise.all(pending)
  listeners.activate(event)
  await Promise.all(pending)
  assert.deepEqual(deleted, ['codexweb-shell-v1', 'codexweb-shell-v2'])
  assert.deepEqual(actions, ['skipWaiting', 'claim', 'unregister'])
  assert.equal(listeners.fetch, undefined)
  console.log('PASS: legacy app caches retired, unrelated caches preserved, no fetch interception')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
