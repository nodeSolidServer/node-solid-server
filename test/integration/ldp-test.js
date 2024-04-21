const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))
const $rdf = require('rdflib')
const ns = require('solid-namespace')($rdf)
const LDP = require('../../lib/ldp')
const path = require('path')
const stringToStream = require('../../lib/utils').stringToStream
const randomBytes = require('randombytes')
const ResourceMapper = require('../../lib/resource-mapper')

// Helper functions for the FS
const rm = require('./../utils').rm
// this write function destroys
// the flexibility of this test unit
// highly recommend removing it
// const write = require('./../utils').write
// var cp = require('./utils').cp
const read = require('./../utils').read
const fs = require('fs')
const intoStream = require('into-stream')

describe('LDP', function () {
  const root = path.join(__dirname, '../resources/ldp-test/')

  const resourceMapper = new ResourceMapper({
    rootUrl: 'https://localhost:8443/',
    rootPath: root,
    includeHost: false
  })

  const ldp = new LDP({
    resourceMapper,
    serverUri: 'https://localhost/',
    multiuser: true,
    webid: false
  })

  const rootQuota = path.join(__dirname, '../resources/ldp-test-quota/')
  const resourceMapperQuota = new ResourceMapper({
    rootUrl: 'https://localhost:8444/',
    rootPath: rootQuota,
    includeHost: false
  })

  const ldpQuota = new LDP({
    resourceMapper: resourceMapperQuota,
    serverUri: 'https://localhost/',
    multiuser: true,
    webid: false
  })

  this.beforeAll(() => {
    const metaData = `# Root Meta resource for the user account
    # Used to discover the account's WebID URI, given the account URI
    <https://tim.localhost:7777/profile/card#me>
      <http://www.w3.org/ns/solid/terms#account>
      </>.`

    const example1TurtleData = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix dc: <http://purl.org/dc/elements/1.1/> .
    @prefix ex: <http://example.org/stuff/1.0/> .
    
    <#this> dc:title "Test title" .
    
    <http://www.w3.org/TR/rdf-syntax-grammar>
      dc:title "RDF/XML Syntax Specification (Revised)" ;
      ex:editor [
        ex:fullname "Dave Beckett";
        ex:homePage <http://purl.org/net/dajobe/>
      ] .`
    fs.mkdirSync(root, { recursive: true })
    fs.mkdirSync(path.join(root, '/resources/'), { recursive: true })
    fs.mkdirSync(path.join(root, '/resources/sampleContainer/'), { recursive: true })
    fs.writeFileSync(path.join(root, '.meta'), metaData)
    fs.writeFileSync(path.join(root, 'resources/sampleContainer/example1.ttl'), example1TurtleData)

    const settingsTtlData = `@prefix dct: <http://purl.org/dc/terms/>.
    @prefix pim: <http://www.w3.org/ns/pim/space#>.
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.
    @prefix unit: <http://www.w3.invalid/ns#>.
    
    <>
      a pim:ConfigurationFile;
    
      dct:description "Administrative settings for the server that are only readable to the user." .
    
    </>
        solid:storageQuota "1230" .`

    fs.mkdirSync(rootQuota, { recursive: true })
    fs.mkdirSync(path.join(rootQuota, 'settings/'), { recursive: true })
    fs.writeFileSync(path.join(rootQuota, 'settings/serverSide.ttl'), settingsTtlData)
  })

  this.afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(rootQuota, { recursive: true, force: true })
  })

  describe('cannot delete podRoot', function () {
    it('should error 405 when deleting podRoot', () => {
      return ldp.delete('/').catch(err => {
        assert.equal(err.status, 405)
      })
    })
    it('should error 405 when deleting podRoot/.acl', async () => {
      await ldp.put('/.acl', intoStream(''), 'text/turtle')
      return ldp.delete('/.acl').catch(err => {
        assert.equal(err.status, 405)
      })
    })
  })

  describe('readResource', function () {
    it('return 404 if file does not exist', () => {
      // had to create the resources folder beforehand, otherwise throws 500 error
      return ldp.readResource('/resources/unexistent.ttl').catch(err => {
        assert.equal(err.status, 404)
      })
    })

    it('return file if file exists', () => {
      // file can be empty as well
      fs.writeFileSync(path.join(root, '/resources/fileExists.txt'), 'hello world')
      return ldp.readResource('/resources/fileExists.txt').then(file => {
        assert.equal(file, 'hello world')
      })
    })
  })

  describe('readContainerMeta', () => {
    it('should return 404 if .meta is not found', () => {
      return ldp.readContainerMeta('/resources/sampleContainer/').catch(err => {
        assert.equal(err.status, 404)
      })
    })

    it('should return content if metaFile exists', () => {
      // file can be empty as well
      // write('This function just reads this, does not parse it', 'sampleContainer/.meta')
      fs.writeFileSync(path.join(root, 'resources/sampleContainer/.meta'), 'This function just reads this, does not parse it')
      return ldp.readContainerMeta('/resources/sampleContainer/').then(metaFile => {
        // rm('sampleContainer/.meta')
        assert.equal(metaFile, 'This function just reads this, does not parse it')
      })
    })

    it('should work also if trailing `/` is not passed', () => {
      // file can be empty as well
      // write('This function just reads this, does not parse it', 'sampleContainer/.meta')
      fs.writeFileSync(path.join(root, 'resources/sampleContainer/.meta'), 'This function just reads this, does not parse it')
      return ldp.readContainerMeta('/resources/sampleContainer').then(metaFile => {
        // rm('sampleContainer/.meta')
        assert.equal(metaFile, 'This function just reads this, does not parse it')
      })
    })
  })

  describe('isOwner', () => {
    it('should return acl:owner true', () => {
      const owner = 'https://tim.localhost:7777/profile/card#me'
      return ldp.isOwner(owner, '/resources/')
        .then(isOwner => {
          assert.equal(isOwner, true)
        })
    })
    it('should return acl:owner false', () => {
      const owner = 'https://tim.localhost:7777/profile/card'
      return ldp.isOwner(owner, '/resources/')
        .then(isOwner => {
          assert.equal(isOwner, false)
        })
    })
  })

  describe('getGraph', () => {
    it('should read and parse an existing file', () => {
      const uri = 'https://localhost:8443/resources/sampleContainer/example1.ttl'
      return ldp.getGraph(uri)
        .then(graph => {
          assert.ok(graph)
          const fullname = $rdf.namedNode('http://example.org/stuff/1.0/fullname')
          const match = graph.match(null, fullname)
          assert.equal(match[0].object.value, 'Dave Beckett')
        })
    })

    it('should throw a 404 error on a non-existing file', (done) => {
      const uri = 'https://localhost:8443/resources/nonexistent.ttl'
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
      const originalResource = '/resources/sampleContainer/example1.ttl'
      const newResource = '/resources/sampleContainer/example1-copy.ttl'

      const uri = 'https://localhost:8443' + originalResource
      return ldp.getGraph(uri)
        .then(graph => {
          const newUri = 'https://localhost:8443' + newResource
          return ldp.putGraph(graph, newUri)
        })
        .then(() => {
          // Graph serialized and written
          const written = read('sampleContainer/example1-copy.ttl')
          assert.ok(written)
        })
        // cleanup
        .then(() => { rm('sampleContainer/example1-copy.ttl') })
        .catch(() => { rm('sampleContainer/example1-copy.ttl') })
    })
  })

  describe('put', function () {
    it('should write a file in an existing dir', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/testPut.txt', stream, 'text/plain').then(() => {
        const found = fs.readFileSync(path.join(root, '/resources/testPut.txt'))
        // const found = read('testPut.txt')
        // rm('testPut.txt')
        assert.equal(found, 'hello world')
      })
    })

    it('should fail if a trailing `/` is passed', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/', stream, 'text/plain').catch(err => {
        assert.equal(err.status, 409)
      })
    })

    it('with a larger file to exceed allowed quota', function () {
      const randstream = stringToStream(randomBytes(300000).toString())
      return ldp.put('/resources/testQuota.txt', randstream, 'text/plain').catch((err) => {
        // assert.notOk(err)
        // assert.equal(err.status, 413)
        assert.equal(err.message, 'not ok')
      })
    })

    it('should fail if a over quota', function () {
      const hellostream = stringToStream('hello world')
      return ldpQuota.put('/resources/testOverQuota.txt', hellostream, 'text/plain').catch((err) => {
        assert.equal(err.status, 413)
      })
    })

    it('should fail if a trailing `/` is passed without content type', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/', stream, null).catch(err => {
        assert.equal(err.status, 409)
      })
    })

    it('should fail if no content type is passed', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/testPut.txt', stream, null).catch(err => {
        assert.equal(err.status, 400)
      })
    })
  })

  describe('delete', function () {
    // FIXME: https://github.com/solid/node-solid-server/issues/1502
    // has to be changed from testPut.txt because depending on
    // other files in tests is bad practice.
    it('should error when deleting a non-existing file', () => {
      return assert.isRejected(ldp.delete('/resources/testPut2.txt'))
    })

    it('should delete a file with ACL in an existing dir', async () => {
      // First create a dummy file
      const stream = stringToStream('hello world')
      await ldp.put('/resources/testPut.txt', stream, 'text/plain')
      await ldp.put('/resources/testPut.txt.acl', stream, 'text/turtle')
      // Make sure it exists
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt', function (err) {
        if (err) {
          throw err
        }
      })
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt.acl', function (err) {
        if (err) {
          throw err
        }
      })

      // Now delete the dummy file
      await ldp.delete('/resources/testPut.txt')
      // Make sure it does not exist anymore
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt', function (err, s) {
        if (!err) {
          throw new Error('file still exists')
        }
      })
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt.acl', function (err, s) {
        if (!err) {
          throw new Error('file still exists')
        }
      })
    })

    it('should fail to delete a non-empty folder', async () => {
      // First create a dummy file
      const stream = stringToStream('hello world')
      await ldp.put('/resources/dummy/testPutBlocking.txt', stream, 'text/plain')
      // Make sure it exists
      fs.stat(ldp.resourceMapper._rootPath + '/resources/dummy/testPutBlocking.txt', function (err) {
        if (err) {
          throw err
        }
      })

      // Now try to delete its folder
      return assert.isRejected(ldp.delete('/resources/dummy/'))
    })

    it('should fail to delete nested non-empty folders', async () => {
      // First create a dummy file
      const stream = stringToStream('hello world')
      await ldp.put('/resources/dummy/dummy2/testPutBlocking.txt', stream, 'text/plain')
      // Make sure it exists
      fs.stat(ldp.resourceMapper._rootPath + '/resources/dummy/dummy2/testPutBlocking.txt', function (err) {
        if (err) {
          throw err
        }
      })

      // Now try to delete its parent folder
      return assert.isRejected(ldp.delete('/resources/dummy/'))
    })

    after(async function () {
      // Clean up after delete tests
      try {
        await ldp.delete('/resources/dummy/testPutBlocking.txt')
        await ldp.delete('/resources/dummy/dummy2/testPutBlocking.txt')
        await ldp.delete('/resources/dummy/dummy2/')
        await ldp.delete('/resources/dummy/')
      } catch (err) {

      }
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

      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'application/octet-stream', function (err, data) {
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
    it('should not inherit type of BasicContainer/Container if type is File', () => {
      const containerFileData = `'@prefix dcterms: <http://purl.org/dc/terms/>.' +
      '@prefix o: <http://example.org/ontology>.' +
      '<> a <http://www.w3.org/ns/ldp#Container> ;' +
      '   dcterms:title "This is a container" ;' +
      '   o:limit 500000.00 .'`
      fs.writeFileSync(path.join(root, '/resources/sampleContainer/containerFile.ttl'), containerFileData)
      const basicContainerFileData = `'@prefix dcterms: <http://purl.org/dc/terms/>.' +
      '@prefix o: <http://example.org/ontology>.' +
      '<> a <http://www.w3.org/ns/ldp#BasicContainer> ;' +
      '   dcterms:title "This is a container" ;' +
      '   o:limit 500000.00 .'`
      fs.writeFileSync(path.join(root, '/resources/sampleContainer/basicContainerFile.ttl'), basicContainerFileData)

      return ldp.listContainer(path.join(root, '/resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', '', 'server.tld')
        .then(data => {
          const graph = $rdf.graph()
          $rdf.parse(
            data,
            graph,
            'https://localhost:8443/resources/sampleContainer',
            'text/turtle')
          const basicContainerStatements = graph.each(
            $rdf.sym('https://localhost:8443/resources/sampleContainer/basicContainerFile.ttl'),
            ns.rdf('type'),
            null
          ).map(d => { return d.uri })
          const expectedStatements = [
            'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
            'http://www.w3.org/ns/ldp#Resource'
          ]
          assert.deepEqual(basicContainerStatements.sort(), expectedStatements)

          const containerStatements = graph
            .each(
              $rdf.sym('https://localhost:8443/resources/sampleContainer/containerFile.ttl'),
              ns.rdf('type'),
              undefined
            )
            .map(d => { return d.uri })
          assert.deepEqual(containerStatements.sort(), expectedStatements)

          rm('sampleContainer/containerFile.ttl')
          rm('sampleContainer/basicContainerFile.ttl')
        })
    })

    it('should ldp:contains the same files in dir', () => {
      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', '', 'server.tld')
        .then(data => {
          fs.readdir(path.join(__dirname, '../resources/sampleContainer/'), function (err, expectedFiles) {
            // Strip dollar extension
            expectedFiles = expectedFiles.map(ldp.resourceMapper._removeDollarExtension)

            if (err) {
              return Promise.reject(err)
            }

            const graph = $rdf.graph()
            $rdf.parse(data, graph, 'https://localhost:8443/resources/sampleContainer/', 'text/turtle')
            const statements = graph.match(null, ns.ldp('contains'), null)
            const files = statements
              .map(s => s.object.value.replace(/.*\//, ''))
              .map(decodeURIComponent)

            files.sort()
            expectedFiles.sort()
            assert.deepEqual(files, expectedFiles)
          })
        })
    })
  })
})
