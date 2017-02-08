'use strict'

const path = require('path')
const fs = require('fs-extra')
const chai = require('chai')
const expect = chai.expect
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const AccountTemplate = require('../lib/models/account-template')
const UserAccount = require('../lib/models/user-account')

const templatePath = path.join(__dirname, '../account-template-default')
const accountPath = path.join(__dirname, 'resources', 'new-account')

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
          let rootAcl = fs.readFileSync(path.join(accountPath, '.acl'))
          expect(rootAcl).to.exist
        })
    })
  })

  describe('isTemplate()', () => {
    let template = new AccountTemplate()

    it('should recognize rdf files as templates', () => {
      expect(template.isTemplate('./file.ttl')).to.be.true
      expect(template.isTemplate('./file.rdf')).to.be.true
      expect(template.isTemplate('./file.html')).to.be.true
      expect(template.isTemplate('./file.jsonld')).to.be.true
    })

    it('should recognize files with template extensions as templates', () => {
      expect(template.isTemplate('./.acl')).to.be.true
      expect(template.isTemplate('./.meta')).to.be.true
      expect(template.isTemplate('./file.json')).to.be.true
      expect(template.isTemplate('./file.acl')).to.be.true
      expect(template.isTemplate('./file.meta')).to.be.true
      expect(template.isTemplate('./file.hbs')).to.be.true
      expect(template.isTemplate('./file.handlebars')).to.be.true
    })

    it('should recognize reserved files with no extensions as templates', () => {
      expect(template.isTemplate('./card')).to.be.true
    })

    it('should recognize arbitrary binary files as non-templates', () => {
      expect(template.isTemplate('./favicon.ico')).to.be.false
      expect(template.isTemplate('./file')).to.be.false
    })
  })

  describe('templateSubstitutionsFor()', () => {
    it('should init', () => {
      let userOptions = {
        username: 'alice',
        webId: 'https://alice.example.com/profile/card#me',
        name: 'Alice Q.',
        email: 'alice@example.com'
      }
      let userAccount = UserAccount.from(userOptions)

      let substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)
      expect(substitutions.name).to.equal('Alice Q.')
      expect(substitutions.accountMailto).to.equal('acl:agent <mailto:alice@example.com> ;')
      expect(substitutions.webId).to.equal('https://alice.example.com/profile/card#me')
    })
  })

  describe('processAccount()', () => {
    it('should process all the files in an account', () => {
      let substitutions = {
        webId: 'https://alice.example.com/#me',
        accountMailto: 'acl:agent <mailto:alice@example.com> ;',
        name: 'Alice Q.'
      }
      let template = new AccountTemplate({ substitutions })

      return AccountTemplate.copyTemplateDir(templatePath, accountPath)
        .then(() => {
          return template.processAccount(accountPath)
        })
        .then(() => {
          let profile = fs.readFileSync(path.join(accountPath, '/profile/card'), 'utf8')
          expect(profile).to.include('"Alice Q."')

          let rootAcl = fs.readFileSync(path.join(accountPath, '.acl'), 'utf8')
          expect(rootAcl).to.include('<mailto:alice@')
          expect(rootAcl).to.include('<https://alice.example.com/#me>')
        })
    })
  })
})
