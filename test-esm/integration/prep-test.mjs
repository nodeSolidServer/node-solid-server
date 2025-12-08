import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import { validate as uuidValidate } from 'uuid'
import { expect } from 'chai'
import { parseDictionary } from 'structured-headers'
import prepFetch from 'prep-fetch'
import { createServer } from '../../test/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dateTimeRegex = /^-?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|(?:\+|-)\d{2}:\d{2})$/

const samplePath = path.join(__dirname, '../../test/resources', 'sampleContainer')
const sampleFile = fs.readFileSync(path.join(samplePath, 'example1.ttl'))

describe('Per Resource Events Protocol', function () {
  let server

  before((done) => {
    server = createServer({
      live: true,
      dataBrowserPath: 'default',
      root: path.join(__dirname, '../../test/resources'),
      auth: 'oidc',
      webid: false,
      prep: true
    })
    server.listen(8445, done)
  })

  after(() => {
    if (fs.existsSync(path.join(samplePath, 'example-post'))) {
      fs.rmSync(path.join(samplePath, 'example-post'), { recursive: true, force: true })
    }
    server.close()
  })

  it('should set `Accept-Events` header on a GET response with "prep"',
    async function () {
      const response = await fetch('http://localhost:8445/sampleContainer/example1.ttl')
      expect(response.headers.get('Accept-Events')).to.match(/^"prep"/)
      expect(response.status).to.equal(200)
    }
  )

  it('should send an ordinary response, if `Accept-Events` header is not specified',
    async function () {
      const response = await fetch('http://localhost:8445/sampleContainer/example1.ttl')
      expect(response.headers.get('Content-Type')).to.match(/text\/turtle/)
      expect(response.headers.has('Events')).to.equal(false)
      expect(response.status).to.equal(200)
    })

  describe('with prep response on container', async function () {
    let response
    let prepResponse
    const controller = new AbortController()
    const { signal } = controller

    it('should set headers correctly', async function () {
      response = await fetch('http://localhost:8445/sampleContainer/', {
        headers: {
          'Accept-Events': '"prep";accept=application/ld+json',
          Accept: 'text/turtle'
        },
        signal
      })
      expect(response.status).to.equal(200)
      expect(response.headers.get('Vary')).to.match(/Accept-Events/)
      const eventsHeader = parseDictionary(response.headers.get('Events'))
      expect(eventsHeader.get('protocol')?.[0]).to.equal('prep')
      expect(eventsHeader.get('status')?.[0]).to.equal(200)
      expect(eventsHeader.get('expires')?.[0]).to.be.a('string')
      expect(response.headers.get('Content-Type')).to.match(/^multipart\/mixed/)
    })

    it('should send a representation as the first part, matching the content size on disk',
      async function () {
        prepResponse = prepFetch(response)
        const representation = await prepResponse.getRepresentation()
        expect(representation.headers.get('Content-Type')).to.match(/text\/turtle/)
        await representation.text()
      })

    describe('should send notifications in the second part', async function () {
      let notifications
      let notificationsIterator

      it('when a contained resource is created', async function () {
        notifications = await prepResponse.getNotifications()
        notificationsIterator = notifications.notifications()
        await fetch('http://localhost:8445/sampleContainer/example-prep.ttl', {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/turtle'
          },
          body: sampleFile
        })
        const { value } = await notificationsIterator.next()
        expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
        const notification = await value.json()
        expect(notification.published).to.match(dateTimeRegex)
        expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
        expect(notification.type).to.equal('Add')
        expect(notification.target).to.match(/sampleContainer\/$/)
        expect(notification.object).to.match(/sampleContainer\/example-prep\.ttl$/)
        expect(uuidValidate(notification.id.substring(9))).to.equal(true)
        expect(notification.state).to.match(/\w{6}/)
      })

      it('when contained resource is modified', async function () {
        await fetch('http://localhost:8445/sampleContainer/example-prep.ttl', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'text/n3'
          },
          body: `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
<> a solid:InsertDeletePatch;
solid:inserts { <u> <v> <z>. }.`
        })
        const { value } = await notificationsIterator.next()
        expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
        const notification = await value.json()
        expect(notification.published).to.match(dateTimeRegex)
        expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
        expect(notification.type).to.equal('Update')
        expect(notification.object).to.match(/sampleContainer\/$/)
        expect(uuidValidate(notification.id.substring(9))).to.equal(true)
        expect(notification.state).to.match(/\w{6}/)
      })

      it('when contained resource is deleted',
        async function () {
          await fetch('http://localhost:8445/sampleContainer/example-prep.ttl', {
            method: 'DELETE'
          })
          const { value } = await notificationsIterator.next()
          expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
          const notification = await value.json()
          expect(notification.published).to.match(dateTimeRegex)
          expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
          expect(notification.type).to.equal('Remove')
          expect(notification.origin).to.match(/sampleContainer\/$/)
          expect(notification.object).to.match(/sampleContainer\/.*example-prep.ttl$/)
          expect(uuidValidate(notification.id.substring(9))).to.equal(true)
          expect(notification.state).to.match(/\w{6}/)
        })

      it('when a contained container is created', async function () {
        await fetch('http://localhost:8445/sampleContainer/example-prep/', {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/turtle'
          }
        })
        const { value } = await notificationsIterator.next()
        expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
        const notification = await value.json()
        expect(notification.published).to.match(dateTimeRegex)
        expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
        expect(notification.type).to.equal('Add')
        expect(notification.target).to.match(/sampleContainer\/$/)
        expect(notification.object).to.match(/sampleContainer\/example-prep\/$/)
        expect(uuidValidate(notification.id.substring(9))).to.equal(true)
        expect(notification.state).to.match(/\w{6}/)
      })

      it('when a contained container is deleted', async function () {
        await fetch('http://localhost:8445/sampleContainer/example-prep/', {
          method: 'DELETE'
        })
        const { value } = await notificationsIterator.next()
        expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
        const notification = await value.json()
        expect(notification.published).to.match(dateTimeRegex)
        expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
        expect(notification.type).to.equal('Remove')
        expect(notification.origin).to.match(/sampleContainer\/$/)
        expect(notification.object).to.match(/sampleContainer\/example-prep\/$/)
        expect(uuidValidate(notification.id.substring(9))).to.equal(true)
        expect(notification.state).to.match(/\w{6}/)
      })

      it('when a container is created by POST',
        async function () {
          await fetch('http://localhost:8445/sampleContainer/', {
            method: 'POST',
            headers: {
              slug: 'example-post',
              link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
              'content-type': 'text/turtle'
            }
          })
          const { value } = await notificationsIterator.next()
          expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
          const notification = await value.json()
          expect(notification.published).to.match(dateTimeRegex)
          expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
          expect(notification.type).to.equal('Add')
          expect(notification.target).to.match(/sampleContainer\/$/)
          expect(notification.object).to.match(/sampleContainer\/.*example-post\/$/)
          expect(uuidValidate(notification.id.substring(9))).to.equal(true)
          expect(notification.state).to.match(/\w{6}/)
        })

      it('when resource is created by POST',
        async function () {
          await fetch('http://localhost:8445/sampleContainer/', {
            method: 'POST',
            headers: {
              slug: 'example-prep.ttl',
              'content-type': 'text/turtle'
            },
            body: sampleFile
          })
          const { value } = await notificationsIterator.next()
          expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
          const notification = await value.json()
          expect(notification.published).to.match(dateTimeRegex)
          expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
          expect(notification.type).to.equal('Add')
          expect(notification.target).to.match(/sampleContainer\/$/)
          expect(notification.object).to.match(/sampleContainer\/.*example-prep.ttl$/)
          expect(uuidValidate(notification.id.substring(9))).to.equal(true)
          expect(notification.state).to.match(/\w{6}/)
          controller.abort()
        })
    })
  })

  describe('with prep response on RDF resource', async function () {
    let response
    let prepResponse

    it('should set headers correctly', async function () {
      response = await fetch('http://localhost:8445/sampleContainer/example-prep.ttl', {
        headers: {
          'Accept-Events': '"prep";accept=application/ld+json',
          Accept: 'text/n3'
        }
      })
      expect(response.status).to.equal(200)
      expect(response.headers.get('Vary')).to.match(/Accept-Events/)
      const eventsHeader = parseDictionary(response.headers.get('Events'))
      expect(eventsHeader.get('protocol')?.[0]).to.equal('prep')
      expect(eventsHeader.get('status')?.[0]).to.equal(200)
      expect(eventsHeader.get('expires')?.[0]).to.be.a('string')
      expect(response.headers.get('Content-Type')).to.match(/^multipart\/mixed/)
    })

    it('should send a representation as the first part, matching the content size on disk',
      async function () {
        prepResponse = prepFetch(response)
        const representation = await prepResponse.getRepresentation()
        expect(representation.headers.get('Content-Type')).to.match(/text\/n3/)
        const blob = await representation.blob()
        expect(function (done) {
          const size = fs.statSync(path.join(__dirname,
            '../../test/resources/sampleContainer/example-prep.ttl')).size
          if (blob.size !== size) {
            return done(new Error('files are not of the same size'))
          }
        })
      })

    describe('should send notifications in the second part', async function () {
      let notifications
      let notificationsIterator

      it('when modified with PATCH', async function () {
        notifications = await prepResponse.getNotifications()
        notificationsIterator = notifications.notifications()
        await fetch('http://localhost:8445/sampleContainer/example-prep.ttl', {
          method: 'PATCH',
          headers: {
            'content-type': 'text/n3'
          },
          body: `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
<> a solid:InsertDeletePatch;
solid:inserts { <u> <v> <z>. }.`
        })
        const { value } = await notificationsIterator.next()
        expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
        const notification = await value.json()
        expect(notification.published).to.match(dateTimeRegex)
        expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
        expect(notification.type).to.equal('Update')
        expect(notification.object).to.match(/sampleContainer\/example-prep\.ttl$/)
        expect(uuidValidate(notification.id.substring(9))).to.equal(true)
        expect(notification.state).to.match(/\w{6}/)
      })

      it('when removed with DELETE, it should also close the connection',
        async function () {
          await fetch('http://localhost:8445/sampleContainer/example-prep.ttl', {
            method: 'DELETE'
          })
          const { value } = await notificationsIterator.next()
          expect(value.headers.get('content-type')).to.match(/application\/ld\+json/)
          const notification = await value.json()
          expect(notification.published).to.match(dateTimeRegex)
          expect(isNaN((new Date(notification.published)).valueOf())).to.equal(false)
          expect(notification.type).to.equal('Delete')
          expect(notification.object).to.match(/sampleContainer\/example-prep\.ttl$/)
          expect(uuidValidate(notification.id.substring(9))).to.equal(true)
          expect(notification.state).to.match(/\w{6}/)
          const { done } = await notificationsIterator.next()
          expect(done).to.equal(true)
        })
    })
  })
})
