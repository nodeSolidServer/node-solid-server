const fs = require('fs')
const li = require('li')
const rm = require('./../utils').rm
const path = require('path')
const rdf = require('rdflib')
const { setupSupertestServer } = require('../utils')

const suffixAcl = '.acl'
const suffixMeta = '.meta'
const server = setupSupertestServer({
  live: true,
  dataBrowserPath: 'default',
  root: path.join(__dirname, '../resources'),
  auth: 'oidc',
  webid: false
})
const { assert, expect } = require('chai')

/**
 * Creates a new turtle test resource via an LDP PUT
 *   (located in `test/resources/{resourceName}`)
 * @method createTestResource
 * @param resourceName {String} Resource name (should have a leading `/`)
 * @return {Promise} Promise obj, for use with Mocha's `before()` etc
 */
function createTestResource (resourceName) {
  return new Promise(function (resolve, reject) {
    server.put(resourceName)
      .set('content-type', 'text/turtle')
      .end(function (error, res) {
        error ? reject(error) : resolve(res)
      })
  })
}

describe('HTTP APIs', function () {
  const emptyResponse = function (res) {
    if (res.text) {
      throw new Error('Not empty response')
    }
  }
  const getLink = function (res, rel) {
    if (res.headers.link) {
      const links = res.headers.link.split(',')
      for (const i in links) {
        const link = links[i]
        const parsedLink = li.parse(link)
        if (parsedLink[rel]) {
          return parsedLink[rel]
        }
      }
    }
    return undefined
  }
  const hasHeader = function (rel, value) {
    const handler = function (res) {
      const link = getLink(res, rel)
      if (link) {
        if (link !== value) {
          throw new Error('Not same value: ' + value + ' != ' + link)
        }
      } else {
        throw new Error('header does not exist: ' + rel + ' = ' + value)
      }
    }
    return handler
  }

  describe('GET Root container', function () {
    it('should exist', function (done) {
      server.get('/')
        .expect(200, done)
    })
    it('should be a turtle file by default', function (done) {
      server.get('/')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    it('should contain space:Storage triple', function (done) {
      server.get('/')
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
        .expect((res) => {
          const turtle = res.text
          assert.match(turtle, /space:Storage/)
          const kb = rdf.graph()
          rdf.parse(turtle, kb, 'https://localhost/', 'text/turtle')

          assert(kb.match(undefined,
            rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            rdf.namedNode('http://www.w3.org/ns/pim/space#Storage')
          ).length, 'Must contain a triple space:Storage')
        })
    })
    it('should have set Link as Container/BasicContainer/Storage', function (done) {
      server.get('/')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/pim\/space#Storage>; rel="type"/)
        .expect(200, done)
    })
  })

  describe('OPTIONS API', function () {
    it('should set the proper CORS headers',
      function (done) {
        server.options('/')
          .set('Origin', 'http://example.com')
          .expect('Access-Control-Allow-Origin', 'http://example.com')
          .expect('Access-Control-Allow-Credentials', 'true')
          .expect('Access-Control-Allow-Methods', 'OPTIONS,HEAD,GET,PATCH,POST,PUT,DELETE')
          .expect('Access-Control-Expose-Headers', 'Authorization, User, Location, Link, Vary, Last-Modified, ETag, Accept-Patch, Accept-Post, Accept-Put, Updates-Via, Allow, WAC-Allow, Content-Length, WWW-Authenticate, MS-Author-Via, X-Powered-By')
          .expect(204, done)
      })

    describe('Accept-* headers', function () {
      it('should be present for resources', function (done) {
        server.options('/sampleContainer/example1.ttl')
          .expect('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
          .expect('Accept-Post', '*/*')
          .expect('Accept-Put', '*/*')
          .expect(204, done)
      })

      it('should be present for containers', function (done) {
        server.options('/sampleContainer/')
          .expect('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
          .expect('Accept-Post', '*/*')
          .expect('Accept-Put', '*/*')
          .expect(204, done)
      })

      it('should be present for non-rdf resources', function (done) {
        server.options('/sampleContainer/solid.png')
          .expect('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
          .expect('Accept-Post', '*/*')
          .expect('Accept-Put', '*/*')
          .expect(204, done)
      })
    })

    it('should have an empty response', function (done) {
      server.options('/sampleContainer/example1.ttl')
        .expect(emptyResponse)
        .end(done)
    })

    it('should return 204 on success', function (done) {
      server.options('/sampleContainer2/example1.ttl')
        .expect(204)
        .end(done)
    })

    it('should have Access-Control-Allow-Origin', function (done) {
      server.options('/sampleContainer2/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .end(done)
    })

    it('should have set acl and describedBy Links for resource',
      function (done) {
        server.options('/sampleContainer2/example1.ttl')
          .expect(hasHeader('acl', 'example1.ttl' + suffixAcl))
          .expect(hasHeader('describedBy', 'example1.ttl' + suffixMeta))
          .end(done)
      })

    it('should have set Link as resource', function (done) {
      server.options('/sampleContainer2/example1.ttl')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .end(done)
    })

    it('should have set Link as Container/BasicContainer on an implicit index page', function (done) {
      server.options('/sampleContainer/')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .end(done)
    })

    it('should have set Link as Container/BasicContainer', function (done) {
      server.options('/sampleContainer2/')
        .set('Origin', 'http://example.com')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .end(done)
    })

    it('should have set Accept-Post for containers', function (done) {
      server.options('/sampleContainer2/')
        .set('Origin', 'http://example.com')
        .expect('Accept-Post', '*/*')
        .end(done)
    })

    it('should have set acl and describedBy Links for container', function (done) {
      server.options('/sampleContainer2/')
        .expect(hasHeader('acl', suffixAcl))
        .expect(hasHeader('describedBy', suffixMeta))
        .end(done)
    })
  })

  describe('Not allowed method should return 405 and allow header', function (done) {
    it('TRACE should return 405', function (done) {
      server.trace('/sampleContainer2/')
        // .expect(hasHeader('allow', 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE'))
        .expect(405)
        .end((err, res) => {
          if (err) done(err)
          const allow = res.headers.allow
          console.log(allow)
          if (allow === 'OPTIONS, HEAD, GET, PATCH, POST, PUT, DELETE') done()
          else done(new Error('no allow header'))
        })
    })
  })

  describe('GET API', function () {
    it('should have the same size of the file on disk', function (done) {
      server.get('/sampleContainer/solid.png')
        .expect(200)
        .end(function (err, res) {
          if (err) {
            return done(err)
          }

          const size = fs.statSync(path.join(__dirname,
            '../resources/sampleContainer/solid.png')).size
          if (res.body.length !== size) {
            return done(new Error('files are not of the same size'))
          }
          done()
        })
    })

    it('should have Access-Control-Allow-Origin as Origin on containers', function (done) {
      server.get('/sampleContainer2/')
        .set('Origin', 'http://example.com')
        .expect('content-type', /text\/turtle/)
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })
    it('should have Access-Control-Allow-Origin as Origin on resources',
      function (done) {
        server.get('/sampleContainer2/example1.ttl')
          .set('Origin', 'http://example.com')
          .expect('content-type', /text\/turtle/)
          .expect('Access-Control-Allow-Origin', 'http://example.com')
          .expect(200, done)
      })
    it('should have set Link as resource', function (done) {
      server.get('/sampleContainer2/example1.ttl')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect(200, done)
    })
    it('should have set Updates-Via to use WebSockets', function (done) {
      server.get('/sampleContainer2/example1.ttl')
        .expect('updates-via', /wss?:\/\//)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for resource',
      function (done) {
        server.get('/sampleContainer2/example1.ttl')
          .expect('content-type', /text\/turtle/)
          .expect(hasHeader('acl', 'example1.ttl' + suffixAcl))
          .expect(hasHeader('describedBy', 'example1.ttl' + suffixMeta))
          .end(done)
      })
    it('should have set Link as Container/BasicContainer', function (done) {
      server.get('/sampleContainer2/')
        .expect('content-type', /text\/turtle/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
        .expect(200, done)
    })
    it('should load skin (mashlib) if resource was requested as text/html', function (done) {
      server.get('/sampleContainer2/example1.ttl')
        .set('Accept', 'text/html')
        .expect('content-type', /text\/html/)
        .expect(function (res) {
          if (res.text.indexOf('TabulatorOutline') < 0) {
            throw new Error('did not load the Tabulator skin by default')
          }
        })
        .expect(200, done) // Can't check for 303 because of internal redirects
    })
    it('should NOT load data browser (mashlib) if resource is not RDF', function (done) {
      server.get('/sampleContainer/solid.png')
        .set('Accept', 'text/html')
        .expect('content-type', /image\/png/)
        .expect(200, done)
    })

    it('should NOT load data browser (mashlib) if a resource has an .html extension', function (done) {
      server.get('/sampleContainer/index.html')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        .expect('content-type', /text\/html/)
        .expect(200)
        .expect((res) => {
          if (res.text.includes('TabulatorOutline')) {
            throw new Error('Loaded data browser though resource has an .html extension')
          }
        })
        .end(done)
    })

    it('should NOT load data browser (mashlib) if directory has an index file', function (done) {
      server.get('/sampleContainer/')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        .expect('content-type', /text\/html/)
        .expect(200)
        .expect((res) => {
          if (res.text.includes('TabulatorOutline')) {
            throw new Error('Loaded data browser though resource has an .html extension')
          }
        })
        .end(done)
    })

    it('should show data browser if container was requested as text/html', function (done) {
      server.get('/sampleContainer2/')
        .set('Accept', 'text/html')
        .expect('content-type', /text\/html/)
        .expect(200, done)
    })
    it('should redirect to the right container URI if missing /', function (done) {
      server.get('/sampleContainer')
        .expect(301, done)
    })
    it('should return 404 for non-existent resource', function (done) {
      server.get('/invalidfile.foo')
        .expect(404, done)
    })
    it('should return 404 for non-existent container', function (done) {
      server.get('/inexistant/')
        .expect('Accept-Put', 'text/turtle')
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
        .expect('Content-Type', /text\/html/)
        .expect(200, done)
    })
    it('should have glob support', function (done) {
      server.get('/sampleContainer/*')
        .expect('content-type', /text\/turtle/)
        .expect(200)
        .expect((res) => {
          const kb = rdf.graph()
          rdf.parse(res.text, kb, 'https://localhost/', 'text/turtle')

          assert(kb.match(
            rdf.namedNode('https://localhost/example1.ttl#this'),
            rdf.namedNode('http://purl.org/dc/elements/1.1/title'),
            rdf.literal('Test title')
          ).length, 'Must contain a triple from example1.ttl')

          assert(kb.match(
            rdf.namedNode('http://example.org/stuff/1.0/a'),
            rdf.namedNode('http://example.org/stuff/1.0/b'),
            rdf.literal('apple')
          ).length, 'Must contain a triple from example2.ttl')

          assert(kb.match(
            rdf.namedNode('http://example.org/stuff/1.0/a'),
            rdf.namedNode('http://example.org/stuff/1.0/b'),
            rdf.literal('The first line\nThe second line\n  more')
          ).length, 'Must contain a triple from example3.ttl')
        })
        .end(done)
    })
    it('should have set acl and describedBy Links for container',
      function (done) {
        server.get('/sampleContainer2/')
          .expect(hasHeader('acl', suffixAcl))
          .expect(hasHeader('describedBy', suffixMeta))
          .expect('content-type', /text\/turtle/)
          .end(done)
      })
    it('should return requested index.html resource by default', function (done) {
      server.get('/sampleContainer/index.html')
        .set('accept', 'text/html')
        .expect(200)
        .expect('content-type', /text\/html/)
        .expect(function (res) {
          if (res.text.indexOf('<!DOCTYPE html>') < 0) {
            throw new Error('wrong content returned for index.html')
          }
        })
        .end(done)
    })
    it('should fallback on index.html if it exists and content-type is given',
      function (done) {
        server.get('/sampleContainer/')
          .set('accept', 'text/html')
          .expect(200)
          .expect('content-type', /text\/html/)
          .end(done)
      })
    it('should return turtle if requesting a conatiner that has index.html with conteent-type text/turtle', (done) => {
      server.get('/sampleContainer/')
        .set('accept', 'text/turtle')
        .expect(200)
        .expect('content-type', /text\/turtle/)
        .end(done)
    })
    it('should return turtle if requesting a container that conatins an index.html file with a content type where some rdf format is ranked higher than html', (done) => {
      server.get('/sampleContainer/')
        .set('accept', 'image/*;q=0.9, */*;q=0.1, application/rdf+xml;q=0.9, application/xhtml+xml, text/xml;q=0.5, application/xml;q=0.5, text/html;q=0.9, text/plain;q=0.5, text/n3;q=1.0, text/turtle;q=1')
        .expect(200)
        .expect('content-type', /text\/turtle/)
        .end(done)
    })
    it('should still redirect to the right container URI if missing / and HTML is requested', function (done) {
      server.get('/sampleContainer')
        .set('accept', 'text/html')
        .expect('location', /\/sampleContainer\//)
        .expect(301, done)
    })

    describe('Accept-* headers', function () {
      it('should return 404 for non-existent resource', function (done) {
        server.get('/invalidfile.foo')
          .expect('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
          .expect('Accept-Post', '*/*')
          .expect('Accept-put', '*/*')
          .expect(404, done)
      })
      it('Accept-Put=text/turtle for non-existent container', function (done) {
        server.get('/inexistant/')
          .expect('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
          .expect('Accept-Post', '*/*')
          .expect('Accept-Put', 'text/turtle')
          .expect(404, done)
      })
      it('Accept-Put header do not exist for existing container', (done) => {
        server.get('/sampleContainer/')
          .expect(200)
          .expect('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
          .expect('Accept-Post', '*/*')
          .expect((res) => {
            if (res.headers['Accept-Put']) return done(new Error('Accept-Put header should not exist'))
          })
          .end(done)
      })
    })
  })

  describe('HEAD API', function () {
    it('should return content-type application/octet-stream by default', function (done) {
      server.head('/sampleContainer/blank')
        .expect('Content-Type', /application\/octet-stream/)
        .end(done)
    })
    it('should return content-type text/turtle for container', function (done) {
      server.head('/sampleContainer2/')
        .expect('Content-Type', /text\/turtle/)
        .end(done)
    })
    it('should have set content-type for turtle files',
      function (done) {
        server.head('/sampleContainer2/example1.ttl')
          .expect('Content-Type', /text\/turtle/)
          .end(done)
      })
    it('should have set content-type for implicit turtle files',
      function (done) {
        server.head('/sampleContainer/example4')
          .expect('Content-Type', /text\/turtle/)
          .end(done)
      })
    it('should have set content-type for image files',
      function (done) {
        server.head('/sampleContainer/solid.png')
          .expect('Content-Type', /image\/png/)
          .end(done)
      })
    it('should have Access-Control-Allow-Origin as Origin', function (done) {
      server.head('/sampleContainer2/example1.ttl')
        .set('Origin', 'http://example.com')
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect(200, done)
    })
    it('should return empty response body', function (done) {
      server.head('/patch-5-initial.ttl')
        .expect(emptyResponse)
        .expect(200, done)
    })
    it('should have set Updates-Via to use WebSockets', function (done) {
      server.head('/sampleContainer2/example1.ttl')
        .expect('updates-via', /wss?:\/\//)
        .expect(200, done)
    })
    it('should have set Link as Resource', function (done) {
      server.head('/sampleContainer2/example1.ttl')
        .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Resource>; rel="type"/)
        .expect(200, done)
    })
    it('should have set acl and describedBy Links for resource',
      function (done) {
        server.head('/sampleContainer2/example1.ttl')
          .expect(hasHeader('acl', 'example1.ttl' + suffixAcl))
          .expect(hasHeader('describedBy', 'example1.ttl' + suffixMeta))
          .end(done)
      })
    it('should have set Content-Type as text/turtle for Container',
      function (done) {
        server.head('/sampleContainer2/')
          .expect('Content-Type', /text\/turtle/)
          .expect(200, done)
      })
    it('should have set Link as Container/BasicContainer',
      function (done) {
        server.head('/sampleContainer2/')
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#BasicContainer>; rel="type"/)
          .expect('Link', /<http:\/\/www.w3.org\/ns\/ldp#Container>; rel="type"/)
          .expect(200, done)
      })
    it('should have set acl and describedBy Links for container',
      function (done) {
        server.head('/sampleContainer2/')
          .expect(hasHeader('acl', suffixAcl))
          .expect(hasHeader('describedBy', suffixMeta))
          .end(done)
      })
  })

  describe('PUT API', function () {
    const putRequestBody = fs.readFileSync(path.join(__dirname,
      '../resources/sampleContainer/put1.ttl'), {
      encoding: 'utf8'
    })
    it('should create new resource with if-none-match on non existing resource', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('if-none-match', '*')
        .set('content-type', 'text/plain')
        .expect(201, done)
    })
    it('should fail with 412 with precondition on existing resource', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('if-none-match', '*')
        .set('content-type', 'text/plain')
        .expect(412, done)
    })
    it('should fail with 400 if not content-type', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('content-type', '')
        .expect(400, done)
    })
    it('should create new resource and delete old path if different', function (done) {
      server.put('/put-resource-1.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(204)
        .end(function (err) {
          if (err) return done(err)
          if (fs.existsSync(path.join(__dirname, '../resources/put-resource-1.ttl$.txt'))) {
            return done(new Error('Can read old file that should have been deleted'))
          }
          done()
        })
    })
    it('should reject create .acl resource, if contentType not text/turtle', function (done) {
      server.put('/put-resource-1.acl')
        .send(putRequestBody)
        .set('content-type', 'text/plain')
        .expect(415, done)
    })
    it('should reject create .acl resource, if body is not valid turtle', function (done) {
      server.put('/put-resource-1.acl')
        .send('bad turtle content')
        .set('content-type', 'text/turtle')
        .expect(400, done)
    })
    it('should reject create .meta resource, if contentType not text/turtle', function (done) {
      server.put('/.meta')
        .send(putRequestBody)
        .set('content-type', 'text/plain')
        .expect(415, done)
    })
    it('should reject create .meta resource, if body is not valid turtle', function (done) {
      server.put('/.meta')
        .send(JSON.stringify({}))
        .set('content-type', 'text/turtle')
        .expect(400, done)
    })
    it('should create directories if they do not exist', function (done) {
      server.put('/foo/bar/baz.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(hasHeader('describedBy', 'baz.ttl' + suffixMeta))
        .expect(hasHeader('acl', 'baz.ttl' + suffixAcl))
        .expect(201, done)
    })
    it('should not create a resource with percent-encoded $.ext', function (done) {
      server.put('/foo/bar/baz%24.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        // .expect(hasHeader('describedBy', 'baz.ttl' + suffixMeta))
        // .expect(hasHeader('acl', 'baz.ttl' + suffixAcl))
        .expect(400, done) // 404
    })
    it('should create a resource without extension', function (done) {
      server.put('/foo/bar/baz')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(hasHeader('describedBy', 'baz' + suffixMeta))
        .expect(hasHeader('acl', 'baz' + suffixAcl))
        .expect(201, done)
    })
    it('should not create a container if a document with same name exists in tree', function (done) {
      server.put('/foo/bar/baz/')
        .send(putRequestBody)
        // .set('content-type', 'text/turtle')
        // .expect(hasHeader('describedBy', suffixMeta))
        // .expect(hasHeader('acl', suffixAcl))
        .expect(409, done)
    })
    it('should not create new resource if a folder/resource with same name will exist in tree', function (done) {
      server.put('/foo/bar/baz/baz1/test.ttl')
        .send(putRequestBody)
        .set('content-type', 'text/turtle')
        .expect(hasHeader('describedBy', 'test.ttl' + suffixMeta))
        .expect(hasHeader('acl', 'test.ttl' + suffixAcl))
        .expect(409, done)
    })
    it('should return 201 when trying to put to a container without content-type',
      function (done) {
        server.put('/foo/bar/test/')
          // .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(201, done)
      }
    )
    it('should return 204 code when trying to put to a container',
      function (done) {
        server.put('/foo/bar/test/')
          .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(204, done)
      }
    )
    it('should return 204 when trying to put to a container without content-type',
      function (done) {
        server.put('/foo/bar/test/')
          // .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(204, done)
      }
    )
    it('should return 204 code when trying to put to a container',
      function (done) {
        server.put('/foo/bar/test/')
          .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(204, done)
      }
    )
    it('should return a 400 error when trying to PUT a container with a name that contains a reserved suffix',
      function (done) {
        server.put('/foo/bar.acl/test/')
          .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(400, done)
      }
    )
    it('should return a 400 error when trying to PUT a resource with a name that contains a reserved suffix',
      function (done) {
        server.put('/foo/bar.acl/test.ttl')
          .send(putRequestBody)
          .set('content-type', 'text/turtle')
          .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
          .expect(400, done)
      }
    )
    // Cleanup
    after(function () {
      rm('/foo/')
    })
  })

  describe('DELETE API', function () {
    before(function () {
      // Ensure all these are finished before running tests
      return Promise.all([
        rm('/false-file-48484848'),
        createTestResource('/.acl'),
        createTestResource('/profile/card'),
        createTestResource('/delete-test-empty-container/.meta.acl'),
        createTestResource('/put-resource-1.ttl'),
        createTestResource('/put-resource-with-acl.ttl'),
        createTestResource('/put-resource-with-acl.ttl.acl'),
        createTestResource('/put-resource-with-acl.txt'),
        createTestResource('/put-resource-with-acl.txt.acl'),
        createTestResource('/delete-test-non-empty/test.ttl')
      ])
    })

    it('should return 405 status when deleting root folder', function (done) {
      server.delete('/')
        .expect(405)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert.equal(res.get('allow').includes('DELETE'), false)
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    it('should return 405 status when deleting root acl', function (done) {
      server.delete('/' + suffixAcl)
        .expect(405)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert.equal(res.get('allow').includes('DELETE'), false) // ,'res methods')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    it('should return 405 status when deleting /profile/card', function (done) {
      server.delete('/profile/card')
        .expect(405)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert.equal(res.get('allow').includes('DELETE'), false) // ,'res methods')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    it('should return 404 status when deleting a file that does not exists',
      function (done) {
        server.delete('/false-file-48484848')
          .expect(404, done)
      })

    it('should delete previously PUT file', function (done) {
      server.delete('/put-resource-1.ttl')
        .expect(200, done)
    })

    it('should delete previously PUT file with ACL', function (done) {
      server.delete('/put-resource-with-acl.ttl')
        .expect(200, done)
    })

    it('should return 404 on deleting .acl of previously deleted PUT file with ACL', function (done) {
      server.delete('/put-resource-with-acl.ttl.acl')
        .expect(404, done)
    })

    it('should delete previously PUT file with bad extension and with ACL', function (done) {
      server.delete('/put-resource-with-acl.txt')
        .expect(200, done)
    })

    it('should return 404 on deleting .acl of previously deleted PUT file with bad extension and with ACL', function (done) {
      server.delete('/put-resource-with-acl.txt.acl')
        .expect(404, done)
    })

    it('should fail to delete non-empty containers', function (done) {
      server.delete('/delete-test-non-empty/')
        .expect(409, done)
    })

    it('should delete a new and empty container - with .meta.acl', function (done) {
      server.delete('/delete-test-empty-container/')
        .end(() => {
          server.get('/delete-test-empty-container/')
            .expect(404)
            .end(done)
        })
    })

    after(function () {
      // Clean up after DELETE API tests
      rm('/profile/')
      rm('/put-resource-1.ttl')
      rm('/delete-test-non-empty/')
      rm('/delete-test-empty-container/test.txt.acl')
      rm('/delete-test-empty-container/')
    })
  })

  describe('POST API', function () {
    let postLocation
    before(function () {
      // Ensure all these are finished before running tests
      return Promise.all([
        createTestResource('/post-tests/put-resource'),
        // createTestContainer('post-tests'),
        rm('post-test-target.ttl') // ,
        // createTestResource('/post-tests/put-resource')
      ])
    })

    const postRequest1Body = fs.readFileSync(path.join(__dirname,
      '../resources/sampleContainer/put1.ttl'), {
      encoding: 'utf8'
    })
    const postRequest2Body = fs.readFileSync(path.join(__dirname,
      '../resources/sampleContainer/post2.ttl'), {
      encoding: 'utf8'
    })
    // Capture the resource name generated by server by parsing Location: header
    let postedResourceName
    const getResourceName = function (res) {
      postedResourceName = res.header.location
    }

    it('should create new document resource', function (done) {
      server.post('/post-tests/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'post-resource-1')
        .expect('location', /\/post-resource-1/)
        .expect(hasHeader('describedBy', suffixMeta))
        .expect(hasHeader('acl', suffixAcl))
        .expect(201, done)
    })
    it('should create new resource even if body is empty', function (done) {
      server.post('/post-tests/')
        .set('slug', 'post-resource-empty')
        .set('content-type', 'text/turtle')
        .expect(hasHeader('describedBy', suffixMeta))
        .expect(hasHeader('acl', suffixAcl))
        .expect('location', /.*\.ttl/)
        .expect(201, done)
    })
    it('should create container with new slug as a resource', function (done) {
      server.post('/post-tests/')
        .set('content-type', 'text/turtle')
        .set('slug', 'put-resource')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .send(postRequest2Body)
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            postLocation = res.headers.location
            // console.log('location ' + postLocation)
            const createdDir = fs.statSync(path.join(__dirname, '../resources', postLocation.slice(0, -1)))
            assert(createdDir.isDirectory(), 'Container should have been created')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })
    it('should get newly created container with new slug', function (done) {
      console.log('location' + postLocation)
      server.get(postLocation)
        .expect(200, done)
    })
    it('should error with 403 if auxiliary resource file.acl', function (done) {
      server.post('/post-tests/')
        .set('slug', 'post-acl-no-content-type.acl')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .expect(403, done)
    })
    it('should error with 403 if auxiliary resource .meta', function (done) {
      server.post('/post-tests/')
        .set('slug', '.meta')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .expect(403, done)
    })
    it('should error with 400 if the body is empty and no content type is provided', function (done) {
      server.post('/post-tests/')
        .set('slug', 'post-resource-empty-fail')
        .expect(400, done)
    })
    it('should error with 400 if the body is provided but there is no content-type header', function (done) {
      server.post('/post-tests/')
        .set('slug', 'post-resource-rdf-no-content-type')
        .send(postRequest1Body)
        .set('content-type', '')
        .expect(400, done)
    })
    it('should create new resource even if no trailing / is in the target',
      function (done) {
        server.post('')
          .send(postRequest1Body)
          .set('content-type', 'text/turtle')
          .set('slug', 'post-test-target')
          .expect('location', /\/post-test-target\.ttl/)
          .expect(hasHeader('describedBy', suffixMeta))
          .expect(hasHeader('acl', suffixAcl))
          .expect(201, done)
      })
    it('should create new resource even if slug contains invalid suffix', function (done) {
      server.post('/post-tests/')
        .set('slug', 'put-resource.acl.ttl')
        .send(postRequest1Body)
        .set('content-type', 'text-turtle')
        .expect(hasHeader('describedBy', suffixMeta))
        .expect(hasHeader('acl', suffixAcl))
        .expect(201, done)
    })
    it('create container with recursive example', function (done) {
      server.post('/post-tests/')
        .set('content-type', 'text/turtle')
        .set('slug', 'foo.bar.acl.meta')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .send(postRequest2Body)
        .expect('location', /\/post-tests\/foo.bar\//)
        .expect(201, done)
    })
    it('should fail return 404 if no parent container found', function (done) {
      server.post('/hello.html/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'post-test-target2')
        .expect(404, done)
    })
    it('should create a new slug if there is a resource with the same name',
      function (done) {
        server.post('/post-tests/')
          .send(postRequest1Body)
          .set('content-type', 'text/turtle')
          .set('slug', 'post-resource-1')
          .expect(201, done)
      })
    it('should be able to delete newly created resource', function (done) {
      server.delete('/post-tests/post-resource-1.ttl')
        .expect(200, done)
    })
    it('should create new resource without slug header', function (done) {
      server.post('/post-tests/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .expect(201)
        .expect(getResourceName)
        .end(done)
    })
    it('should be able to delete newly created resource (2)', function (done) {
      server.delete('/' +
          postedResourceName.replace(/https?:\/\/((127.0.0.1)|(localhost)):[0-9]*\//, ''))
        .expect(200, done)
    })
    it('should create container', function (done) {
      server.post('/post-tests/')
        .set('content-type', 'text/turtle')
        .set('slug', 'loans.ttl')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .send(postRequest2Body)
        .expect('location', /\/post-tests\/loans.ttl\//)
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            postLocation = res.headers.location
            console.log('location ' + postLocation)
            const createdDir = fs.statSync(path.join(__dirname, '../resources', postLocation.slice(0, -1)))
            assert(createdDir.isDirectory(), 'Container should have been created')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })
    it('should be able to access newly container', function (done) {
      console.log(postLocation)
      server.get(postLocation)
        // .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    it('should create container', function (done) {
      server.post('/post-tests/')
        .set('content-type', 'text/turtle')
        .set('slug', 'loans.acl.meta')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .send(postRequest2Body)
        .expect('location', /\/post-tests\/loans\//)
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            postLocation = res.headers.location
            assert(!postLocation.endsWith('.acl/') && !postLocation.endsWith('.meta/'), 'Container name cannot end with ".acl" or ".meta"')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })
    it('should be able to access newly created container', function (done) {
      console.log(postLocation)
      server.get(postLocation)
        // .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    it('should create a new slug if there is a container with same name', function (done) {
      server.post('/post-tests/')
        .send(postRequest1Body)
        .set('content-type', 'text/turtle')
        .set('slug', 'loans.ttl')
        .expect(201)
        .expect(getResourceName)
        .end(done)
    })
    it('should get newly created document resource with new slug', function (done) {
      console.log(postedResourceName)
      server.get(postedResourceName)
        .expect(200, done)
    })
    it('should create a container with a name hex decoded from the slug', (done) => {
      const containerName = 'Film%4011'
      const expectedDirName = '/post-tests/Film@11/'
      server.post('/post-tests/')
        .set('slug', containerName)
        .set('content-type', 'text/turtle')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert.equal(res.headers.location, expectedDirName,
              'Uri container names should be encoded')
            const createdDir = fs.statSync(path.join(__dirname, '../resources', expectedDirName))
            assert(createdDir.isDirectory(), 'Container should have been created')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    describe('content-type-based file extensions', () => {
      // ensure the container exists
      before(() =>
        server.post('/post-tests/')
          .send(postRequest1Body)
          .set('content-type', 'text/turtle')
      )

      describe('a new text/turtle document posted without slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('content-type', 'text/turtle; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .ttl extension', () => {
          expect(response.headers).to.have.property('location')
          expect(response.headers.location).to.match(/^\/post-tests\/[^./]+\.ttl$/)
        })
      })

      describe('a new text/turtle document posted with a slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('slug', 'slug1')
            .set('content-type', 'text/turtle; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .ttl extension', () => {
          expect(response.headers).to.have.property('location', '/post-tests/slug1.ttl')
        })
      })

      describe('a new text/html document posted without slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('content-type', 'text/html; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .html extension', () => {
          expect(response.headers).to.have.property('location')
          expect(response.headers.location).to.match(/^\/post-tests\/[^./]+\.html$/)
        })
      })

      describe('a new text/html document posted with a slug', () => {
        let response
        before(() =>
          server.post('/post-tests/')
            .set('slug', 'slug2')
            .set('content-type', 'text/html; charset=utf-8')
            .then(res => { response = res })
        )

        it('is assigned an URL with the .html extension', () => {
          expect(response.headers).to.have.property('location', '/post-tests/slug2.html')
        })
      })
    })

    /* No, URLs are NOT ex-encoded to make filenames -- the other way around.
    it('should create a container with a url name', (done) => {
      let containerName = 'https://example.com/page'
      let expectedDirName = '/post-tests/https%3A%2F%2Fexample.com%2Fpage/'
      server.post('/post-tests/')
        .set('slug', containerName)
        .set('content-type', 'text/turtle')
        .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
        .expect(201)
        .end((err, res) => {
          if (err) return done(err)
          try {
            assert.equal(res.headers.location, expectedDirName,
              'Uri container names should be encoded')
            let createdDir = fs.statSync(path.join(__dirname, 'resources', expectedDirName))
            assert(createdDir.isDirectory(), 'Container should have been created')
          } catch (err) {
            return done(err)
          }
          done()
        })
    })

    it('should be able to access new url-named container', (done) => {
      let containerUrl = '/post-tests/https%3A%2F%2Fexample.com%2Fpage/'
      server.get(containerUrl)
        .expect('content-type', /text\/turtle/)
        .expect(200, done)
    })
    */

    after(function () {
      // Clean up after POST API tests
      return Promise.all([
        rm('/post-tests/put-resource'),
        rm('/post-tests/'),
        rm('post-test-target.ttl')
      ])
    })
  })

  describe('POST (multipart)', function () {
    it('should create as many files as the ones passed in multipart',
      function (done) {
        server.post('/sampleContainer/')
          .attach('timbl', path.join(__dirname, '../resources/timbl.jpg'))
          .attach('nicola', path.join(__dirname, '../resources/nicola.jpg'))
          .expect(200)
          .end(function (err) {
            if (err) return done(err)

            const sizeNicola = fs.statSync(path.join(__dirname,
              '../resources/nicola.jpg')).size
            const sizeTim = fs.statSync(path.join(__dirname, '../resources/timbl.jpg')).size
            const sizeNicolaLocal = fs.statSync(path.join(__dirname,
              '../resources/sampleContainer/nicola.jpg')).size
            const sizeTimLocal = fs.statSync(path.join(__dirname,
              '../resources/sampleContainer/timbl.jpg')).size

            if (sizeNicola === sizeNicolaLocal && sizeTim === sizeTimLocal) {
              return done()
            } else {
              return done(new Error('Either the size (remote/local) don\'t match or files are not stored'))
            }
          })
      })
    after(function () {
      // Clean up after POST (multipart) API tests
      return Promise.all([
        rm('/sampleContainer/nicola.jpg'),
        rm('/sampleContainer/timbl.jpg')
      ])
    })
  })
})
