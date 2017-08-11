const forceUser = require('../../lib/api/authn/force-user')
const sinon = require('sinon')
const chai = require('chai')
const { expect } = chai
const sinonChai = require('sinon-chai')
chai.use(sinonChai)

const USER = 'https://ruben.verborgh.org/profile/#me'

describe('Force User', () => {
  describe('a forceUser handler', () => {
    let app, handler
    before(() => {
      app = { use: sinon.stub() }
      const argv = { forceUser: USER }
      forceUser.initialize(app, argv)
      handler = app.use.getCall(0).args[1]
    })

    it('adds a route on /', () => {
      expect(app.use).to.have.callCount(1)
      expect(app.use).to.have.been.calledWith('/')
    })

    describe('when called', () => {
      let request, response
      before(done => {
        request = { session: {} }
        response = { set: sinon.stub() }
        handler(request, response, done)
      })

      it('sets session.userId to the user', () => {
        expect(request.session).to.have.property('userId', USER)
      })

      it('does not set the User header', () => {
        expect(response.set).to.have.callCount(0)
      })
    })
  })

  describe('a forceUser handler for TLS', () => {
    let handler
    before(() => {
      const app = { use: sinon.stub() }
      const argv = { forceUser: USER, auth: 'tls' }
      forceUser.initialize(app, argv)
      handler = app.use.getCall(0).args[1]
    })

    describe('when called', () => {
      let request, response
      before(done => {
        request = { session: {} }
        response = { set: sinon.stub() }
        handler(request, response, done)
      })

      it('sets session.userId to the user', () => {
        expect(request.session).to.have.property('userId', USER)
      })

      it('sets the User header', () => {
        expect(response.set).to.have.callCount(1)
        expect(response.set).to.have.been.calledWith('User', USER)
      })
    })
  })
})
