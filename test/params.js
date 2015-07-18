var assert = require('chai').assert;
var ldnode = require('../index');
var supertest = require('supertest');
var fs = require('fs');

function cp (src, dest) {
  return fsExtra.copySync(
    __dirname + '/resources/' + src,
    __dirname + '/resources/' + dest);
}

function read (file) {
  return fs.readFileSync(__dirname + '/resources/' + file, {
      'encoding': 'utf8'
    });
}

function rm (file) {
  return fs.unlinkSync(__dirname + '/resources/' + file);
}

function write (text, file) {
  return fs.writeFileSync(__dirname + '/resources/' + file, text);
}

describe('params', function () {

  describe('mount', function () {

    describe('not passed', function () {
      it('should fallback on /', function (done) {
        var ldp = ldnode();
        assert.equal(ldp.locals.ldp.mount, '/');
        done();
      });

    });

    describe('passed', function() {
      it ('should properly set the opts.mount', function (done) {
        var ldp1 = ldnode({
          mount: '/'
        });
        assert.equal(ldp1.locals.ldp.mount, '/');

        var ldp2 = ldnode({
          mount: '/test'
        });
        assert.equal(ldp2.locals.ldp.mount, '/test');

        done();
      });
      it('should drop tha trailing /', function () {
        var ldp1 = ldnode({
          mount: '/test/'
        });
        assert.equal(ldp1.locals.ldp.mount, '/test');

        var ldp2 = ldnode({
          mount: '/test/test'
        });
        assert.equal(ldp1.locals.ldp.mount, '/test');
      });
    });
  });

  describe('root', function () {
    describe('not passed', function () {
      var ldp = ldnode();
      var server = supertest(ldp);
      
      it ('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.root, process.cwd() + '/');
      });

      it ('should find resource in correct path', function(done) {
        write(
          '<#current> <#temp> 123 .',
          'sampleContainer/example.ttl');

        // This assums npm test is run from the folder that contains package.js
        server.get('/test/resources/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function(err, res, body) {
            assert.equal(read('sampleContainer/example.ttl'), '<#current> <#temp> 123 .');
            rm('sampleContainer/example.ttl');
            done(err);
          });
      });
    });

    describe('passed', function() {
      var ldp = ldnode({root:'./test/resources/'});
      var server = supertest(ldp);

      it ('should fallback on current working directory', function () {
        assert.equal(ldp.locals.ldp.root, './test/resources/');
      });

      it ('should find resource in correct path', function(done) {
        write(
          '<#current> <#temp> 123 .',
          'sampleContainer/example.ttl');

        // This assums npm test is run from the folder that contains package.js
        server.get('/sampleContainer/example.ttl')
          .expect('Link', /http:\/\/www.w3.org\/ns\/ldp#Resource/)
          .expect(200)
          .end(function(err, res, body) {
            assert.equal(read('sampleContainer/example.ttl'), '<#current> <#temp> 123 .');
            rm('sampleContainer/example.ttl');
            done(err);
          });
      });
    });
  });
});
