// Integration tests for PATCH
const assert = require('chai').assert
const ldnode = require('../../index')
const path = require('path')
const supertest = require('supertest')

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
  idp: true
}
const userCredentials = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkFWUzVlZk5pRUVNIn0.eyJpc3MiOiJodHRwczovL2xvY2FsaG9zdDo3Nzc3Iiwic3ViIjoiaHR0cHM6Ly90aW0ubG9jYWxob3N0Ojc3NzcvcHJvZmlsZS9jYXJkI21lIiwiYXVkIjoiN2YxYmU5YWE0N2JiMTM3MmIzYmM3NWU5MWRhMzUyYjQiLCJleHAiOjc3OTkyMjkwMDksImlhdCI6MTQ5MjAyOTAwOSwianRpIjoiZWY3OGQwYjY3ZWRjNzJhMSIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUifQ.H9lxCbNc47SfIq3hhHnj48BE-YFnvhCfDH9Jc4PptApTEip8sVj0E_u704K_huhNuWBvuv3cDRDGYZM7CuLnzgJG1BI75nXR9PYAJPK9Ketua2KzIrftNoyKNamGqkoCKFafF4z_rsmtXQ5u1_60SgWRcouXMpcHnnDqINF1JpvS21xjE_LbJ6qgPEhu3rRKcv1hpRdW9dRvjtWb9xu84bAjlRuT02lyDBHgj2utxpE_uqCbj48qlee3GoqWpGkSS-vJ6JA0aWYgnyv8fQsxf9rpdFNzKRoQO6XYMy6niEKj8aKgxjaUlpoGGJ5XtVLHH8AGwjYXR8iznYzJvEcB7Q'

describe('PATCH', () => {
  var request

  before(done => {
    const server = ldnode.createServer(serverOptions)
    server.listen(port, done)
    request = supertest(serverUri)
  })

  describe('on a resource to which the user has read-only access', () => {
    it('returns a 403', () =>
      request.patch(`/read-only.ttl`)
        .set('Authorization', `Bearer ${userCredentials}`)
        .set('Content-Type', 'text/n3')
        .send(n3Patch(`
          <> a p:Patch;
             p:insert { <a> <b> <c>. }.`
        ))
        .expect(403)
        .then(response => {
          assert.include(response.text, 'Access denied')
        })
    )
  })
})

function n3Patch (contents) {
  return `@prefix p: <http://example.org/patch#>.\n${contents}`
}
