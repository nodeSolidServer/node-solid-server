var assert = require('chai').assert
var fs = require('fs')
var $rdf = require('rdflib')
var request = require('request')
var path = require('path')

// Helper functions for the FS
var rm = require('./test-utils').rm
// var write = require('./test-utils').write
// var cp = require('./test-utils').cp
// var read = require('./test-utils').read

var ldnode = require('../index')
var ns = require('solid-namespace')($rdf)

describe('ACL HTTP', function () {
  this.timeout(10000)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  var address = 'https://localhost:3456/test/'

  var ldpHttpsServer
  var ldp = ldnode.createServer({
    mount: '/test',
    root: path.join(__dirname, '/resources'),
    sslKey: path.join(__dirname, '/keys/key.pem'),
    sslCert: path.join(__dirname, '/keys/cert.pem'),
    webid: true
  })

  before(function (done) {
    ldpHttpsServer = ldp.listen(3456, done)
  })

  after(function () {
    if (ldpHttpsServer) ldpHttpsServer.close()
  })

  var aclExtension = '.acl'
  var metaExtension = '.meta'

  var testDir = 'acl/testDir'
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
      cert: fs.readFileSync(path.join(__dirname, '/keys/user1-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, '/keys/user1-key.pem'))
    },
    user2: {
      cert: fs.readFileSync(path.join(__dirname, '/keys/user2-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, '/keys/user2-key.pem'))
    }
  }

  function createOptions (path, user) {
    var options = {
      url: address + path
    }
    if (user) {
      options.agentOptions = userCredentials[user]
    }
    return options
  }

  describe('no ACL', function () {
    it('should return 403 for any resource', function (done) {
      var options = createOptions('/acl/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('should have `User` set in the Response Header', function (done) {
      var options = createOptions('/acl/no-acl/', 'user1')
      request(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
  })

  describe('empty .acl', function () {
    describe('with no defaultForNew in parent path', function () {
      it('should give no access', function (done) {
        var options = createOptions('/acl/empty-acl/test-folder', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
      it('should not let edit the .acl', function (done) {
        var options = createOptions('/acl/empty-acl/.acl', 'user1')
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
        var options = createOptions('/acl/empty-acl/.acl', 'user1')
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
        rm('/acl/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/acl/write-acl/empty-acl/test-folder/test-file')
        rm('/acl/write-acl/empty-acl/test-file')
        rm('/acl/write-acl/test-file')
        rm('/acl/write-acl/test-file.acl')
      })

      it('should fail to create a container', function (done) {
        var options = createOptions('/acl/write-acl/empty-acl/test-folder/', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 409)
          done()
        })
      })
      it('should allow creation of new files', function (done) {
        var options = createOptions('/acl/write-acl/empty-acl/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it('should allow creation of new files in deeper paths', function (done) {
        var options = createOptions('/acl/write-acl/empty-acl/test-folder/test-file', 'user1')
        options.body = ''
        request.put(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 201)
          done()
        })
      })
      it('Should create empty acl file', function (done) {
        var options = createOptions('/acl/write-acl/empty-acl/another-empty-folder/test-file.acl', 'user1')
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
        var options = createOptions('/acl/write-acl/.acl', 'user1')
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
        var options = createOptions('/acl/write-acl/test-file', 'user1')
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
        var options = createOptions('/acl/write-acl/test-file.acl', 'user1')
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
        var options = createOptions('/acl/write-acl/test-file.acl', 'user1')
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
        rm('/acl/write-acl/empty-acl/another-empty-folder/test-file.acl')
        rm('/acl/write-acl/empty-acl/test-folder/test-file')
        rm('/acl/write-acl/empty-acl/test-file')
        rm('/acl/write-acl/test-file')
        rm('/acl/write-acl/test-file.acl')
      })
    })
  })

  describe('Origin', function () {
    before(function () {
      rm('acl/origin/test-folder/.acl')
    })

    it('should PUT new ACL file', function (done) {
      var options = createOptions('/acl/origin/test-folder/.acl', 'user1')
      options.headers = {
        'content-type': 'text/turtle'
      }
      options.body = '<#Owner>\n' +
        ' <http://www.w3.org/ns/auth/acl#accessTo> <https://localhost:3456/test/acl/origin/test-folder/.acl>;\n' +
        ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#origin> <' + origin1 + '>;\n' +
        ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
        '<#Public>\n' +
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
      var options = createOptions('/acl/origin/test-folder/', 'user1')
      options.headers = {
        origin: origin1
      }
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/acl/origin/test-folder/', 'user1')
        options.headers = {
          origin: origin1
        }
        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('user1 should be denied access to test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl/origin/test-folder/', 'user1')
        options.headers = {
          origin: origin2
        }
        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 403)
          done()
        })
      })
    it('agent should be able to access test directory', function (done) {
      var options = createOptions('/acl/origin/test-folder/')
      options.headers = {
        origin: origin1
      }
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should be able to access to test directory when origin is valid',
      function (done) {
        var options = createOptions('/acl/origin/test-folder/', 'user1')
        options.headers = {
          origin: origin1
        }
        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 200)
          done()
        })
      })
    it('agent should be denied access to test directory when origin is invalid',
      function (done) {
        var options = createOptions('/acl/origin/test-folder/')
        options.headers = {
          origin: origin2
        }
        request.head(options, function (error, response, body) {
          assert.equal(error, null)
          assert.equal(response.statusCode, 401)
          done()
        })
      })

    after(function () {
      rm('acl/origin/test-folder/.acl')
    })
  })

  describe.skip('Owner-only', function () {
    var body = '<#Owner>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#owner> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n'
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/acl/owner-only/test-folder/', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should be able to access test directory', function (done) {
      var options = createOptions(testDir, 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('should create new ACL file', function (done) {
      var options = createOptions(testDirAclFile, 'user1')
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
    it('user1 should be able to access ACL file', function (done) {
      var options = createOptions(testDirAclFile, 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions(testDir, 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify ACL file', function (done) {
      var options = createOptions(testDirAclFile, 'user1')
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
    it('user2 should not be able to access test direcotory', function (done) {
      var options = createOptions(testDir, 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to access ACL file', function (done) {
      var options = createOptions(testDirAclFile, 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to modify ACL file', function (done) {
      var options = createOptions(testDirAclFile, 'user2')
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
    it('agent request should require authorization', function (done) {
      var options = createOptions(testDirAclFile)
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

  describe('Read-only', function () {
    var body = fs.readFileSync(path.join(__dirname, '/resources/acl/read-acl/.acl'))
    it('user1 should be able to access ACL file', function (done) {
      var options = createOptions('/acl/read-acl/.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test directory', function (done) {
      var options = createOptions('/acl/read-acl/', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify ACL file', function (done) {
      var options = createOptions('/acl/read-acl/.acl', 'user1')
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
      var options = createOptions('/acl/read-acl/', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to access ACL file', function (done) {
      var options = createOptions('/acl/read-acl/.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to modify ACL file', function (done) {
      var options = createOptions('/acl/read-acl/.acl', 'user2')
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
      var options = createOptions('/acl/read-acl/')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should not be able to modify ACL file', function (done) {
      var options = createOptions('/acl/read-acl/.acl')
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
    // var body = fs.readFileSync(__dirname + '/resources/acl/append-acl/abc.ttl.acl')
    it("user1 should be able to access test file's ACL file", function (done) {
      var options = createOptions('/acl/append-acl/abc.ttl.acl', 'user1')
      request.head(options, function (error, response) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test file', function (done) {
      var options = createOptions('/acl/append-acl/abc.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    // TODO POST instead of PUT
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions('/acl/append-acl/abc.ttl', 'user1')
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
      var options = createOptions('/acl/append-acl/abc.ttl.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should not be able to access test file', function (done) {
      var options = createOptions('/acl/append-acl/abc.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 (with append permission) cannot use PUT to append', function (done) {
      var options = createOptions('/acl/append-acl/abc.ttl', 'user2')
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
      var options = createOptions('/acl/append-acl/abc.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent (with append permissions) should not PUT', function (done) {
      var options = createOptions('/acl/append-acl/abc.ttl')
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
  })

  describe('Restricted', function () {
    var body = '<#Owner>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./abc2.ttl>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Restricted>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./abc2.ttl>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user2 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>.\n'
    it("user1 should be able to modify test file's ACL file", function (done) {
      var options = createOptions('/acl/append-acl/abc2.ttl.acl', 'user1')
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
      var options = createOptions('/acl/append-acl/abc2.ttl.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to access test file', function (done) {
      var options = createOptions('/acl/append-acl/abc2.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to modify test file', function (done) {
      var options = createOptions('/acl/append-acl/abc2.ttl', 'user1')
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
      var options = createOptions('/acl/append-acl/abc2.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test file's ACL file", function (done) {
      var options = createOptions('/acl/append-acl/abc2.ttl.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to modify test file', function (done) {
      var options = createOptions('/acl/append-acl/abc2.ttl', 'user2')
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
      var options = createOptions('/acl/append-acl/abc2.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 401)
        done()
      })
    })
    it('agent should not be able to modify test file', function (done) {
      var options = createOptions('/acl/append-acl/abc2.ttl')
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
      rm('/acl/write-acl/default-for-new/.acl')
      rm('/acl/write-acl/default-for-new/test-file.ttl')
    })

    var body = '<#Owner>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agent> <' + user1 + '>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>, <http://www.w3.org/ns/auth/acl#Control> .\n' +
      '<#Default>\n' +
      ' <http://www.w3.org/ns/auth/acl#accessTo> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#defaultForNew> <./>;\n' +
      ' <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n' +
      ' <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n'
    it("user1 should be able to modify test direcotory's ACL file", function (done) {
      var options = createOptions('/acl/write-acl/default-for-new/.acl', 'user1')
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
      var options = createOptions('/acl/write-acl/default-for-new/.acl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user1 should be able to create new test file', function (done) {
      var options = createOptions('/acl/write-acl/default-for-new/test-file.ttl', 'user1')
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
      var options = createOptions('/acl/write-acl/default-for-new/test-file.ttl', 'user1')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it("user2 should not be able to access test direcotory's ACL file", function (done) {
      var options = createOptions('/acl/write-acl/default-for-new/.acl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 403)
        done()
      })
    })
    it('user2 should be able to access new test file', function (done) {
      var options = createOptions('/acl/write-acl/default-for-new/test-file.ttl', 'user2')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('user2 should not be able to modify new test file', function (done) {
      var options = createOptions('/acl/write-acl/default-for-new/test-file.ttl', 'user2')
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
      var options = createOptions('/acl/write-acl/default-for-new/test-file.ttl')
      request.head(options, function (error, response, body) {
        assert.equal(error, null)
        assert.equal(response.statusCode, 200)
        done()
      })
    })
    it('agent should not be able to modify new test file', function (done) {
      var options = createOptions('/acl/write-acl/default-for-new/test-file.ttl')
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
      rm('/acl/write-acl/default-for-new/.acl')
      rm('/acl/write-acl/default-for-new/test-file.ttl')
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

  describe.skip('Cleaup', function () {
    it('should remove all files and dirs created', function (done) {
      try {
        // must remove the ACLs in sync
        fs.unlinkSync(path.join(__dirname, '/resources/' + testDir + '/dir1/dir2/abcd.ttl'))
        fs.rmdirSync(path.join(__dirname, '/resources/' + testDir + '/dir1/dir2/'))
        fs.rmdirSync(path.join(__dirname, '/resources/' + testDir + '/dir1/'))
        fs.unlinkSync(path.join(__dirname, '/resources/' + abcFile))
        fs.unlinkSync(path.join(__dirname, '/resources/' + testDirAclFile))
        fs.unlinkSync(path.join(__dirname, '/resources/' + testDirMetaFile))
        fs.rmdirSync(path.join(__dirname, '/resources/' + testDir))
        fs.rmdirSync(path.join(__dirname, '/resources/acl/'))
        done()
      } catch (e) {
        done(e)
      }
    })
  })
})
