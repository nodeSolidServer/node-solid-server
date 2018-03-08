const ResourceMapper = require('../../lib/resource-mapper')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

describe('ResourceMapper', () => {
  describe('A ResourceMapper instance for a single-user setup', () => {
    const rootPath = '/var/www/folder/'
    const mapper = new ResourceMapper({ rootPath })

    // PUT base cases from https://www.w3.org/DesignIssues/HTTPFilenameMapping.html

    itMapsUrl(mapper, 'a URL with an extension that matches the content type',
      {
        url: 'http://localhost/space/foo.html',
        contentTypes: ['text/html'],
        createIfNotExists: true
      },
      { path: `${rootPath}space/foo.html` })

    itMapsUrl(mapper, "a URL with a bogus extension that doesn't match the content type",
      {
        url: 'http://localhost/space/foo.bar',
        contentTypes: ['text/html'],
        createIfNotExists: true
      },
      { path: `${rootPath}space/foo.bar$.html` })

    itMapsUrl(mapper, "a URL with a real extension that doesn't match the content type",
      {
        url: 'http://localhost/space/foo.exe',
        contentTypes: ['text/html'],
        createIfNotExists: true
      },
      { path: `${rootPath}space/foo.exe$.html` })

    // Security cases

    itMapsUrl(mapper, 'a URL with an unknown content type',
      {
        url: 'http://localhost/space/foo.html',
        contentTypes: ['text/unknown'],
        createIfNotExists: true
      },
      { path: `${rootPath}space/foo.html$` })

    itMapsUrl(mapper, 'a URL with a /.. path segment',
      {
        url: 'http://localhost/space/../bar'
      },
      new Error('Disallowed /.. segment in URL'))
  })
})

function itMapsUrl (mapper, label, options, expected) {
  if (!(expected instanceof Error)) {
    it(`maps ${label}`, async () => {
      const actual = await mapper.mapUrlToFile(options)
      expect(actual).to.deep.equal(expected)
    })
  } else {
    it(`does not map ${label}`, async () => {
      const actual = mapper.mapUrlToFile(options)
      await expect(actual).to.be.rejectedWith(expected.message)
    })
  }
}
