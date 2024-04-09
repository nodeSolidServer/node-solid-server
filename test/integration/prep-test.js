// Integration tests for PATCH with text/n3
const { assert } = require('chai')
const ldnode = require('../../index')
const path = require('path')
const supertest = require('supertest')
const fs = require('fs')
const { read, rm, backup, restore } = require('../utils')

// Server settings
const port = 7777
const serverUri = `https://tim.localhost:${port}`
const root = path.join(__dirname, '../resources/patch')
const configPath = path.join(__dirname, '../resources/config')
const serverOptions = {
  root,
  configPath,
  serverUri,
  multiuser: false,
  webid: true,
  sslKey: path.join(__dirname, '../keys/key.pem'),
  sslCert: path.join(__dirname, '../keys/cert.pem'),
  forceUser: `${serverUri}/profile/card#me`
}

describe('PATCH through text/n3', () => {
  let request
  let server

  // Start the server
  before(done => {
    server = ldnode.createServer(serverOptions)
    server.listen(port, done)
    request = supertest(serverUri)
  })

  after(() => {
    server.close()
  })

  describe('with a patch document', () => {
    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> a solid:InsertDeletePatch;
                 solid:inserts { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </append-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> a solid:InsertDeletePatch;
                 solid:inserts { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </write-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
    }))
  })

  // Creates a PATCH test for the given resource with the given expected outcomes
  function describePatch ({ path, exists = true, patch, contentType = 'text/n3' },
    { status = 200, text, result }) {
    return () => {
      const filename = `patch${path}`
      let originalContents
      // Back up and restore an existing file
      if (exists) {
        before(() => backup(filename))
        after(() => restore(filename))
        // Store its contents to verify non-modification
        if (!result) {
          originalContents = read(filename)
        }
      // Ensure a non-existing file is removed
      } else {
        before(() => rm(filename))
        after(() => rm(filename))
      }

      // Create the request and obtain the response
      let response
      before((done) => {
        request.patch(path)
          .set('Content-Type', contentType)
          .send(`@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n${patch}`)
          .then(res => { response = res })
          .then(done, done)
      })

      // Verify the response's status code and body text
      it(`returns HTTP status code ${status}`, () => {
        assert.isObject(response)
        assert.equal(response.statusCode, status)
      })
      it(`has "${text}" in the response`, () => {
        assert.isObject(response)
        assert.include(response.text, text)
      })

      // For existing files, verify correct patch application
      if (exists) {
        if (result) {
          it('patches the file correctly', () => {
            assert.equal(read(filename), result)
          })
        } else {
          it('does not modify the file', () => {
            assert.equal(read(filename), originalContents)
          })
        }
      // For non-existing files, verify creation and contents
      } else {
        if (result) {
          it('creates the file', () => {
            assert.isTrue(fs.existsSync(`${root}/${path}`))
          })

          it('writes the correct contents', () => {
            assert.equal(read(filename), result)
          })
        } else {
          it('does not create the file', () => {
            assert.isFalse(fs.existsSync(`${root}/${path}`))
          })
        }
      }
    }
  }
})
