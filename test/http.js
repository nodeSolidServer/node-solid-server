var supertest = require('supertest')
var fs = require('fs')
var li = require('li')
var ldnode = require('../index')
var rm = require('./test-utils').rm

describe('HTTP APIs', function () {
  var emptyResponse = function (res) {
    if (res.text.length !== 0) {
      console.log('Not empty response')
    }
  }
  var getLink = function (res, rel) {
    var links = res.headers.link.split(',')
    for (var i in links) {
      var link = links[i]
      var parsedLink = li.parse(link)
      if (parsedLink[rel]) {
        return parsedLink[rel]
      }
    }
    return undefined
  }
  var hasHeader = function (rel, value) {
    var handler = function (res) {
      var link = getLink(res, rel)
      if (link) {
        if (link !== value) {
          console.log('Not same value:', value, '!=', link)
        }
      } else {
        console.log(rel, 'header does not exist:', link)
      }
    }
    return handler
  }

  var ldpServer = ldnode({
    root: __dirname + '/resources'
  })

  var suffixAcl = '.acl'
  var suffixMeta = '.meta'

  var server = supertest(ldpServer)

  describe('GET Root container', function () {
    it('should have Access-Control-Allow-Origin as the req.Origin', function (done) {
      server.get('/')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })

    it('should exist', function (done) {
      server.get('/')
        .expect(200, done)
    })
    it('should be a turtle file by default', function (done) {
      server.get('/')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
  })

  describe('OPTIONS API', function () {
    it('should have an empty response', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect(emptyResponse)
        .end(done)
    })

    it('should return 204 on success', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect(204)
        .end(done)
    })

    it('should have Access-Control-Allow-Origin', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .end(done)
    })

    it('should have set acl and describedBy Links for resource', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect(hasHeader('acl', 'example1.ttl' + suffixAcl))
        .expect(hasHeader('describedBy', 'example1.ttl' + suffixMeta))
        .end(done)
    })

    it('should have set Link as resource', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .end(done)
    })

    it('should have set Link as Container/BasicContainer', function (done) {
      server.options('/sampleContainer/')
        .set('Origin', 'http://example.com')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .end(done)
    })

    it('should have set acl and describedBy Links for container', function (done) {
      server.options('/sampleContainer/')
        .expect(hasHeader('acl', suffixAcl))
        .expect(hasHeader('describedBy', suffixMeta))
        .end(done)
    })
  })

  describe('GET API', function () {
    it('should have Access-Control-Allow-Origin as Origin on containers', function (done) {
      server.get('/sampleContainer')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })

    it('should have Access-Control-Allow-Origin as Origin on resources', function (done) {
      server.get('/sampleContainer/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })

    it('should have set Link as resource', function (done) {
      server.get('/sampleContainer/example1.ttl')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for resource', function (done) {
      server.get('/sampleContainer/example1.ttl')
        .expect('content-type', /text\/turtle/)
        .expect(hasHeader('acl', 'example1.ttl' + suffixAcl))
        .expect(hasHeader('describedBy', 'example1.ttl' + suffixMeta))
        .end(done)
    })

    it('should have set Link as Container/BasicContainer', function (done) {
      server.get('/sampleContainer/')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .expect(200, done)
    })
    it('should return 404 for non-existent resource', function (done) {
      server.get('/invalidfile.foo')
        .expect(404, done)
    })
    it('should return basic container link for directories', function (done) {
      server.get('/')
        .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#BasicContainer/)
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    it('should return resource link for files', function (done) {
      server.get('/hello.html')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect('Content-Type', 'text/html')
        .expect(200, done)
    })
    it('should have glob support', function (done) {
      server.get('/sampleContainer/example*')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })

    it('should have set acl and describedBy Links for container', function (done) {
      server.get('/sampleContainer/')
        .expect(hasHeader('acl', suffixAcl))
        .expect(hasHeader('describedBy', suffixMeta))
        .end(done)
    })
  })

  describe('HEAD API', function () {
    it('should have Access-Control-Allow-Origin as Origin', function (done) {
      server.head('/sampleContainer/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })

    it('should return empty response body', function (done) {
      server.head('/patch-5-initial.ttl')
        .expect(emptyResponse)
        .expect(200, done)
    })

    it('should have set Link as Resource', function (done) {
      server.head('/sampleContainer/example1.ttl')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for resource', function (done) {
      server.get('/sampleContainer/example1.ttl')
        .expect(hasHeader('acl', 'example1.ttl' + suffixAcl))
        .expect(hasHeader('describedBy', 'example1.ttl' + suffixMeta))
        .end(done)
    })

    it('should have set Link as Container/BasicContainer', function (done) {
      server.get('/sampleContainer/')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .expect(200, done)
    })

    it('should have set acl and describedBy Links for container', function (done) {
      server.get('/sampleContainer/')
        .expect(hasHeader('acl', suffixAcl))
        .expect(hasHeader('describedBy', suffixMeta))
        .end(done)
    })
  })

  describe('PUT API', function () {
    var putRequestBody = fs.readFileSync(__dirname + '/resources/sampleContainer/put1.ttl', {
      'encoding': 'utf8'
    })
    it('should create new resource', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(201, done)
    })
    it('should create directories if they do not exist', function (done) {
      server.put('/foo/bar/baz.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(hasHeader('describedBy', 'baz.ttl' + suffixMeta))
        .expect(hasHeader('acl', 'baz.ttl' + suffixAcl))
        .expect(function () {
          fs.unlinkSync(__dirname + '/resources/foo/bar/baz.ttl')
          fs.rmdirSync(__dirname + '/resources/foo/bar/')
          fs.rmdirSync(__dirname + '/resources/foo/')
        })
        .expect(201, done)
    })
    it('should return 409 code when trying to put to a container', function (done) {
      server.put('/')
        .expect(409, done)
    })
  })

  describe('DELETE API', function () {
    it('should return 404 status when deleting a file that does not exists',
      function (done) {
        server.delete('/false-file-48484848')
          .expect(404, done)
      })
    it('should delete previously PUT file', function (done) {
      server.delete('/put-resource-1.ttl')
        .expect(200, done)
    })
  })

  describe('POST API', function () {
    var postRequest1Body = fs.readFileSync(__dirname + '/resources/sampleContainer/put1.ttl', {
      'encoding': 'utf8'
    })
    var postRequest2Body = fs.readFileSync(__dirname + '/resources/sampleContainer/post2.ttl', {
      'encoding': 'utf8'
    })
    it('should create new resource', function (done) {
      server.post('/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'post-resource-1.ttl')
        .expect('location', /\/post-resource-1/)
        .expect(hasHeader('describedBy', suffixMeta))
        .expect(hasHeader('acl', suffixAcl))
        .expect(201, done)
    })
    it('should create new resource even if no trailing / is in the target', function (done) {
      rm('target.ttl')
      server.post('')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'target.ttl')
        .expect('location', /\/target\.ttl/)
        .expect(hasHeader('describedBy', suffixMeta))
        .expect(hasHeader('acl', suffixAcl))
        .expect(201, function (err) {
          rm('target.ttl')
          return done(err)
        })
    })
    it('should fail return 404 if no parent container found', function (done) {
      rm('target.ttl')
      server.post('/hello.html/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'no- target.ttl')
        .expect(404, function (err) {
          rm('target.ttl')
          return done(err)
        })
    })
    it('should create a new slug if there is a resource with the same name', function (done) {
      server.post('/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'post-resource-1.ttl')
        .expect(201, done)
    })
    it('should be able to delete newly created resource', function (done) {
      server.delete('/post-resource-1.ttl')
        .expect(200, done)
    })
    var postResourceName
    var setResourceName = function (res) {
      postResourceName = res.header.location
    }
    it('should create new resource without slug header', function (done) {
      server.post('/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .expect(201)
        .expect(setResourceName)
        .end(done)
    })
    it('should be able to delete newly created resource', function (done) {
      server.delete('/' + postResourceName.replace(/https?\:\/\/127.0.0.1:[0-9]*\//, ''))
        .expect(200, done)
    })
    it('should create container', function (done) {
      server.post('/')
        .set('content-type', 'text/turtle')
        .set('slug', 'loans')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .send(postRequest2Body)
        .expect(201, done)
    })
    it('should be able to access container', function (done) {
      server.get('/loans')
        .expect('content-type', /text\/turtle/)
        .expect(function () {
          fs.unlinkSync(__dirname + '/resources/loans/.meta')
          fs.rmdirSync(__dirname + '/resources/loans/')
        })
        .expect(200, done)
    })
  })
})
