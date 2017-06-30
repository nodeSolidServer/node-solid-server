// Integration tests for PATCH with text/n3
const { assert } = require('chai')
const ldnode = require('../../index')
const path = require('path')
const supertest = require('supertest')
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

  before(done => {
    const server = ldnode.createServer(serverOptions)
    server.listen(port, done)
    request = supertest(serverUri)
  })

  describe('with an unsupported request content type', () => {
    it('returns a 415', () =>
      request.patch('/read-write.ttl')
        .set('Authorization', `Bearer ${userCredentials}`)
        .set('Content-Type', 'text/other')
        .send('other content type')
        .expect(415)
        .then(response => {
          assert.include(response.text, 'Unsupported patch content type: text/other')
        })
    )
  })

  describe('with a patch document containing invalid syntax', () => {
    it('returns a 400', () =>
      request.patch('/read-write.ttl')
        .set('Authorization', `Bearer ${userCredentials}`)
        .set('Content-Type', 'text/n3')
        .send('invalid')
        .expect(400)
        .then(response => {
          assert.include(response.text, 'Invalid patch document')
        })
    )
  })

  describe('with a patch document without relevant patch element', () => {
    it('returns a 400', () =>
      request.patch('/read-write.ttl')
        .set('Authorization', `Bearer ${userCredentials}`)
        .set('Content-Type', 'text/n3')
        .send(n3Patch(`
          <> a p:Patch.`
        ))
        .expect(400)
        .then(response => {
          assert.include(response.text, 'No patch for https://tim.localhost:7777/read-write.ttl found')
        })
    )
  })

  describe('with a patch document without insert and without deletes', () => {
    it('returns a 400', () =>
      request.patch('/read-write.ttl')
        .set('Authorization', `Bearer ${userCredentials}`)
        .set('Content-Type', 'text/n3')
        .send(n3Patch(`
          <> p:patches <https://tim.localhost:7777/read-write.ttl>.`
        ))
        .expect(400)
        .then(response => {
          assert.include(response.text, 'Patch should at least contain inserts or deletes')
        })
    )
  })

  describe('appending', () => {
    describe('to a resource with read-only access', () => {
      it('returns a 403', () =>
        request.patch('/read-only.ttl')
          .set('Authorization', `Bearer ${userCredentials}`)
          .set('Content-Type', 'text/n3')
          .send(n3Patch(`
            <> p:patches <https://tim.localhost:7777/read-only.ttl>;
               p:insert { <d> <e> <f>. }.`
          ))
          .expect(403)
          .then(response => {
            assert.include(response.text, 'Access denied')
          })
      )

      it('does not modify the file', () => {
        assert.equal(read('patch/read-only.ttl'),
          '<a> <b> <c>.\n')
      })
    })

    describe('to a non-existing file', () => {
      after(() => rm('patch/new.ttl'))

      it('returns a 200', () =>
        request.patch('/new.ttl')
          .set('Authorization', `Bearer ${userCredentials}`)
          .set('Content-Type', 'text/n3')
          .send(n3Patch(`
            <> p:patches <https://tim.localhost:7777/new.ttl>;
               p:insert { <d> <e> <f>. }.`
          ))
          .expect(200)
          .then(response => {
            assert.include(response.text, 'Patch applied successfully')
          })
      )

      it('creates the file', () => {
        assert.equal(read('patch/new.ttl'),
          '@prefix : </new.ttl#>.\n@prefix tim: </>.\n\ntim:d tim:e tim:f.\n\n')
      })
    })

    describe('to a resource with append access', () => {
      before(() => backup('patch/append-only.ttl'))
      after(() => restore('patch/append-only.ttl'))

      it('returns a 200', () =>
        request.patch('/append-only.ttl')
          .set('Authorization', `Bearer ${userCredentials}`)
          .set('Content-Type', 'text/n3')
          .send(n3Patch(`
            <> p:patches <https://tim.localhost:7777/append-only.ttl>;
               p:insert { <d> <e> <f>. }.`
          ))
          .expect(200)
          .then(response => {
            assert.include(response.text, 'Patch applied successfully')
          })
      )

      it('patches the file', () => {
        assert.equal(read('patch/append-only.ttl'),
          '@prefix : </append-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\n')
      })
    })

    describe('to a resource with write access', () => {
      before(() => backup('patch/write-only.ttl'))
      after(() => restore('patch/write-only.ttl'))

      it('returns a 200', () =>
        request.patch('/write-only.ttl')
          .set('Authorization', `Bearer ${userCredentials}`)
          .set('Content-Type', 'text/n3')
          .send(n3Patch(`
            <> p:patches <https://tim.localhost:7777/write-only.ttl>;
               p:insert { <d> <e> <f>. }.`
          ))
          .expect(200)
          .then(response => {
            assert.include(response.text, 'Patch applied successfully')
          })
      )

      it('patches the file', () => {
        assert.equal(read('patch/write-only.ttl'),
          '@prefix : </write-only.ttl#>.\n@prefix tim: </>.\n\ntim:a tim:b tim:c.\n\ntim:d tim:e tim:f.\n\n')
      })
    })
  })
})

function n3Patch (contents) {
  return `@prefix p: <http://example.org/patch#>.\n${contents}`
}
