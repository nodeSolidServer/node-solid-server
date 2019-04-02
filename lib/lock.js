const { lock } = require('proper-lockfile')

// Obtains a lock on the path, and maintains it until the callback finishes
async function withLock (path, options = {}, callback = options) {
  const { mustExist } = options
  const releaseLock = await lock(path, { retries: 10, realpath: !!mustExist })
  try {
    return await callback()
  } finally {
    releaseLock()
  }
}

module.exports = withLock
