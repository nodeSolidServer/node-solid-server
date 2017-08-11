var assert = require('chai').assert
var fs = require('fs-extra')
var $rdf = require('rdflib')
var request = require('request')
var path = require('path')

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

var address = 'https://localhost:3456/test/'
let rootPath = path.join(__dirname, '../resources')

var aclExtension = '.acl'
var metaExtension = '.meta'

var testDir = 'acl-tls/testDir'
var testDirAclFile = testDir + '/' + aclExtension
var testDirMetaFile = testDir + '/' + metaExtension

var abcFile = testDir + '/abc.ttl'
var abcAclFile = abcFile + aclExtension

var globFile = testDir + '/*'

var groupFile = testDir + '/group'

var origin1 = 'http://example.org/'
var origin2 = 'http://example.com/'

var user1 = 'https://user1.databox.me/profile/card#me'
var user2 = 'https://user2.databox.me/profile/card#me'
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

describe('ACL with WebID+TLS', function () {
  var ldpHttpsServer
  var ldp = ldnode.createServer({
    mount: '/test',
    root: rootPath,
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    webid: true,
    strictOrigin: true,
    auth: 'tls',
    rejectUnauthorized: false
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(3456, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(rootPath, 'index.html'))
    fs.removeSync(path.join(rootPath, 'index.html.acl'))
  })

  function createOptions (path, user) {
    var options = {
      url: address + path,
      headers: {
        accept: 'text/turtle'
      }
    }
    if (user) {
      options.agentOptions = userCredentials[user]
    }
    return options
  }

  describe('no ACL', function () {
    it('should return 403 for any resource', function (done) {
      var options = createOptions('/acl-tls/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })

    it('should have `User` set in the Response Header', function (done) {
      var options = createOptions('/acl-tls/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        assert.equal(response.headers['user'],
          'https://user1.databox.me/profile/card#me')
        done()
      })
    })

    it('should return a 401 and WWW-Authenticate header without credentials', (done) => {
      let options = {
        url: address + '/acl-tls/no-acl/',
        headers: { accept: 'text/turtle' }
      }

      request(options, (error, response, body) => {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        assert.equal(response.headers['www-authenticate'],
          'WebID-TLS realm="https://localhost:8443"')
        done()
      })
    })
  })

  describe('empty .acl', function () {
    describe('with no defaultForNew in parent path', function () {
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
    describe('with defaultForNew in parent path', function () {
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
          assert.equal(response.statusCode, 409)
          done()
        })
      })
      it('should allow creation of new files', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it('should allow creation of new files in deeper paths', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/test-folder/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it('Should create empty acl file', function (done) {
        var options = createOptions('/acl-tls/write-acl/empty-acl/another-empty-folder/test-file.acl', 'user1')
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
      it('should return text/turtle for the acl file', function (done) {
        var options = createOptions('/acl-tls/write-acl/.acl', 'user1')
        options.headers = {
          accept: 'text/turtle'
        }
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          assert.match(response.headers['content-type'], /text\/turtle/)
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
      it("should access test file's acl file", function (done) {
        var options = createOptions('/acl-tls/write-acl/test-file.acl', 'user1')
        options.headers = {
          accept: 'text/turtle'
        }
        request.get(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          assert.match(response.headers['content-type'], /text\/turtle/)
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
      var options = createOptions('/acl-tls/origin/test-folder/.acl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <https://localhost:3456/test/acl-tls/origin/test-folder/.acl>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Public> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n' +
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
    it('user1 should be denied access to test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl-tls/origin/test-folder/', 'user1')
        options.headers.origin = origin2

        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    it('agent should be able to access test directory', function (done) {
      var options = createOptions('/acl-tls/origin/test-folder/')
      options.headers.origin = origin1

      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
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
    it('agent should be denied access to test directory when origin is invalid',
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
    var body = fs.readFileSync(path.join(__dirname, '../resources/acl-tls/read-acl/.acl'))
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
    it('user1 should be able to PATCH a resource', function (done) {
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

  describe.skip('Group', function () {
    var groupTriples = '<#> a <http://xmlns.com/foaf/0.1/Group>;\n' +
      ' <http://xmlns.com/foaf/0.1/member> <a>, <b>, <' + user2 + '> .\n'
    var body = '<#Owner>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <' + address + abcFile + '>, <' +
      address + abcAclFile + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <' + address + testDir + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n' +
      '<#Group>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <' + address + abcFile + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agentClass> <' + address + groupFile + '#>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
    it('user1 should be able to add group triples', function (done) {
      var options = createOptions(groupFile, 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = groupTriples
      request.put(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 201)
        done()
      })
    })
    it("user1 should be able to modify test file's ACL file", function (done) {
      var options = createOptions(abcAclFile, 'user1')
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
      var options = createOptions(abcAclFile, 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions(abcFile, 'user1')
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
    it('user1 should be able to access test file', function (done) {
      var options = createOptions(abcFile, 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test file's ACL file", function (done) {
      var options = createOptions(abcAclFile, 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to access test file', function (done) {
      var options = createOptions(abcFile, 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to modify test file', function (done) {
      var options = createOptions(abcFile, 'user2')
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
      var options = createOptions(abcFile)
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent should not be able to modify test file', function (done) {
      var options = createOptions(abcFile)
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
    it('user1 should be able to delete group file', function (done) {
      var options = createOptions(groupFile, 'user1')
      request.del(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user1 should be able to delete test file's ACL file", function (done) {
      var options = createOptions(abcAclFile, 'user1')
      request.del(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
  })

  describe('defaultForNew', function () {
    before(function () {
      rm('/acl-tls/write-acl/default-for-new/.acl')
      rm('/acl-tls/write-acl/default-for-new/test-file.ttl')
    })

    var body = '<#Owner> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Default> a <http://www.w3.org/ns/auth/acl#Authorization>;\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <./>;\n' +
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

describe('ACL with WebID through X-SSL-Cert', function () {
  var ldpHttpsServer
  before(function (done) {
    const ldp = ldnode.createServer({
      mount: '/test',
      root: rootPath,
      webid: true,
      auth: 'tls',
      certificateHeader: 'X-SSL-Cert'
    })
    ldpHttpsServer = ldp.listen(3456, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
    fs.removeSync(path.join(rootPath, 'index.html'))
    fs.removeSync(path.join(rootPath, 'index.html.acl'))
  })

  function prepareRequest (certHeader, setResponse) {
    return done => {
      const options = {
        url: address.replace('https', 'http') + '/acl-tls/write-acl/.acl',
        headers: { 'X-SSL-Cert': certHeader }
      }
      request(options, function (error, response) {
        setResponse(response)
        done(error)
      })
    }
  }

  describe('without certificate', function () {
    var response
    before(prepareRequest('', res => { response = res }))

    it('should return 401', function () {
      assert.propertyVal(response, 'statusCode', 401)
    })
  })

  describe('with a valid certificate', function () {
    // Escape certificate for usage in HTTP header
    const escapedCert = userCredentials.user1.cert.toString()
                        .replace(/\n/g, '\t')

    var response
    before(prepareRequest(escapedCert, res => { response = res }))

    it('should return 200', function () {
      assert.propertyVal(response, 'statusCode', 200)
    })

    it('should set the User header', function () {
      assert.propertyVal(response.headers, 'user', 'https://user1.databox.me/profile/card#me')
    })
  })

  describe('with a local filename as certificate', function () {
    const certFile = path.join(__dirname, '../keys/user1-cert.pem')

    var response
    before(prepareRequest(certFile, res => { response = res }))

    it('should return 401', function () {
      assert.propertyVal(response, 'statusCode', 401)
    })
  })

  describe('with an invalid certificate value', function () {
    var response
    before(prepareRequest('xyz', res => { response = res }))

    it('should return 401', function () {
      assert.propertyVal(response, 'statusCode', 401)
    })
  })

  describe('with an invalid certificate', function () {
    const invalidCert =
`-----BEGIN CERTIFICATE-----
ABCDEF
-----END CERTIFICATE-----`
    .replace(/\n/g, '\t')

    var response
    before(prepareRequest(invalidCert, res => { response = res }))

    it('should return 401', function () {
      assert.propertyVal(response, 'statusCode', 401)
    })
  })
})
