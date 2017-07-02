// Integration tests for PATCH with text/n3
const { assert } = require('chai')
const ldnode = require('../../index')
const path = require('path')
const supertest = require('supertest')
const fs = require('fs')
const { read, rm, backup, restore } = require('../test-utils')

// Server settings
const port = 7777
const serverUri = `https://tim.localhost:${port}`
const root = path.join(__dirname, '../resources/patch')
const serverOptions = {
  serverUri,
  root,
  dbPath: path.join(root, 'db'),
  sslKey: path.join(__dirname, '../keys/key.pem'),
  sslCert: path.join(__dirname, '../keys/cert.pem'),
  webid: true,
  idp: false
}
const userCredentials = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkFWUzVlZk5pRUVNIn0.eyJpc3MiOiJodHRwczovL2xvY2FsaG9zdDo3Nzc3Iiwic3ViIjoiaHR0cHM6Ly90aW0ubG9jYWxob3N0Ojc3NzcvcHJvZmlsZS9jYXJkI21lIiwiYXVkIjoiN2YxYmU5YWE0N2JiMTM3MmIzYmM3NWU5MWRhMzUyYjQiLCJleHAiOjc3OTkyMjkwMDksImlhdCI6MTQ5MjAyOTAwOSwianRpIjoiZWY3OGQwYjY3ZWRjNzJhMSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.H9lxCbNc47SfIq3hhHnj48BE-YFnvhCfDH9Jc4PptApTEip8sVj0E_u704K_huhNuWBvuv3cDRDGYZM7CuLnzgJG1BI75nXR9PYAJPK9Ketua2KzIrftNoyKNamGqkoCKFafF4z_rsmtXQ5u1_60SgWRcouXMpcHnnDqINF1JpvS21xjE_LbJ6qgPEhu3rRKcv1hpRdW9dRvjtWb9xu84bAjlRuT02lyDBHgj2utxpE_uqCbj48qlee3GoqWpGkSS-vJ6JA0aWYgnyv8fQsxf9rpdFNzKRoQO6XYMy6niEKj8aKgxjaUlpoGGJ5XtVLHH8AGwjYXR8iznYzJvEcB7Q'

