import { describe, it } from 'mocha'
import { expect } from 'chai'
import { testESMImport, PerformanceTimer } from '../test-helpers.js'

describe('ESM Module Import Tests', function () {
  this.timeout(10000)

  describe('Core Utility Modules', () => {
    it('should import debug.js with named exports', async () => {
      const result = await testESMImport('../lib/debug.js')

      expect(result.success).to.be.true
      expect(result.namedExports).to.include('handlers')
      expect(result.namedExports).to.include('ACL')
      expect(result.namedExports).to.include('fs')
      expect(result.namedExports).to.include('metadata')
    })

    it('should import http-error.js with default export', async () => {
      const result = await testESMImport('../lib/http-error.js')

      expect(result.success).to.be.true
      expect(result.hasDefault).to.be.true

      const { default: HTTPError } = result.module
      expect(typeof HTTPError).to.equal('function')

      const error = HTTPError(404, 'Not Found')
      expect(error.status).to.equal(404)
      expect(error.message).to.equal('Not Found')
    })

    it('should import utils.js with named exports', async () => {
      const result = await testESMImport('../lib/utils.js')

      expect(result.success).to.be.true
      expect(result.namedExports).to.include('getContentType')
      expect(result.namedExports).to.include('pathBasename')
      expect(result.namedExports).to.include('translate')
      expect(result.namedExports).to.include('routeResolvedFile')
    })
  })

  describe('Handler Modules', () => {
    it('should import all handler modules successfully', async () => {
      const handlers = [
        '../lib/handlers/get.js',
        '../lib/handlers/post.js',
        '../lib/handlers/put.js',
        '../lib/handlers/delete.js',
        '../lib/handlers/copy.js',
        '../lib/handlers/patch.js'
      ]

      for (const handler of handlers) {
        const result = await testESMImport(handler)
        expect(result.success).to.be.true
        expect(result.hasDefault).to.be.true
        expect(typeof result.module.default).to.equal('function')
      }
    })

    it('should import allow.js and validate permission function', async () => {
      const result = await testESMImport('../lib/handlers/allow.js')

      expect(result.success).to.be.true
      expect(result.hasDefault).to.be.true

      const { default: allow } = result.module
      expect(typeof allow).to.equal('function')

      const readHandler = allow('Read')
      expect(typeof readHandler).to.equal('function')
    })
  })

  describe('Infrastructure Modules', () => {
    it('should import metadata.js with Metadata constructor', async () => {
      const result = await testESMImport('../lib/metadata.js')

      expect(result.success).to.be.true
      expect(result.namedExports).to.include('Metadata')

      const { Metadata } = result.module
      const metadata = new Metadata()
      expect(metadata.isResource).to.be.false
      expect(metadata.isContainer).to.be.false
    })

    it('should import acl-checker.js with ACLChecker class', async () => {
      const result = await testESMImport('../lib/acl-checker.js')

      expect(result.success).to.be.true
      expect(result.hasDefault).to.be.true
      expect(result.namedExports).to.include('DEFAULT_ACL_SUFFIX')
      expect(result.namedExports).to.include('clearAclCache')

      const { default: ACLChecker, DEFAULT_ACL_SUFFIX } = result.module
      expect(typeof ACLChecker).to.equal('function')
      expect(DEFAULT_ACL_SUFFIX).to.equal('.acl')
    })

    it('should import lock.js with withLock function', async () => {
      const result = await testESMImport('../lib/lock.js')

      expect(result.success).to.be.true
      expect(result.hasDefault).to.be.true

      const { default: withLock } = result.module
      expect(typeof withLock).to.equal('function')
    })
  })

  describe('Application Modules', () => {
    it('should import ldp-middleware.js with router function', async () => {
      const result = await testESMImport('../lib/ldp-middleware.js')

      expect(result.success).to.be.true
      expect(result.hasDefault).to.be.true

      const { default: LdpMiddleware } = result.module
      expect(typeof LdpMiddleware).to.equal('function')
    })

    it('should import main entry point index.js', async () => {
      const result = await testESMImport('../index.js')

      expect(result.success).to.be.true
      expect(result.hasDefault).to.be.true
      expect(result.namedExports).to.include('createServer')
      expect(result.namedExports).to.include('startCli')
    })
  })

  describe('Import Performance', () => {
    it('should measure ESM import performance', async () => {
      const timer = new PerformanceTimer()

      timer.start()
      const result = await testESMImport('../index.js')
      const duration = timer.end()

      expect(result.success).to.be.true
      expect(duration).to.be.lessThan(1000) // Should import in less than 1 second
      console.log(`ESM import took ${duration.toFixed(2)}ms`)
    })
  })
})
