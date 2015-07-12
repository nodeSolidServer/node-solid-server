var expect = require('chai').expect;
var ldnode = require('../index');
var supertest = require('supertest');

describe('params', function () {

  describe('uri', function () {

  //   describe('not passed', function () {

  //     var ldp = ldnode.createServer({
  //       base: __dirname
  //     });
  //     ldp.listen(3456);

  //     it('should be the proxy value if exist', function (done) {
  //       done();
  //     })

  //     it('should be localhost if no proxy', function (done) {
  //       done();
  //     })
  //   })

  //   describe('passed', function() {
  //     var ldp = ldnode.createServer({
  //       uri: 'http://example.com',
  //       base: __dirname
  //     });
  //     ldp.listen(3456);
  //     it ('should not use proxy', function (done) {
  //       done();
  //     })
  //   })
  })

  describe('base', function () {

    describe('not passed', function () {
      it ('should fallback on current working directory', function (done) {
        done()
      })
    })

    describe('passed', function() {
    })
  })
})
