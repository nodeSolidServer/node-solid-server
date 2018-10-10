const LegacyResourceMapper = require('../../lib/legacy-resource-mapper')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

const rootUrl = 'http://localhost/'
const rootPath = '/var/www/folder/'

const itMapsUrl = asserter(mapsUrl)
const itMapsFile = asserter(mapsFile)

describe('LegacyResourceMapper', () => {
  describe('A LegacyResourceMapper instance for a single-host setup', () => {
    const mapper = new LegacyResourceMapper({ rootUrl, rootPath })

    // adapted PUT base cases from https://www.w3.org/DesignIssues/HTTPFilenameMapping.html

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

    // Additional PUT cases

    itMapsUrl(mapper, 'a URL without content type',
      {
        url: 'http://localhost/space/foo.html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL with an alternative extension that matches the content type',
      {
        url: 'http://localhost/space/foo.jpeg',
        contentType: 'image/jpeg',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.jpeg`,
        contentType: 'image/jpeg'
      })

    itMapsUrl(mapper, 'a URL with an uppercase extension that matches the content type',
      {
        url: 'http://localhost/space/foo.JPG',
        contentType: 'image/jpeg',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.JPG`,
        contentType: 'image/jpeg'
      })

    itMapsUrl(mapper, 'a URL with a mixed-case extension that matches the content type',
      {
        url: 'http://localhost/space/foo.jPeG',
        contentType: 'image/jpeg',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.jPeG`,
        contentType: 'image/jpeg'
      })

    // GET/HEAD/POST/DELETE/PATCH base cases

    itMapsUrl(mapper, 'a URL of an existing file with extension',
      {
        url: 'http://localhost/space/foo.html'
      },
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'an extensionless URL of an existing file',
      {
        url: 'http://localhost/space/foo'
      },
      {
        path: `${rootPath}space/foo`,
        contentType: 'text/turtle'
      })

    itMapsUrl(mapper, 'a URL of an existing file with encoded characters',
      {
        url: 'http://localhost/space/foo%20bar%20bar.html'
      },
      {
        path: `${rootPath}space/foo bar bar.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL of a new file with encoded characters',
      {
        url: 'http://localhost/space%2Ffoo%20bar%20bar.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo bar bar.html`,
        contentType: 'text/html'
      })

    // Security cases

    itMapsUrl(mapper, 'a URL with a /.. path segment',
      {
        url: 'http://localhost/space/../bar'
      },
      new Error('Disallowed /.. segment in URL'))

    itMapsUrl(mapper, 'a URL with an encoded /.. path segment',
      {
        url: 'http://localhost/space%2F..%2Fbar'
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

    itMapsFile(mapper, 'a file with an uppercase extension',
      { path: `${rootPath}space/foo.HTML` },
      {
        url: 'http://localhost/space/foo.HTML',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with a mixed-case extension',
      { path: `${rootPath}space/foo.HtMl` },
      {
        url: 'http://localhost/space/foo.HtMl',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with disallowed IRI characters',
      { path: `${rootPath}space/foo bar bar.html` },
      {
        url: 'http://localhost/space/foo%20bar%20bar.html',
        contentType: 'text/html'
      })
  })

  describe('A LegacyResourceMapper instance for a multi-host setup', () => {
    const mapper = new LegacyResourceMapper({ rootUrl, rootPath, includeHost: true })

    itMapsUrl(mapper, 'a URL with a host',
      {
        url: 'http://example.org/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}example.org/space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL with a host with a port',
      {
        url: 'http://example.org:3000/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}example.org/space/foo.html`,
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file on a host',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A LegacyResourceMapper instance for a multi-host setup with a subfolder root URL', () => {
    const rootUrl = 'http://localhost/foo/bar/'
    const mapper = new LegacyResourceMapper({ rootUrl, rootPath, includeHost: true })

    itMapsFile(mapper, 'a file on a host',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org/foo/bar/space/foo.html',
        contentType: 'text/html'
      })
  })
})

function asserter (assert) {
  const f = (...args) => assert(it, ...args)
  f.skip = (...args) => assert(it.skip, ...args)
  f.only = (...args) => assert(it.only, ...args)
  return f
}

function mapsUrl (it, mapper, label, options, expected) {
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
  it(`maps ${label}`, () => {
    const actual = mapper.mapFileToUrl(options)
    expect(actual).to.deep.equal(expected)
  })
}
