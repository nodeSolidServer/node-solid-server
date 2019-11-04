var assert = require('chai').assert
var fs = require('fs-extra')
var $rdf = require('rdflib')
var request = require('request')
var path = require('path')
var { cleanDir } = require('../utils')

/**
 * Note: this test suite requires an internet connection, since it actually
 * uses remote accounts https://user1.databox.me and https://user2.databox.me
 */

// Helper functions for the FS
var rm = require('../utils').rm
// var write = require('./utils').write
// var cp = require('./utils').cp
// var read = require('./utils').read

var ldnode = require('../../index')
var ns = require('solid-namespace')($rdf)

const port = 7777
const serverUri = `https://localhost:7777`
const rootPath = path.join(__dirname, '../resources/acl-tls')
const dbPath = path.join(rootPath, 'db')
const configPath = path.join(rootPath, 'config')

var aclExtension = '.acl'
var metaExtension = '.meta'

var testDir = 'acl-tls/testDir'
var testDirAclFile = testDir + '/' + aclExtension
var testDirMetaFile = testDir + '/' + metaExtension

var abcFile = testDir + '/abc.ttl'

var globFile = testDir + '/*'

var origin1 = 'http://example.org/'
var origin2 = 'http://example.com/'

var user1 = 'https://tim.localhost:7777/profile/card#me'
var user2 = 'https://nicola.localhost:7777/profile/card#me'
var address = 'https://tim.localhost:7777'
var userCredentials = {
  user1: {
    cert: fs.readFileSync(path.join(__dirname, '../keys/user1-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, '../keys/user1-key.pem'))
  },
  user2: {
    cert: fs.readFileSync(path.join(__dirname, '../keys/user2-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, '../keys/user2-key.pem'))
  }
}

// TODO Remove skip. TLS is currently broken, but is not a priority to fix since
// the current Solid spec does not require supporting webid-tls on the resource
// server. The current spec only requires the resource server to support webid-oidc,
// and it requires the IDP to support webid-tls as a log in method, so that users of
// a webid-tls client certificate can still use their certificate (and not a
// username/password pair or other login method) to "bridge" from webid-tls to
// webid-oidc.
describe.skip('ACL with WebID+TLS', function () {
  var ldpHttpsServer
  var serverConfig = {
    root: rootPath,
    serverUri,
    dbPath,
    port,
    configPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    webid: true,
    multiuser: true,
    auth: 'tls',
    rejectUnauthorized: false,
    strictOrigin: true,
    host: { serverUri }
  }
  var ldp = ldnode.createServer(serverConfig)

  before(function (done) {
    ldpHttpsServer = ldp.listen(port, () => {
      setTimeout(() => {
        done()
      }, 0)
    })
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    cleanDir(rootPath)
  })

  function createOptions (path, user) {
    var options = {
      url: address + path,
      headers: {
        accept: 'text/turtle',
        'content-type': 'text/plain'
      }
    }
    if (user) {
      options.agentOptions = userCredentials[user]
    }
    return options
  }

  describe('no ACL', function () {
    it('should return 500 for any resource', function (done) {
      rm('.acl')
      var options = createOptions('/acl-tls/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 500)
        done()
      })
    })

    it('should have `User` set in the Response Header', function (done) {
      rm('.acl')
      var options = createOptions('/acl-tls/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.headers['user'], 'https://user1.databox.me/profile/card#me')
        done()
      })
    })

    it.skip('should return a 401 and WWW-Authenticate header without credentials', (done) => {
      rm('.acl')
      let options = {
        url: address + '/acl-tls/no-acl/',
        headers: { accept: 'text/turtle' }
      }

      request(options, (error, response, body) => {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        assert.equal(response.headers['www-authenticate'], 'WebID-TLS realm="https://localhost:8443"')
        done()
      })
    })
  })

  describe('empty .acl', function () {
    describe('with no default in parent path', function () {
      it('should give no access', function (done) {
        var options = createOptions('/acl-tls/empty-acl/test-folder', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not let edit the .acl', function (done) {
        var options = createOptions('/acl-tls/empty-acl/.acl', 'user1')
        options.headers = {
          'content-type': 'text/turtle'
        }
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not let read the .acl', function (done) {
        var options = createOptions('/acl-tls/empty-acl/.acl', 'user1')
        options.headers = {
          accept: 'text/turtle'
        }
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    })
    describe('with default in parent path', function () {
      before(function () {
        rm('/acl-tls/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/acl-tls/write-acl/empty-acl/test-folder/test-file')
        rm('/acl-tls/write-acl/empty-acl/test-file')
        rm('/acl-tls/write-acl/test-file')
        rm('/acl-tls/write-acl/test-file.acl')
      })

      it('should fail to create a container', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/test-folder/', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403) // TODO: SHOULD THIS RETURN A 409?
          done()
        })
      })
      it('should not allow creation of new files', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not allow creation of new files in deeper paths', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/test-folder/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('Should not create empty acl file', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/another-empty-folder/test-file.acl', 'user1')
        options.headers = {
          'content-type': 'text/turtle'
        }
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not return text/turtle for the acl file', function (done) {
        var options = createOptions('/acl-tls/write-acl/.acl', 'user1')
        options.headers = {
          accept: 'text/turtle'
        }
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          // assert.match(response.headers['content-type'], /text\/turtle/)
          done()
        })
      })
      it('should create test file', function (done) {
        var options = createOptions('/acl-tls/write-acl/test-file', 'user1')
        options.headers = {
          'content-type': 'text/turtle'
        }
        options.body = '<a> <b> <c> .'
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it("should create test file's acl file", function (done) {
        var options = createOptions('/acl-tls/write-acl/test-file.acl', 'user1')
        options.headers = {
          'content-type': 'text/turtle'
        }
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it("should not access test file's acl file", function (done) {
        var options = createOptions('/acl-tls/write-acl/test-file.acl', 'user1')
        options.headers = {
          accept: 'text/turtle'
        }
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          // assert.match(response.headers['content-type'], /text\/turtle/)
          done()
        })
      })

      after(function () {
        rm('/acl-tls/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/acl-tls/write-acl/empty-acl/test-folder/test-file')
        rm('/acl-tls/write-acl/empty-acl/test-file')
        rm('/acl-tls/write-acl/test-file')
        rm('/acl-tls/write-acl/test-file.acl')
      })
    })
  })

  describe('Origin', function () {
    before(function () {
      rm('acl-tls/origin/test-folder/.acl')
    })

    it('should PUT new ACL file', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/.acl', 'user1', 'text/turtle')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <https://localhost:3456/test/acl-tls/origin/test-folder/>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Public> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agentClass> <http://www.w3.org/ns/auth/acl#AuthenticatedAgent>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
        // TODO triple header
        // TODO user header
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin1

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('user1 should not be able to access test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    it('agent not should be able to access test directory', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin1

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('agent should not be able to access test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 401)
          done()
        })
      })

    after(function () {
      rm('acl-tls/origin/test-folder/.acl')
    })
  })

  describe('Mixed statement Origin', function () {
    before(function () {
      rm('acl-tls/origin/test-folder/.acl')
    })

    it('should PUT new ACL file', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/.acl', 'user1', 'text/turtle')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<#Owner1> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <https://localhost:3456/test/acl-tls/origin/test-folder/>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Owner2> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
          ' <http://www.w3.org/ns/auth/acl#accessTo> <https://localhost:3456/test/acl-tls/origin/test-folder/>;\n' +
          ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
          ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Public> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agentClass> <http://www.w3.org/ns/auth/acl#AuthenticatedAgent>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
        // TODO triple header
        // TODO user header
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin1

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('user1 should not be able to access test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    it('agent should not be able to access test directory for logged in users', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin1

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('agent should not be able to access test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 401)
          done()
        })
      })

    after(function () {
      rm('acl-tls/origin/test-folder/.acl')
    })
  })

  describe('Read-only', function () {
    var body = fs.readFileSync(path.join(__dirname, '../resources/acl-tls/tim.localhost/read-acl/.acl'))
    it('user1 should be able to access ACL file', function (done) {
      var options = createOptions('/acl-tls/read-acl/.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/acl-tls/read-acl/', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify ACL file', function (done) {
      var options = createOptions('/acl-tls/read-acl/.acl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = body
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it('user2 should be able to access test directory', function (done) {
      var options = createOptions('/acl-tls/read-acl/', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to access ACL file', function (done) {
      var options = createOptions('/acl-tls/read-acl/.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to modify ACL file', function (done) {
      var options = createOptions('/acl-tls/read-acl/.acl', 'user2')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('agent should be able to access test direcotory', function (done) {
      var options = createOptions('/acl-tls/read-acl/')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should not be able to modify ACL file', function (done) {
      var options = createOptions('/acl-tls/read-acl/.acl')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
  })

  describe.skip('Glob', function () {
    it('user2 should be able to send glob request', function (done) {
      var options = createOptions(globFile, 'user2')
      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        var globGraph = $rdf.graph()
        $rdf.parse(body, globGraph, address + testDir + '/', 'text/turtle')
        var authz = globGraph.the(undefined, undefined, ns.acl('Authorization'))
        assert.equal(authz, null)
        done()
      })
    })
    it('user1 should be able to send glob request', function (done) {
      var options = createOptions(globFile, 'user1')
      request.get(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        var globGraph = $rdf.graph()
        $rdf.parse(body, globGraph, address + testDir + '/', 'text/turtle')
        var authz = globGraph.the(undefined, undefined, ns.acl('Authorization'))
        assert.equal(authz, null)
        done()
      })
    })
    it('user1 should be able to delete ACL file', function (done) {
      var options = createOptions(testDirAclFile, 'user1')
      request.del(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
  })

  describe('Append-only', function () {
    // var body = fs.readFileSync(__dirname + '/resources/acl-tls/append-acl/abc.ttl.acl')
    it("user1 should be able to access test file's ACL file", function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl.acl', 'user1')
      request.head(options, function (error, response) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it.skip('user1 should be able to PATCH a resource', function (done) {
      var options = createOptions('/acl-tls/append-inherited/test.ttl', 'user1')
      options.headers = {
        'content-type': 'application/sparql-update'
      }
      options.body = 'INSERT DATA { :test  :hello 456 .}'
      request.patch(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    // TODO POST instead of PUT
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<a> <b> <c> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it("user2 should not be able to access test file's ACL file", function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to access test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 (with append permission) cannot use PUT to append', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl', 'user2')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('agent should not be able to access test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent (with append permissions) should not PUT', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc.ttl')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<g> <h> <i> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    after(function () {
      rm('acl-tls/append-inherited/test.ttl')
    })
  })

  describe('Restricted', function () {
    var body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./abc2.ttl>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Restricted> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./abc2.ttl>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user2 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>.\n'
    it("user1 should be able to modify test file's ACL file", function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl.acl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = body
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it("user1 should be able to access test file's ACL file", function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<a> <b> <c> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it('user2 should be able to access test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test file's ACL file", function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to modify test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl', 'user2')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it('agent should not be able to access test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent should not be able to modify test file', function (done) {
      var options = createOptions('/acl-tls/append-acl/abc2.ttl')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
  })

  describe('default', function () {
    before(function () {
      rm('/acl-tls/write-acl/default-for-new/.acl')
      rm('/acl-tls/write-acl/default-for-new/test-file.ttl')
    })

    var body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#default> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Default> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#default> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
    it("user1 should be able to modify test directory's ACL file", function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/.acl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = body
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it("user1 should be able to access test direcotory's ACL file", function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to create new test file', function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/test-file.ttl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<a> <b> <c> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it('user1 should be able to access new test file', function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/test-file.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test direcotory's ACL file", function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to access new test file', function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/test-file.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to modify new test file', function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/test-file.ttl', 'user2')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('agent should be able to access new test file', function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/test-file.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should not be able to modify new test file', function (done) {
      var options = createOptions('/acl-tls/write-acl/default-for-new/test-file.ttl')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<d> <e> <f> .\n'
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })

    after(function () {
      rm('/acl-tls/write-acl/default-for-new/.acl')
      rm('/acl-tls/write-acl/default-for-new/test-file.ttl')
    })
  })

  describe('WebID delegation tests', function () {
    it('user1 should be able delegate to user2', function (done) {
      // var body = '<' + user1 + '> <http://www.w3.org/ns/auth/acl#delegates> <' + user2 + '> .'
      var options = {
        url: user1,
        headers: {
          'content-type': 'text/turtle'
        },
        agentOptions: {
          key: userCredentials.user1.key,
          cert: userCredentials.user1.cert
        }
      }
      request.post(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    // it("user2 should be able to make requests on behalf of user1", function(done) {
    // var options = createOptions(abcdFile, 'user2')
    // options.headers = {
    // 'content-type': 'text/turtle',
    // 'On-Behalf-Of': '<' + user1 + '>'
    // }
    // options.body = "<d> <e> <f> ."
    // request.post(options, function(error, response, body) {
    // assert.equal(error, null)
    // assert.equal(response.statusCode, 200)
    // done()
    // })
    // })
  })

  describe.skip('Cleanup', function () {
    it('should remove all files and dirs created', function (done) {
      try {
        // must remove the ACLs in sync
        fs.unlinkSync(path.join(__dirname, '../resources/' + testDir + '/dir1/dir2/abcd.ttl'))
        fs.rmdirSync(path.join(__dirname, '../resources/' + testDir + '/dir1/dir2/'))
        fs.rmdirSync(path.join(__dirname, '../resources/' + testDir + '/dir1/'))
        fs.unlinkSync(path.join(__dirname, '../resources/' + abcFile))
        fs.unlinkSync(path.join(__dirname, '../resources/' + testDirAclFile))
        fs.unlinkSync(path.join(__dirname, '../resources/' + testDirMetaFile))
        fs.rmdirSync(path.join(__dirname, '../resources/' + testDir))
        fs.rmdirSync(path.join(__dirname, '../resources/acl-tls/'))
        done()
      } catch (e) {
        done(e)
      }
    })
  })
})
