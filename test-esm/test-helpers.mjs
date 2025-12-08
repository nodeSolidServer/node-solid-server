// ESM Test Configuration
import { performance as perf } from 'perf_hooks'
export const testConfig = {
  timeout: 10000,
  slow: 2000,
  nodeOptions: '--experimental-loader=esmock'
}

// Utility to create test servers with ESM modules
export async function createTestServer (options = {}) {
  const { default: createApp } = await import('../index.mjs')

  const defaultOptions = {
    port: 0, // Random port
    serverUri: 'https://localhost',
    webid: true,
    multiuser: false,
    ...options
  }

  const app = createApp(defaultOptions)
  return app
}

// Utility to test ESM import functionality
export async function testESMImport (modulePath) {
  try {
    const module = await import(modulePath)
    return {
      success: true,
      module,
      hasDefault: 'default' in module,
      namedExports: Object.keys(module).filter(key => key !== 'default')
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

// Performance measurement utilities
export class PerformanceTimer {
  constructor () {
    this.startTime = null
    this.endTime = null
  }

  start () {
    this.startTime = perf.now()
    return this
  }

  end () {
    this.endTime = perf.now()
    return this.duration
  }

  get duration () {
    return this.endTime - this.startTime
  }
}
