const ResourceMapper = require('../../lib/resource-mapper')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

const itMapsUrl = asserter(mapsUrl)
const itMapsFile = asserter(mapsFile)

describe('ResourceMapper', () => {
  describe('A ResourceMapper instance for a single-user setup', () => {
    const rootUrl = 'http://localhost/'
    const rootPath = '/var/www/folder/'
    const mapper = new ResourceMapper({ rootUrl, rootPath })

    // PUT base cases from https://www.w3.org/DesignIssues/HTTPFilenameMapping.html

    itMapsUrl(mapper, 'a URL with an extension that matches the content type',
      {
        url: 'http://localhost/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, "a URL with a bogus extension that doesn't match the content type",
      {
        url: 'http://localhost/space/foo.bar',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.bar$.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, "a URL with a real extension that doesn't match the content type",
      {
        url: 'http://localhost/space/foo.exe',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.exe$.html`,
        contentType: 'text/html'
      })

    // Additional PUT cases

    itMapsUrl(mapper, 'a URL without content type',
      {
        url: 'http://localhost/space/foo.html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html$.unknown`,
        contentType: 'application/octet-stream'
      })

    // GET/HEAD/POST/DELETE/PATCH base cases

    itMapsUrl.skip(mapper, 'a URL of a non-existing file',
      {
        url: 'http://localhost/space/foo.html'
      },
      [/* no files */],
      new Error('Not found'))

    itMapsUrl.skip(mapper, 'a URL of an existing file with extension',
      {
        url: 'http://localhost/space/foo.html'
      },
      [
        `${rootPath}space/foo.html`
      ],
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.html`
      ],
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    itMapsUrl.skip(mapper, 'an extensionless URL of an existing file, with multiple choices',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.html`,
        `${rootPath}space/foo$.ttl`,
        `${rootPath}space/foo$.png`
      ],
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    // Security cases

    itMapsUrl(mapper, 'a URL with an unknown content type',
      {
        url: 'http://localhost/space/foo.html',
        contentTypes: ['text/unknown'],
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html$.unknown`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL with a /.. path segment',
      {
        url: 'http://localhost/space/../bar'
      },
      new Error('Disallowed /.. segment in URL'))

    // File to URL mapping

    itMapsFile(mapper, 'an HTML file',
      { path: `${rootPath}space/foo.html` },
      {
        url: 'http://localhost/space/foo.html',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a Turtle file',
      { path: `${rootPath}space/foo.ttl` },
      {
        url: 'http://localhost/space/foo.ttl',
        contentType: 'text/turtle'
      })

    itMapsFile(mapper, 'an unknown file type',
      { path: `${rootPath}space/foo.bar` },
      {
        url: 'http://localhost/space/foo.bar',
        contentType: 'application/octet-stream'
      })

    itMapsFile(mapper, 'an extensionless HTML file',
      { path: `${rootPath}space/foo$.html` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'an extensionless Turtle file',
      { path: `${rootPath}space/foo$.ttl` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/turtle'
      })

    itMapsFile(mapper, 'an extensionless unknown file type',
      { path: `${rootPath}space/foo$.bar` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'application/octet-stream'
      })
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

function mapsFile (it, mapper, label, options, expected) {
  it(`maps ${label}`, async () => {
    const actual = await mapper.mapFileToUrl(options)
    expect(actual).to.deep.equal(expected)
  })
}
