const { lock } = require('proper-lockfile')

const staleSeconds = 30

// Obtains a lock on the path, and maintains it until the callback finishes
async function withLock (path, options = {}, callback = options) {
  // Obtain the lock
  const releaseLock = await lock(path, {
    retries: 10,
    update: 1000,
    stale: staleSeconds * 1000,
    realpath: !!options.mustExist,
    onCompromised: () => {
      throw new Error(`The file at ${path} was not updated within ${staleSeconds}s.`)
    }
  })

  // Try executing the callback, waiting for its returned promise to resolve
  try {
    return await callback()
  } finally {
    // Ensure the lock is always released
    releaseLock()
  }
}

module.exports = withLock
