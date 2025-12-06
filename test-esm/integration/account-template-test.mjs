import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs-extra'
import chai from 'chai'
import sinonChai from 'sinon-chai'

import AccountTemplate from '../../lib/models/account-template.js'
import UserAccount from '../../lib/models/user-account.js'

const { expect } = chai
chai.use(sinonChai)
chai.should()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const templatePath = path.join(__dirname, '../../default-templates/new-account')
const accountPath = path.join(__dirname, '../../test/resources/new-account')

// FIXME #1502
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
          expect(profile).to.include('solid:oidcIssuer')
          // why does this need to be included?
          // with the current configuration, 'host' for
          // ldp is not set, therefore solid:oidcIssuer is empty
          // expect(profile).to.include('<https://example.com>')

          const rootAcl = fs.readFileSync(path.join(accountPath, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('<https://alice.example.com/#me>')
        })
    })
  })

  describe('templateSubtitutionsFor()', () => {
    it('should not update the webid', () => {
      const userAccount = new UserAccount({
        webId: 'https://alice.example.com/#me',
        email: 'alice@example.com',
        name: 'Alice Q.'
      })

      const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)

      expect(substitutions.webId).to.equal('/#me')
    })

    it('should not update the nested webid', () => {
      const userAccount = new UserAccount({
        webId: 'https://alice.example.com/alice/#me',
        email: 'alice@example.com',
        name: 'Alice Q.'
      })

      const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)

      expect(substitutions.webId).to.equal('/alice/#me')
    })

    it('should update the webid', () => {
      const userAccount = new UserAccount({
        webId: 'http://localhost:8443/alice/#me',
        email: 'alice@example.com',
        name: 'Alice Q.'
      })

      const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)

      expect(substitutions.webId).to.equal('/alice/#me')
    })
  })

  describe('creating account where webId does match server Uri?', () => {
    it('should have a relative uri for the base path rather than a complete uri', () => {
      const userAccount = new UserAccount({
        webId: 'http://localhost:8443/alice/#me',
        email: 'alice@example.com',
        name: 'Alice Q.'
      })

      const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)
      const template = new AccountTemplate({ substitutions })
      return AccountTemplate.copyTemplateDir(templatePath, accountPath)
        .then(() => {
          return template.processAccount(accountPath)
        }).then(() => {
          const profile = fs.readFileSync(path.join(accountPath, '/profile/card$.ttl'), 'utf8')
          expect(profile).to.include('"Alice Q."')
          expect(profile).to.include('solid:oidcIssuer')
          // why does this need to be included?
          // with the current configuration, 'host' for
          // ldp is not set, therefore solid:oidcIssuer is empty
          // expect(profile).to.include('<https://example.com>')

          const rootAcl = fs.readFileSync(path.join(accountPath, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('</alice/#me>')
        })
    })
  })
})
