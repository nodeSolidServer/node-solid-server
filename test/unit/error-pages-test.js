'use strict'
const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.should()

const errorPages = require('../../lib/handlers/error-pages')

describe('handlers/error-pages', () => {
  describe('handler()', () => {
    it('should use the custom error handler if available', () => {
      let ldp = { errorHandler: sinon.stub() }
      let req = { app: { locals: { ldp } } }
      let res = { status: sinon.stub(), send: sinon.stub() }
      let err = {}
      let next = {}

      errorPages.handler(err, req, res, next)

      expect(ldp.errorHandler).to.have.been.calledWith(err, req, res, next)

      expect(res.status).to.not.have.been.called()
      expect(res.send).to.not.have.been.called()
    })

    it('defaults to status code 500 if none is specified in the error', () => {
      let ldp = { noErrorPages: true }
      let req = { app: { locals: { ldp } } }
      let res = { status: sinon.stub(), send: sinon.stub(), header: sinon.stub() }
      let err = { message: 'Unspecified error' }
      let next = {}

      errorPages.handler(err, req, res, next)

      expect(res.status).to.have.been.calledWith(500)
      expect(res.header).to.have.been.calledWith('Content-Type', 'text/plain;charset=utf-8')
      expect(res.send).to.have.been.calledWith('Unspecified error\n')
    })
  })

  describe('sendErrorResponse()', () => {
    it('should send http status code and error message', () => {
      let statusCode = 404
      let error = {
        message: 'Error description'
      }
      let res = {
        status: sinon.stub(),
        header: sinon.stub(),
        send: sinon.stub()
      }

      errorPages.sendErrorResponse(statusCode, res, error)

      expect(res.status).to.have.been.calledWith(404)
      expect(res.header).to.have.been.calledWith('Content-Type', 'text/plain;charset=utf-8')
      expect(res.send).to.have.been.calledWith('Error description\n')
    })
  })

  describe('setAuthenticateHeader()', () => {
    it('should do nothing for a non-implemented auth method', () => {
      let err = {}
      let req = {
        app: { locals: { authMethod: null } }
      }
      let res = {
        set: sinon.stub()
      }

      errorPages.setAuthenticateHeader(req, res, err)

      expect(res.set).to.not.have.been.called()
    })
  })

  describe('sendErrorPage()', () => {
    it('falls back the default sendErrorResponse if no page is found', () => {
      let statusCode = 400
      let res = {
        status: sinon.stub(),
        header: sinon.stub(),
        send: sinon.stub()
      }
      let err = { message: 'Error description' }
      let ldp = { errorPages: './' }

      return errorPages.sendErrorPage(statusCode, res, err, ldp)
        .then(() => {
          expect(res.status).to.have.been.calledWith(400)
          expect(res.header).to.have.been.calledWith('Content-Type', 'text/plain;charset=utf-8')
          expect(res.send).to.have.been.calledWith('Error description\n')
        })
    })
  })
})
