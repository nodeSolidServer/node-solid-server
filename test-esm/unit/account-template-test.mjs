import { createRequire } from 'module'
import chai from 'chai'
import sinonChai from 'sinon-chai'

const { expect } = chai
chai.use(sinonChai)
chai.should()

import AccountTemplate from '../../lib/models/account-template.mjs'
import UserAccount from '../../lib/models/user-account.mjs'

describe('AccountTemplate', () => {
  describe('isTemplate()', () => {
    const template = new AccountTemplate()

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
      const userOptions = {
        username: 'alice',
        webId: 'https://alice.example.com/profile/card#me',
        name: 'Alice Q.',
        email: 'alice@example.com'
      }
      const userAccount = UserAccount.from(userOptions)

      const substitutions = AccountTemplate.templateSubstitutionsFor(userAccount)
      expect(substitutions.name).to.equal('Alice Q.')
      expect(substitutions.email).to.equal('alice@example.com')
      expect(substitutions.webId).to.equal('/profile/card#me')
    })
  })
})