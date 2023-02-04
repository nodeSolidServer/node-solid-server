/* eslint-disable no-unused-expressions */

const Solid = require('../../index')
const path = require('path')
const { cleanDir } = require('../utils')
const supertest = require('supertest')
const expect = require('chai').expect

describe('API', () => {
  const configPath = path.join(__dirname, '../resources/config')

  const serverConfig = {
    sslKey: path.join(__dirname, '../keys/key.pem'),
    sslCert: path.join(__dirname, '../keys/cert.pem'),
    auth: 'oidc',
    dataBrowser: false,
    webid: true,
    multiuser: false,
    configPath
  }

  function startServer (pod, port) {
    return new Promise((resolve) => {
      pod.listen(port, () => { resolve() })
    })
  }

  describe('Payment Pointer Alice', () => {
    let alice
    const aliceServerUri = 'https://localhost:5000'
    const aliceDbPath = path.join(__dirname,
      '../resources/accounts-scenario/alice/db')
    const aliceRootPath = path.join(__dirname, '../resources/accounts-scenario/alice')

    const alicePod = Solid.createServer(
      Object.assign({
        root: aliceRootPath,
        serverUri: aliceServerUri,
        dbPath: aliceDbPath
      }, serverConfig)
    )

    before(() => {
      return Promise.all([
        startServer(alicePod, 5000)
      ]).then(() => {
        alice = supertest(aliceServerUri)
      })
    })

    after(() => {
      alicePod.close()
      cleanDir(aliceRootPath)
    })

    describe('GET Payment Pointer document', () => {
      it('should show instructions to add a triple', (done) => {
        alice.get('/.well-known/pay')
          .expect(200)
          .expect('content-type', /application\/json/)
          .end(function (err, req) {
            if (err) {
              done(err)
            } else {
              expect(req.body).deep.equal({
                fail: 'Add triple',
                subject: '<https://localhost:5000/profile/card#me>',
                predicate: '<http://paymentpointers.org/ns#PaymentPointer>',
                object: '$alice.example'
              })
              done()
            }
          })
      })
    })
  })

  describe('Payment Pointer Bob', () => {
    let bob
    const bobServerUri = 'https://localhost:5001'
    const bobDbPath = path.join(__dirname,
      '../resources/accounts-scenario/bob/db')
    const bobRootPath = path.join(__dirname, '../resources/accounts-scenario/bob')
    const bobPod = Solid.createServer(
      Object.assign({
        root: bobRootPath,
        serverUri: bobServerUri,
        dbPath: bobDbPath
      }, serverConfig)
    )

    before(() => {
      return Promise.all([
        startServer(bobPod, 5001)
      ]).then(() => {
        bob = supertest(bobServerUri)
      })
    })

    after(() => {
      bobPod.close()
      cleanDir(bobRootPath)
    })

    describe('GET Payment Pointer document', () => {
      it.skip('should redirect to example.com', (done) => {
        bob.get('/.well-known/pay')
          .expect('location', 'https://bob.com/.well-known/pay')
          .expect(302, done)
      })
    })
  })

  describe('Payment Pointer Charlie', () => {
    let charlie
    const charlieServerUri = 'https://localhost:5002'
    const charlieDbPath = path.join(__dirname,
      '../resources/accounts-scenario/charlie/db')
    const charlieRootPath = path.join(__dirname, '../resources/accounts-scenario/charlie')
    const charliePod = Solid.createServer(
      Object.assign({
        root: charlieRootPath,
        serverUri: charlieServerUri,
        dbPath: charlieDbPath
      }, serverConfig)
    )

    before(() => {
      return Promise.all([
        startServer(charliePod, 5002)
      ]).then(() => {
        charlie = supertest(charlieServerUri)
      })
    })

    after(() => {
      charliePod.close()
      cleanDir(charlieRootPath)
    })

    describe('GET Payment Pointer document', () => {
      it('should redirect to example.com/charlie', (done) => {
        charlie.get('/.well-known/pay')
          .expect('location', 'https://service.com/charlie')
          .expect(302, done)
      })
    })
  })
})
