var assert = require('chai').assert
var $rdf = require('rdflib')
var ns = require('solid-namespace')($rdf)
var LDP = require('../../lib/ldp')
var path = require('path')
var stringToStream = require('../../lib/utils').stringToStream
var randomBytes = require('randombytes')
var LegacyResourceMapper = require('../../lib/legacy-resource-mapper')

// Helper functions for the FS
var rm = require('./../utils').rm
var write = require('./../utils').write
// var cp = require('./utils').cp
var read = require('./../utils').read
var fs = require('fs')

describe('LDP', function () {
  var root = path.join(__dirname, '..')

  var resourceMapper = new LegacyResourceMapper({
    rootPath: root
  })

  var ldp = new LDP({
    root: path.join(__dirname, '..'),
    resourceMapper,
    serverUri: 'https://localhost',
    multiuser: true,
    webid: false
  })

  describe('readResource', function () {
    it('return 404 if file does not exist', () => {
      return ldp.readResource('/resources/unexistent.ttl').catch(err => {
        assert.equal(err.status, 404)
      })
    })

    it('return file if file exists', () => {
      // file can be empty as well
      write('hello world', 'fileExists.txt')
      return ldp.readResource('/resources/fileExists.txt').then(file => {
        rm('fileExists.txt')
        assert.equal(file, 'hello world')
      })
    })
  })

  describe('readContainerMeta', () => {
    it('should return 404 if .meta is not found', () => {
      return ldp.readContainerMeta('/resources/').catch(err => {
        assert.equal(err.status, 404)
      })
    })

    it('should return content if metaFile exists', () => {
      // file can be empty as well
      write('This function just reads this, does not parse it', '.meta')
      return ldp.readContainerMeta('/resources/').then(metaFile => {
        rm('.meta')
        assert.equal(metaFile, 'This function just reads this, does not parse it')
      })
    })

    it('should work also if trailing `/` is not passed', () => {
      // file can be empty as well
      write('This function just reads this, does not parse it', '.meta')
      return ldp.readContainerMeta('/resources').then(metaFile => {
        rm('.meta')
        assert.equal(metaFile, 'This function just reads this, does not parse it')
      })
    })
  })

  describe('getGraph', () => {
    it.skip('should read and parse an existing file', () => {
      let uri = 'https://localhost:8443/resources/sampleContainer/example1.ttl'
      return ldp.getGraph(uri)
        .then(graph => {
          assert.ok(graph)
          let fullname = $rdf.namedNode('http://example.org/stuff/1.0/fullname')
          let match = graph.match(null, fullname)
          assert.equal(match[0].object.value, 'Dave Beckett')
        })
    })

    it('should throw a 404 error on a non-existing file', (done) => {
      let uri = 'https://localhost:8443/resources/nonexistent.ttl'
      ldp.getGraph(uri)
        .catch(error => {
          assert.ok(error)
          assert.equal(error.status, 404)
          done()
        })
    })
  })

  describe('putGraph', () => {
    it('should serialize and write a graph to a file', () => {
      let originalResource = '/resources/sampleContainer/example1.ttl'
      let newResource = '/resources/sampleContainer/example1-copy.ttl'

      let uri = 'https://localhost:8443' + originalResource
      return ldp.getGraph(uri)
        .then(graph => {
          let newUri = 'https://localhost:8443' + newResource
          return ldp.putGraph(graph, newUri)
        })
        .then(() => {
          // Graph serialized and written
          let written = read('sampleContainer/example1-copy.ttl')
          assert.ok(written)
        })
        // cleanup
        .then(() => { rm('sampleContainer/example1-copy.ttl') })
        .catch(() => { rm('sampleContainer/example1-copy.ttl') })
    })
  })

  describe('put', function () {
    it.skip('should write a file in an existing dir', () => {
      var stream = stringToStream('hello world')
      return ldp.put('/resources/testPut.txt', stream).then(() => {
        var found = read('testPut.txt')
        rm('testPut.txt')
        assert.equal(found, 'hello world')
      })
    })

    it('should fail if a trailing `/` is passed', () => {
      var stream = stringToStream('hello world')
      return ldp.put('/resources/', stream).catch(err => {
        assert.equal(err.status, 409)
      })
    })

    it.skip('with a larger file to exceed allowed quota', function (done) {
      var randstream = stringToStream(randomBytes(2100))
      ldp.put('localhost', '/resources/testQuota.txt', randstream, function (err) {
        console.log(err)
        assert.notOk(err)
        done()
      })
    })
    it.skip('should fail if a over quota', function (done) {
      var hellostream = stringToStream('hello world')
      ldp.put('localhost', '/resources/testOverQuota.txt', hellostream, function (err) {
        console.log(err)
        assert.equal(err.status, 413)
        done()
      })
    })
  })

  describe('delete', function () {
    it.skip('should delete a file in an existing dir', function (done) {
      var stream = stringToStream('hello world')
      ldp.put('/resources/testPut.txt', stream).then(() => {
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
    /*
    it('should inherit type if file is .ttl', function (done) {
      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#MagicType> ;' +
        '   dcterms:title "This is a magic type" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/magicType.ttl')

      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
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
*/
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

      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
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

    it('should ldp:contains the same files in dir', function (done) {
      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'text/turtle', function (err, data) {
        if (err) done(err)
        fs.readdir(path.join(__dirname, '../resources/sampleContainer/'), function (err, expectedFiles) {
          const graph = $rdf.graph()
          $rdf.parse(data, graph, 'https://server.tld/sampleContainer/', 'text/turtle')
          const statements = graph.match(null, ns.ldp('contains'), null)
          const files = statements
            .map(s => s.object.value.replace(/.*\//, ''))
            .map(decodeURIComponent)

          files.sort()
          expectedFiles.sort()
          assert.deepEqual(files, expectedFiles)
          done(err)
        })
      })
    })
  })
})
