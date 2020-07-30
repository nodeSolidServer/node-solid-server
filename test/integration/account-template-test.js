'use strict'
/* eslint-disable no-unused-expressions */

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const AccountTemplate = require('../../lib/models/account-template')

const templatePath = path.join(__dirname, '../../default-templates/new-account')
const accountPath = path.join(__dirname, '../resources/new-account')

describe('AccountTemplate', () => {
  beforeEach(() => {
    fs.removeSync(accountPath)
  })

  afterEach(() => {
    fs.removeSync(accountPath)
  })

  describe('copy()', () => {
    it('should copy a directory', () => {
      return AccountTemplate.copyTemplateDir(templatePath, accountPath)
        .then(() => {
          const rootAcl = fs.readFileSync(path.join(accountPath, '.acl'), 'utf8')
          expect(rootAcl).to.exist
        })
    })
  })

  describe('processAccount()', () => {
    it('should process all the files in an account', () => {
      const substitutions = {
        webId: 'https://alice.example.com/#me',
        email: 'alice@example.com',
        name: 'Alice Q.'
      }
      const template = new AccountTemplate({ substitutions })

      return AccountTemplate.copyTemplateDir(templatePath, accountPath)
        .then(() => {
          return template.processAccount(accountPath)
        })
        .then(() => {
          const profile = fs.readFileSync(path.join(accountPath, '/profile/card$.ttl'), 'utf8')
          expect(profile).to.include('"Alice Q."')

          const rootAcl = fs.readFileSync(path.join(accountPath, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('<https://alice.example.com/#me>')
        })
    })
  })
})
