const ResourceMapper = require('../../lib/resource-mapper')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

const itMapsUrl = asserter(mapsUrl)

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

    // GET/HEAD/POST/DELETE/PATCH base cases

    itMapsUrl.skip(mapper, 'a URL of a non-existing file',
      {
        url: 'http://localhost/space/foo.html',
        contentTypes: ['text/html']
      },
      [/* no files */],
      new Error('Not found'))

    itMapsUrl(mapper, 'a URL of an existing file with extension',
      {
        url: 'http://localhost/space/foo.html',
        contentTypes: ['text/html']
      },
      [
        `${rootPath}space/foo.html`
      ],
      { path: `${rootPath}space/foo.html` })

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file',
      {
        url: 'http://localhost/space/foo',
        contentTypes: ['text/html']
      },
      [
        `${rootPath}space/foo$.html`
      ],
      { path: `${rootPath}space/foo$.html` })

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file, with choices',
      {
        url: 'http://localhost/space/foo',
        contentTypes: ['text/html', 'text/turtle', 'image/png']
      },
      [
        `${rootPath}space/foo$.html`,
        `${rootPath}space/foo$.ttl`,
        `${rootPath}space/foo$.png`
      ],
      { path: `${rootPath}space/foo$.html` })

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file, first choice not available',
      {
        url: 'http://localhost/space/foo',
        contentTypes: ['text/html', 'text/turtle', 'image/png']
      },
      [
        `${rootPath}space/foo$.ttl`,
        `${rootPath}space/foo$.png`
      ],
      { path: `${rootPath}space/foo$.ttl` })

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file, no choice available',
      {
        url: 'http://localhost/space/foo',
        contentTypes: ['text/html', 'text/turtle', 'image/png']
      },
      [
        `${rootPath}space/foo$.txt`
      ],
      new Error('Not acceptable'))

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file, no choice given',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.txt`
      ],
      { path: `${rootPath}space/foo$.txt` })

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

function asserter (assert) {
  const f = (...args) => assert(it, ...args)
  f.skip = (...args) => assert(it.skip, ...args)
  f.only = (...args) => assert(it.only, ...args)
  return f
}

function mapsUrl (it, mapper, label, options, files, expected) {
  // Shift parameters if necessary
  if (!expected) {
    expected = files
    files = []
  }

  // Set up positive test
  if (!(expected instanceof Error)) {
    it(`maps ${label}`, async () => {
      const actual = await mapper.mapUrlToFile(options)
      expect(actual).to.deep.equal(expected)
    })
  // Set up error test
  } else {
    it(`does not map ${label}`, async () => {
      const actual = mapper.mapUrlToFile(options)
      await expect(actual).to.be.rejectedWith(expected.message)
    })
  }
}