describe('PATCH', () => {
  var request

  // Start the server
  before(done => {
    const server = ldnode.createServer(serverOptions)
    server.listen(port, done)
    request = supertest(serverUri)
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
      patch: `<> a p:Patch.`
    }, { // expected:
      status: 400,
      text: 'No patch for https://tim.localhost:7777/read-write.ttl found'
    }))

    describe('with neither insert nor delete', describePatch({
      path: '/read-write.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>.`
    }, { // expected:
      status: 400,
      text: 'Patch should at least contain inserts or deletes'
    }))
  })

  describe('with insert', () => {
    describe('on a non-existing file', describePatch({
      path: '/new.ttl',
      exists: false,
      patch: `<> p:patches <https://tim.localhost:7777/new.ttl>;
                 p:insert { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </new.ttl#>.\n@prefix tim: </>.\n\ntim:x tim:y tim:z.\n\n'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-only.ttl>;
                 p:insert { <x> <y> <z>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/append-only.ttl>;
                 p:insert { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </append-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/write-only.ttl>;
                 p:insert { <x> <y> <z>. }.`
    }, { // expected:
      status: 200,
      text: 'Patch applied successfully',
      result: '@prefix : </write-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
    }))
  })

  describe('with insert and where', () => {
    describe('on a non-existing file', describePatch({
      path: '/new.ttl',
      exists: false,
      patch: `<> p:patches <https://tim.localhost:7777/new.ttl>;
                 p:insert { ?a <y> <z>. };
                 p:where  { ?a <b> <c>. }.`
    }, { // expected:
      status: 409,
      text: 'The patch could not be applied'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-only.ttl>;
                 p:insert { ?a <y> <z>. };
                 p:where  { ?a <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/append-only.ttl>;
                 p:insert { ?a <y> <z>. };
                 p:where  { ?a <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/write-only.ttl>;
                 p:insert { ?a <y> <z>. };
                 p:where  { ?a <b> <c>. }.`
    }, { // expected:
      // Allowing the insert would either return 200 or 409,
      // thereby inappropriately giving the user (guess-based) read access;
      // therefore, we need to return 403.
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with read-append access', () => {
      describe('with a matching WHERE clause', describePatch({
        path: '/read-append.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-append.ttl>;
                   p:insert { ?a <y> <z>. };
                   p:where  { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-append.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c; tim:y tim:z.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-append.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-append.ttl>;
                   p:where  { ?a <y> <z>. };
                   p:insert { ?a <s> <t>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))
    })

    describe('on a resource with read-write access', () => {
      describe('with a matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:insert { ?a <y> <z>. };
                   p:where  { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c; tim:y tim:z.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:where  { ?a <y> <z>. };
                   p:insert { ?a <s> <t>. }.`
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
      patch: `<> p:patches <https://tim.localhost:7777/new.ttl>;
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 409,
      text: 'The patch could not be applied'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-only.ttl>;
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/append-only.ttl>;
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/write-only.ttl>;
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      // Allowing the delete would either return 200 or 409,
      // thereby inappropriately giving the user (guess-based) read access;
      // therefore, we need to return 403.
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with read-append access', describePatch({
      path: '/read-append.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-append.ttl>;
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with read-write access', () => {
      describe('with a patch for existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:delete { <a> <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a patch for non-existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:delete { <x> <y> <z>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))

      describe('with a matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:where  { ?a <b> <c>. };
                   p:delete { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:where  { ?a <y> <z>. };
                   p:delete { ?a <b> <c>. }.`
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
      patch: `<> p:patches <https://tim.localhost:7777/new.ttl>;
                 p:insert { <x> <y> <z>. };
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 409,
      text: 'The patch could not be applied'
    }))

    describe('on a resource with read-only access', describePatch({
      path: '/read-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-only.ttl>;
                 p:insert { <x> <y> <z>. };
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with append-only access', describePatch({
      path: '/append-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/append-only.ttl>;
                 p:insert { <x> <y> <z>. };
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with write-only access', describePatch({
      path: '/write-only.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/write-only.ttl>;
                 p:insert { <x> <y> <z>. };
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      // Allowing the delete would either return 200 or 409,
      // thereby inappropriately giving the user (guess-based) read access;
      // therefore, we need to return 403.
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with read-append access', describePatch({
      path: '/read-append.ttl',
      patch: `<> p:patches <https://tim.localhost:7777/read-append.ttl>;
                 p:insert { <x> <y> <z>. };
                 p:delete { <a> <b> <c>. }.`
    }, { // expected:
      status: 403,
      text: 'Access denied'
    }))

    describe('on a resource with read-write access', () => {
      describe('executes deletes before inserts', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:insert { <x> <y> <z>. };
                   p:delete { <x> <y> <z>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))

      describe('with a patch for existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:insert { <x> <y> <z>. };
                   p:delete { <a> <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\ntim:x tim:y tim:z.\n\n'
      }))

      describe('with a patch for non-existing data', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:insert { <x> <y> <z>. };
                   p:delete { <q> <s> <s>. }.`
      }, { // expected:
        status: 409,
        text: 'The patch could not be applied'
      }))

      describe('with a matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:where  { ?a <b> <c>. };
                   p:insert { ?a <y> <z>. };
                   p:delete { ?a <b> <c>. }.`
      }, { // expected:
        status: 200,
        text: 'Patch applied successfully',
        result: '@prefix : </read-write.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:y tim:z.\n\ntim:d tim:e tim:f.\n\n'
      }))

      describe('with a non-matching WHERE clause', describePatch({
        path: '/read-write.ttl',
        patch: `<> p:patches <https://tim.localhost:7777/read-write.ttl>;
                   p:where  { ?a <y> <z>. };
                   p:insert { ?a <y> <z>. };
                   p:delete { ?a <b> <c>. }.`
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
               .set('Authorization', `Bearer ${userCredentials}`)
               .set('Content-Type', contentType)
               .send(`@prefix p: <http://example.org/patch#>.\n${patch}`)
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
