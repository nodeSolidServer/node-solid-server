var assert = require('chai').assert
var $rdf = require('rdflib')
var ns = require('solid-namespace')($rdf)
var LDP = require('../lib/ldp')
var path = require('path')
var stringToStream = require('../lib/utils').stringToStream

// Helper functions for the FS
var rm = require('./test-utils').rm
var write = require('./test-utils').write
// var cp = require('./test-utils').cp
var read = require('./test-utils').read
var fs = require('fs')

describe('LDP', function () {
  var ldp = new LDP({
    root: __dirname
  })

  describe('readFile', function () {
    it('return 404 if file does not exist', function (done) {
      ldp.readFile('resources/unexistent.ttl', function (err) {
        assert.equal(err.status, 404)
        done()
      })
    })

    it('return file if file exists', function (done) {
      // file can be empty as well
      write('hello world', 'fileExists.txt')
      ldp.readFile(path.join(__dirname, '/resources/fileExists.txt'), function (err, file) {
        rm('fileExists.txt')
        assert.notOk(err)
        assert.equal(file, 'hello world')
        done()
      })
    })
  })

  describe('readContainerMeta', function () {
    it('should return 404 if .meta is not found', function (done) {
      ldp.readContainerMeta('resources/', function (err) {
        assert.equal(err.status, 404)
        done()
      })
    })

    it('should return content if metaFile exists', function (done) {
      // file can be empty as well
      write('This function just reads this, does not parse it', '.meta')
      ldp.readContainerMeta(path.join(__dirname, '/resources/'), function (err, metaFile) {
        rm('.meta')
        assert.notOk(err)
        assert.equal(metaFile, 'This function just reads this, does not parse it')
        done()
      })
    })

    it('should work also if trailing `/` is not passed', function (done) {
      // file can be empty as well
      write('This function just reads this, does not parse it', '.meta')
      ldp.readContainerMeta(path.join(__dirname, '/resources'), function (err, metaFile) {
        rm('.meta')
        assert.notOk(err)
        assert.equal(metaFile, 'This function just reads this, does not parse it')
        done()
      })
    })
  })

  describe('put', function () {
    it('should write a file in an existing dir', function (done) {
      var stream = stringToStream('hello world')
      ldp.put('localhost', '/resources/testPut.txt', stream, function (err) {
        assert.notOk(err)
        var found = read('testPut.txt')
        rm('testPut.txt')
        assert.equal(found, 'hello world')
        done()
      })
    })

    it('should fail if a trailing `/` is passed', function (done) {
      var stream = stringToStream('hello world')
      ldp.put('localhost', '/resources/', stream, function (err) {
        assert.equal(err.status, 409)
        done()
      })
    })
  })

  describe('delete', function () {
    it('should delete a file in an existing dir', function (done) {
      var stream = stringToStream('hello world')
      ldp.put('localhost', '/resources/testPut.txt', stream, function (err) {
        assert.notOk(err)
        fs.stat(ldp.root + '/resources/testPut.txt', function (err) {
          if (err) {
            return done(err)
          }
          ldp.delete('localhost', '/resources/testPut.txt', function (err) {
            if (err) done(err)
            fs.stat(ldp.root + '/resources/testPut.txt', function (err) {
              return done(err ? null : new Error('file still exists'))
            })
          })
        })
      })
    })
  })
  describe('listContainer', function () {
    it('should inherit type if file is .ttl', function (done) {
      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#MagicType> ;' +
        '   dcterms:title "This is a magic type" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/magicType.ttl')

      ldp.listContainer(path.join(__dirname, '/resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
        if (err) done(err)
        var graph = $rdf.graph()
        $rdf.parse(
          data,
          graph,
          'https://server.tld/sampleContainer',
          'text/turtle')

        var statements = graph
          .each(
            $rdf.sym('https://server.tld/magicType.ttl'),
            ns.rdf('type'),
            undefined)
          .map(function (d) {
            return d.uri
          })
        // statements should be:
        // [ 'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
        //   'http://www.w3.org/ns/ldp#MagicType',
        //   'http://www.w3.org/ns/ldp#Resource' ]
        assert.equal(statements.length, 3)
        assert.isAbove(statements.indexOf('http://www.w3.org/ns/ldp#MagicType'), -1)
        assert.isAbove(statements.indexOf('http://www.w3.org/ns/ldp#Resource'), -1)

        rm('sampleContainer/magicType.ttl')
        done()
      })
    })

    it('should not inherit type of BasicContainer/Container if type is File', function (done) {
      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#Container> ;' +
        '   dcterms:title "This is a container" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/containerFile.ttl')

      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#BasicContainer> ;' +
        '   dcterms:title "This is a container" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/basicContainerFile.ttl')

      ldp.listContainer(path.join(__dirname, '/resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
        if (err) done(err)
        var graph = $rdf.graph()
        $rdf.parse(
          data,
          graph,
          'https://server.tld/sampleContainer',
          'text/turtle')

        var basicContainerStatements = graph
          .each(
            $rdf.sym('https://server.tld/basicContainerFile.ttl'),
            ns.rdf('type'),
            undefined
          )
          .map(d => { return d.uri })

        let expectedStatements = [
          'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
          'http://www.w3.org/ns/ldp#Resource'
        ]
        assert.deepEqual(basicContainerStatements.sort(), expectedStatements)

        var containerStatements = graph
          .each(
            $rdf.sym('https://server.tld/containerFile.ttl'),
            ns.rdf('type'),
          undefined
          )
          .map(d => { return d.uri })

        assert.deepEqual(containerStatements.sort(), expectedStatements)

        rm('sampleContainer/containerFile.ttl')
        rm('sampleContainer/basicContainerFile.ttl')
        done()
      })
    })

    it('should ldp:contains the same amount of files in dir', function (done) {
      ldp.listContainer(path.join(__dirname, '/resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
        if (err) done(err)
        fs.readdir(path.join(__dirname, '/resources/sampleContainer/'), function (err, files) {
          var graph = $rdf.graph()
          $rdf.parse(
            data,
            graph,
            'https://server.tld/sampleContainer',
            'text/turtle')

          var statements = graph.each(
            undefined,
            ns.ldp('contains'),
            undefined)

          assert.notEqual(graph.statements.length, 0)
          assert.equal(statements.length, files.length)
          assert.notOk(err)
          done()
        })
      })
    })
  })
})
