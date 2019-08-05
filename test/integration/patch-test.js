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

describe('PATCH', () => {
  var request
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
    describe('with an unsupported content type', describePatch({
      path: '/read-write.ttl',
      patch: `other syntax`,
      contentType: 'text/other'
    }, { // expected:
      status: 415,
      text: 'Unsupported patch content type: text/other'
    }))

    describe('containing invalid syntax', describePatch({
      path: '/read-write.ttl',
      patch: `invalid syntax`
    }, { // expected:
      status: 400,
      text: 'Patch document syntax error'
    }))

    describe('without relevant patch element', describePatch({
      path: '/read-write.ttl',
      patch: `<> a solid:Patch.`
    }, { // expected:
      status: 400,
      text: 'No patch for https://tim.localhost:7777/read-write.ttl found'
    }))

    describe('with neither insert nor delete', describePatch({
      path: '/read-write.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>.`
    }, { // expected:
      status: 400,
      text: 'Patch should at least contain inserts or deletes'
    }))
  })

  describe('with insert', () => {
    describe('on a non-existing file', describePatch({
      path: '/new.ttl',
      exists: false,
      patch: `<> solid:patches <https://tim.localhost:7777/new.ttl>;
                 solid:inserts { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </new.ttl#>.\n@prefix tim: </>.\n\ntim:x tim:y tim:z.\n\n'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-only.ttl>;
                 solid:inserts { <x> <y> <z>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/append-only.ttl>;
                 solid:inserts { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </append-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/write-only.ttl>;
                 solid:inserts { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </write-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
    }))

    describe('on a resource with parent folders that do not exist', describePatch({
      path: '/folder/cool.ttl',
      exists: false,
      patch: `<> solid:patches <https://tim.localhost:7777/folder/cool.ttl>;
        solid:inserts { <x> <y> <z>. }.`
    }, {
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : <#>.\n@prefix fol: <./>.\n\nfol:x fol:y fol:z.\n\n'
    }))
  })

  describe('with insert and where', () => {
    describe('on a non-existing file', describePatch({
      path: '/new.ttl',
      exists: false,
      patch: `<> solid:patches <https://tim.localhost:7777/new.ttl>;
                 solid:inserts { ?a <y> <z>. };
                 solid:where   { ?a <b> <c>. }.`
    }, { // expected:
      status: 409,
      text: 'The patch could not be applied'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-only.ttl>;
                 solid:inserts { ?a <y> <z>. };
                 solid:where   { ?a <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/append-only.ttl>;
                 solid:inserts { ?a <y> <z>. };
                 solid:where   { ?a <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/write-only.ttl>;
                 solid:inserts { ?a <y> <z>. };
                 solid:where   { ?a <b> <c>. }.`
    }, { // expected:
      // Allowing the insert would either return 200 or 409,
      // thereby inappropriately giving the user (guess-based) read access;
      // therefore, we need to return 403.
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with read-append access', () => {
      describe('with a matching WHERE clause', describePatch({
        path: '/read-append.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-append.ttl>;
                   solid:inserts { ?a <y> <z>. };
                   solid:where   { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-append.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c; tim:y tim:z.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-append.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-append.ttl>;
                   solid:where   { ?a <y> <z>. };
                   solid:inserts { ?a <s> <t>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))
    })

    describe('on a resource with read-write access', () => {
      describe('with a matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:inserts { ?a <y> <z>. };
                   solid:where   { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c; tim:y tim:z.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:where   { ?a <y> <z>. };
                   solid:inserts { ?a <s> <t>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))
    })
  })

  describe('with delete', () => {
    describe('on a non-existing file', describePatch({
      path: '/new.ttl',
      exists: false,
      patch: `<> solid:patches <https://tim.localhost:7777/new.ttl>;
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 409,
      text: 'The patch could not be applied'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-only.ttl>;
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/append-only.ttl>;
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/write-only.ttl>;
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      // Allowing the delete would either return 200 or 409,
      // thereby inappropriately giving the user (guess-based) read access;
      // therefore, we need to return 403.
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with read-append access', describePatch({
      path: '/read-append.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-append.ttl>;
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with read-write access', () => {
      describe('with a patch for existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:deletes { <a> <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a patch for non-existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:deletes { <x> <y> <z>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))

      describe('with a matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:where   { ?a <b> <c>. };
                   solid:deletes { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:where   { ?a <y> <z>. };
                   solid:deletes { ?a <b> <c>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))
    })
  })

  describe('deleting and inserting', () => {
    describe('on a non-existing file', describePatch({
      path: '/new.ttl',
      exists: false,
      patch: `<> solid:patches <https://tim.localhost:7777/new.ttl>;
                 solid:inserts { <x> <y> <z>. };
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 409,
      text: 'The patch could not be applied'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-only.ttl>;
                 solid:inserts { <x> <y> <z>. };
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/append-only.ttl>;
                 solid:inserts { <x> <y> <z>. };
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/write-only.ttl>;
                 solid:inserts { <x> <y> <z>. };
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      // Allowing the delete would either return 200 or 409,
      // thereby inappropriately giving the user (guess-based) read access;
      // therefore, we need to return 403.
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with read-append access', describePatch({
      path: '/read-append.ttl',
      patch: `<> solid:patches <https://tim.localhost:7777/read-append.ttl>;
                 solid:inserts { <x> <y> <z>. };
                 solid:deletes { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'No permission'
    }))

    describe('on a resource with read-write access', () => {
      describe('executes deletes before inserts', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:inserts { <x> <y> <z>. };
                   solid:deletes { <x> <y> <z>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))

      describe('with a patch for existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:inserts { <x> <y> <z>. };
                   solid:deletes { <a> <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
      }))

      describe('with a patch for non-existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:inserts { <x> <y> <z>. };
                   solid:deletes { <q> <s> <s>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))

      describe('with a matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:where   { ?a <b> <c>. };
                   solid:inserts { ?a <y> <z>. };
                   solid:deletes { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:y tim:z.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> solid:patches <https://tim.localhost:7777/read-write.ttl>;
                   solid:where   { ?a <y> <z>. };
                   solid:inserts { ?a <y> <z>. };
                   solid:deletes { ?a <b> <c>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))
    })
  })

  // Creates a PATCH test for the given resource with the given expected outcomes
  function describePatch ({ path, exists = true, patch, contentType = 'text/n3' },
                          { status = 200, text, result }) {
    return () => {
      const filename = `patch${path}`
      var originalContents
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
      var response
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
