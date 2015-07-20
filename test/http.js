/*jslint node: true*/
var supertest = require('supertest');
var path = require('path');
var ldnode = require('../index');
var fs = require('fs');
var S = require('string');
var li = require('li');

describe('HTTP APIs', function() {
  var address = 'http://localhost:3457';
  var ldp = ldnode.createServer({
    root: __dirname + '/resources',
  });
  ldp.listen(3457);

  var server = supertest(address);

  describe('GET Root container', function() {
      it('Should exists', function(done) {
          server.get('/')
              .expect(200, done);
      });
      it('Should be a turtle file by default', function(done) {
          server.get('/')
              .expect('content-type', /text\/turtle/)
              .expect(200, done);
      });
  });

  describe('GET API', function() {
      it('Should return 404 for non-existent resource', function(done) {
          server.get('/invalidfile.foo')
              .expect(404, done);
      });
      it('Should return basic container link for directories', function(done) {
          server.get('/')
              .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#BasicContainer/)
              .expect(200, done);
      });
      it('Should return resource link for files', function(done) {
          server.get('/hello.html')
              .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
              .expect(200, done);
      });
      it('Should have glob support', function(done) {
          server.get('/sampleContainer/example*')
              .expect('content-type', /text\/turtle/)
              .expect(200, done);
      });
  });

  describe('HEAD API', function() {
      var emptyResponse = function(res) {
          if (res.text.length !== 0) {
              error("Not empty response");
          }
      };
      var getLink= function(res, rel) {
          var links = res.headers.link.split(',');
          for (var linkIndex in links) {
              var link = links[linkIndex];
              var parsedLink = li.parse(link);
              for (var linkRel in parsedLink) {
                  if (linkRel == rel) {
                      return parsedLink[rel];
                  }
              }
          }
          return undefined;
      };
      var hasHeader = function(rel, value) {
          var handler = function(res) {
              var link = getLink(res, rel);
              if (link) {
                  if (link !== value) {
                      error("Not same value");
                  }
              } else {
                  error("Header does not exist");
              }
          };
          return handler;
      };
      it('Should return empty response body', function(done) {
          server.head('/patch-5-initial.ttl')
              .expect(emptyResponse)
              .expect(200, done);
      });
      it('Should return meta header', function(done) {
          server.head('/')
              .expect(hasHeader('\'describedBy\'', address + '/' + '.meta'))
              .expect(200, done);
      });
      it('Should return acl header', function(done) {
          server.head('/')
              .expect(hasHeader('\'acl\'', address + '/' + '.acl'))
              .expect(200, done);
      });

  });

  describe('PUT API', function() {
      var putRequestBody = fs.readFileSync(__dirname + '/resources/sampleContainer/put1.ttl', {
          'encoding': 'utf8'
      });
      it('Should create new resource', function(done) {
          server.put('/put-resource-1.ttl')
              .send(putRequestBody)
              .set('content-type', 'text/turtle')
              .expect(201, done);
      });
      it('Should create directories if they do not exist', function (done) {
          server.put('/foo/bar/baz.ttl')
              .send(putRequestBody)
              .set('content-type', 'text/turtle')
              .expect(function() {
                  fs.unlinkSync(__dirname + '/resources/foo/bar/baz.ttl');
                  fs.rmdirSync(__dirname + '/resources/foo/bar/');
                  fs.rmdirSync(__dirname + '/resources/foo/');
              })
              .expect(201, done);
      });
      it('Should return 409 code when trying to put to a container', function(done) {
          server.put('/')
              .expect(409, done);
      });
  });

  describe('DELETE API', function() {
      it('Should return 404 status when deleting a file that does not exists',
          function(done) {
              server.delete('/false-file-48484848')
                  .expect(404, done);
          });
      it('Should delete previously PUT file', function(done) {
          server.delete('/put-resource-1.ttl')
              .expect(200, done);
      });
  });

  describe('POST API', function() {
      var postRequest1Body = fs.readFileSync(__dirname + '/resources/sampleContainer/put1.ttl', {
          'encoding': 'utf8'
      });
      var postRequest2Body = fs.readFileSync(__dirname + '/resources/sampleContainer/post2.ttl', {
          'encoding': 'utf8'
      });
      it('Should create new resource', function(done) {
          server.post('/')
              .send(postRequest1Body)
              .set('content-type', 'text/turtle')
              .set('slug', 'post-resource-1')
              .expect('location', address + '/post-resource-1.ttl')
              .expect(201, done);
      });
      it('Should reject requests to existing resources', function(done) {
          server.post('/')
              .send(postRequest1Body)
              .set('content-type', 'text/turtle')
              .set('slug', 'post-resource-1')
              .expect(400, done);
      });
      it('Should be able to delete newly created resource', function(done) {
          server.delete('/post-resource-1.ttl')
              .expect(200, done);
      });
      var postResourceName;
      var setResourceName = function(res) {
          postResourceName = res.header.location;
      };
      it('Should create new resource without slug header', function(done) {
          server.post('/')
              .send(postRequest1Body)
              .set('content-type', 'text/turtle')
              .expect(201)
              .expect(setResourceName)
              .end(done);
      });
      it('Should be able to delete newly created resource', function(done) {
          server.delete('/' + S(postResourceName).chompLeft(address).s)
              .expect(200, done);
      });
      it('Should create container', function(done) {
          server.post('/')
              .set('content-type', 'text/turtle')
              .set('slug', 'loans')
              .set('link', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
              .send(postRequest2Body)
              .expect(201, done);
      });
      it('Should be able to access container', function(done) {
          server.get('/loans')
              .expect('content-type', /text\/turtle/)
              .expect(function() {
                  fs.unlinkSync(__dirname + '/resources/loans/.meta');
                  fs.rmdirSync(__dirname + '/resources/loans/');
              })
              .expect(200, done);
      });
  });
});

