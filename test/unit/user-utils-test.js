const chai = require('chai')
const expect = chai.expect
const userUtils = require('../../lib/common/user-utils')
const $rdf = require('rdflib')

describe('user-utils', () => {
  describe('getName', () => {
    let ldp
    const webId = 'http://test#me'
    const name = 'NAME'

    beforeEach(() => {
      const store = $rdf.graph()
      store.add($rdf.sym(webId), $rdf.sym('http://www.w3.org/2006/vcard/ns#fn'), $rdf.lit(name))
      ldp = { fetchGraph: () => Promise.resolve(store) }
    })

    it('should return name from graph', async () => {
      const returnedName = await userUtils.getName(webId, ldp.fetchGraph)
      expect(returnedName).to.equal(name)
    })
  })

  describe('getWebId', () => {
    let fetchGraph
    const webId = 'https://test.localhost:8443/profile/card#me'
    const suffixMeta = '.meta'

    beforeEach(() => {
      fetchGraph = () => Promise.resolve(`<${webId}> <http://www.w3.org/ns/solid/terms#account> </>.`)
    })

    it('should return webId from meta file', async () => {
      const returnedWebId = await userUtils.getWebId('foo', 'https://bar/', suffixMeta, fetchGraph)
      expect(returnedWebId).to.equal(webId)
    })
  })

  describe('isValidUsername', () => {
    it('should accect valid usernames', () => {
      const usernames = [
        'foo',
        'bar'
      ]
      const validUsernames = usernames.filter(username => userUtils.isValidUsername(username))
      expect(validUsernames.length).to.equal(usernames.length)
    })

    it('should not accect invalid usernames', () => {
      const usernames = [
        '-',
        '-a',
        'a-',
        '9-',
        'alice--bob',
        'alice bob',
        'alice.bob'
      ]
      const validUsernames = usernames.filter(username => userUtils.isValidUsername(username))
      expect(validUsernames.length).to.equal(0)
    })
  })
})
