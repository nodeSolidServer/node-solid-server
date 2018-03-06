const ResourceMapper = require('../../lib/resource-mapper')
const { expect } = require('chai')

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
  })
})

function itMapsUrl (mapper, label, options, expected) {
  it(`maps ${label}`, async () => {
    const actual = await mapper.mapUrlToFile(options)
    expect(actual).to.deep.equal(expected)
  })
}
