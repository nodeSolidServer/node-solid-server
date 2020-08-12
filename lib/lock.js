/* eslint-disable no-async-promise-executor */

const cache = require('./cache-provider')
const { EventEmitter } = require('events')

/**
 * Obtains a lock on the path, and maintains it until the callback finishes
 * @param {*} path
 * @param {*} options
 * @param {*} callback
 */
function withLock (path, options = {}, callback = options) {
  return new Promise(async (resolve, reject) => {
    let result
    try {
      // Hold on to the lock until the callback's returned promise resolves
      lock().acquire(path) // boolean // kept unlimited time
      result = await callback()
    } catch (error) {
      reject(error)
    // Ensure the lock is always released
    } finally {
      // allways releaseLock()
      lock().release(path)
    }
    resolve(result)
  })
}

/**
 * https://medium.com/trabe/synchronize-cache-updates-in-node-js-with-a-mutex-d5b395457138
 *  There are some npm libraries that implement some kind of mutex support (lock, mutex, async-lock) but none of them feel as simple and elegant as Valeri’s code.
 *   His solution (pasted below with original comments):
 *
 *   Uses a boolean to keep the locked/unlocked state of the mutex.
 *   Uses promises to wait for the release of the lock.
 *   Relies on an event emitter to notify the code that is waiting when the lock is released.
 */
const lock = () => {
  const ee = new EventEmitter()
  ee.setMaxListeners(0)

  return {
    acquire: key =>
      new Promise(resolve => {
        if (!cache.instance().get(key)) {
          cache.instance().set(key, true)
          return resolve()
        }

        const tryAcquire = value => {
          if (!cache.instance().get(key)) {
            cache.instance().set(key, true)
            ee.removeListener(key, tryAcquire)
            return resolve(value)
          }
        }

        ee.on(key, tryAcquire)
      }),

    // If we pass a value, on release this value
    // will be propagated to all the code that's waiting for
    // the lock to release
    release: (key, value) => {
      cache.instance().del(key)
      setImmediate(() => ee.emit(key, value))
    }
  }
}

module.exports = withLock
