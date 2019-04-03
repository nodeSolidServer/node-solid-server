const { lock } = require('proper-lockfile')

const staleSeconds = 30

// Obtains a lock on the path, and maintains it until the callback finishes
function withLock (path, options = {}, callback = options) {
  return new Promise(async (resolve, reject) => {
    let releaseLock, result
    try {
      // Obtain the lock
      releaseLock = await lock(path, {
        retries: 10,
        update: 1000,
        stale: staleSeconds * 1000,
        realpath: !!options.mustExist,
        onCompromised: () =>
          reject(new Error(`The file at ${path} was not updated within ${staleSeconds}s.`))
      })
      // Hold on to the lock until the callback's returned promise resolves
      result = await callback()
    } catch (error) {
      reject(error)
    // Ensure the lock is always released
    } finally {
      await releaseLock()
    }
    resolve(result)
  })
}

module.exports = withLock
