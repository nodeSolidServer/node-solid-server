const AsyncLock = require('async-lock')

const lock = new AsyncLock({ timeout: 30 * 1000 })

// Obtains a lock on the path, and maintains it until the task finishes
async function withLock (path, executeTask) {
  return await lock.acquire(path, executeTask)
}

module.exports = withLock
