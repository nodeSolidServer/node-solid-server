const ResourceMapper = require('../../lib/resource-mapper')
const chai = require('chai')
const { expect } = chai
chai.use(require('chai-as-promised'))

const rootUrl = 'http://localhost/'
const rootPath = '/var/www/folder/'

const itMapsUrl = asserter(mapsUrl)
const itMapsFile = asserter(mapsFile)

describe('ResourceMapper', () => {
  describe('A ResourceMapper instance for a single-host setup', () => {
    const mapper = new ResourceMapper({
      rootUrl,
      rootPath,
      includeHost: false
    })

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

    itMapsUrl(mapper, 'a URL with an overridden extension that matches the content type',
      {
        url: 'http://localhost/space/foo.acl',
        contentType: 'text/turtle',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.acl`,
        contentType: 'text/turtle'
      })

    itMapsUrl(mapper, 'a URL with an alternative overridden extension that matches the content type',
      {
        url: 'http://localhost/space/foo.acl',
        contentType: 'text/n3',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.acl$.n3`,
        contentType: 'text/n3'
      })

    itMapsUrl(mapper, 'a URL with a file extension having more than one possible content type',
      {
        url: 'http://localhost/space/foo.mp3',
        contentType: 'audio/mp3',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.mp3`,
        contentType: 'audio/mp3'
      })

    // GET/HEAD/POST/DELETE/PATCH base cases

    itMapsUrl(mapper, 'a URL of a non-existing file',
      {
        url: 'http://localhost/space/foo.html'
      },
      [/* no files */],
      new Error('Resource not found: /space/foo.html'))

    itMapsUrl(mapper, 'a URL of an existing file with extension',
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

    itMapsUrl(mapper, 'an extensionless URL of an existing file',
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

    itMapsUrl(mapper, 'an extensionless URL of an existing file, with multiple choices',
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

    itMapsUrl(mapper, 'an extensionless URL of an existing file with an uppercase extension',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.HTML`
      ],
      {
        path: `${rootPath}space/foo$.HTML`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'an extensionless URL of an existing file with a mixed-case extension',
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.HtMl`
      ],
      {
        path: `${rootPath}space/foo$.HtMl`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL of an existing file with encoded characters',
      {
        url: 'http://localhost/space/foo%20bar%20bar.html'
      },
      [
        `${rootPath}space/foo bar bar.html`
      ],
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

    itMapsUrl(mapper, 'a URL of an existing .acl file',
      {
        url: 'http://localhost/space/.acl'
      },
      [
        `${rootPath}space/.acl`
      ],
      {
        path: `${rootPath}space/.acl`,
        contentType: 'text/turtle'
      })

    itMapsUrl(mapper, 'a URL of an existing .acl file with a different content type',
      {
        url: 'http://localhost/space/.acl'
      },
      [
        `${rootPath}space/.acl$.n3`
      ],
      {
        path: `${rootPath}space/.acl$.n3`,
        contentType: 'text/n3'
      })

    itMapsUrl(mapper, 'a URL ending with a slash when index.html is available',
      {
        url: 'http://localhost/space/',
        contentType: 'text/html'
      },
      [
        `${rootPath}space/index.html`,
        `${rootPath}space/index$.ttl`
      ],
      {
        path: `${rootPath}space/index.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL ending with a slash when index.ttl is available',
      {
        url: 'http://localhost/space/'
      },
      [
        `${rootPath}space/index.ttl`
      ],
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL ending with a slash when index$.html is available',
      {
        url: 'http://localhost/space/'
      },
      [
        `${rootPath}space/index$.html`,
        `${rootPath}space/index$.ttl`
      ],
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL ending with a slash when index$.ttl is available',
      {
        url: 'http://localhost/space/'
      },
      [
        `${rootPath}space/index$.ttl`
      ],
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL ending with a slash to a folder when index.html is available but index is skipped',
      {
        url: 'http://localhost/space/',
        searchIndex: false
      },
      [
        `${rootPath}space/index.html`,
        `${rootPath}space/index$.ttl`
      ],
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL ending with a slash to a folder when no index is available',
      {
        url: 'http://localhost/space/'
      },
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL of that has an accompanying acl file, but no actual file',
      {
        url: 'http://localhost/space/'
      },
      [
        `${rootPath}space/index.acl`
      ],
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL ending with a slash for text/html when index.html is not available',
      {
        url: 'http://localhost/space/',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/index.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL of that has an accompanying meta file, but no actual file',
      {
        url: 'http://localhost/space/',
        contentType: 'text/html',
        createIfNotExists: true
      },
      [
        `${rootPath}space/index.meta`
      ],
      {
        path: `${rootPath}space/index.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL ending with a slash to a folder when index is skipped',
      {
        url: 'http://localhost/space/',
        contentType: 'application/octet-stream',
        createIfNotExists: true,
        searchIndex: false
      },
      {
        path: `${rootPath}space/`,
        contentType: 'application/octet-stream'
      })

    itMapsUrl(mapper, 'a URL ending with a slash for text/turtle',
      {
        url: 'http://localhost/space/',
        contentType: 'text/turtle',
        createIfNotExists: true
      },
      new Error('Index file needs to have text/html as content type'))

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

    itMapsFile(mapper, 'an ACL file',
      { path: `${rootPath}space/.acl` },
      {
        url: 'http://localhost/space/.acl',
        contentType: 'text/turtle'
      })

    itMapsFile(mapper, 'an unknown file type',
      { path: `${rootPath}space/foo.bar` },
      {
        url: 'http://localhost/space/foo.bar',
        contentType: 'application/octet-stream'
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

    itMapsFile(mapper, 'an extensionless file with an uppercase extension',
      { path: `${rootPath}space/foo$.HTML` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'an extensionless file with a mixed-case extension',
      { path: `${rootPath}space/foo$.HtMl` },
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with disallowed IRI characters',
      { path: `${rootPath}space/foo bar bar.html` },
      {
        url: 'http://localhost/space/foo%20bar%20bar.html',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with even stranger disallowed IRI characters',
      { path: `${rootPath}space/Blog discovery for the future? · Issue #96 · scripting:Scripting-News · GitHub.pdf` },
      {
        url: 'http://localhost/space/Blog%20discovery%20for%20the%20future%3F%20%C2%B7%20Issue%20%2396%20%C2%B7%20scripting%3AScripting-News%20%C2%B7%20GitHub.pdf',
        contentType: 'application/pdf'
      })
  })

  describe('A ResourceMapper instance for a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl, rootPath, includeHost: true })

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

    itMapsUrl(mapper, 'a URL with a host specified as a URL object',
      {
        url: {
          hostname: 'example.org',
          path: '/space/foo.html'
        },
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}example.org/space/foo.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL with a host specified as an Express request object',
      {
        url: {
          hostname: 'example.org',
          pathname: '/space/foo.html'
        },
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
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for a multi-host setup with a subfolder root URL', () => {
    const rootUrl = 'https://localhost/foo/bar/'
    const mapper = new ResourceMapper({ rootUrl, rootPath, includeHost: true })

    itMapsFile(mapper, 'a file on a host',
      {
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'https://example.org/foo/bar/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTP host with non-default port', () => {
    const mapper = new ResourceMapper({ rootUrl: 'http://localhost:81/', rootPath })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://localhost:81/example.org/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTP host with non-default port in a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl: 'http://localhost:81/', rootPath, includeHost: true })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org:81/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTPS host with non-default port', () => {
    const mapper = new ResourceMapper({ rootUrl: 'https://localhost:81/', rootPath })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'https://localhost:81/example.org/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTPS host with non-default port in a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl: 'https://localhost:81/', rootPath, includeHost: true })

    itMapsFile(mapper, 'a file with the port',
      {
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'https://example.org:81/space/foo.html',
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTPS host with non-default port in a multi-host setup', () => {
    const mapper = new ResourceMapper({ rootUrl: 'https://localhost:81/', rootPath, includeHost: true })

    it('throws an error when there is an improper file path', () => {
      return expect(mapper.mapFileToUrl({
        path: `${rootPath}example.orgspace/foo.html`,
        hostname: 'example.org'
      })).to.be.rejectedWith(Error, 'Path must start with hostname (/example.org)')
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

  // Mock filesystem
  function mockReaddir () {
    mapper._readdir = async (path) => {
      expect(path.startsWith(`${rootPath}space/`)).to.equal(true)
      return files.map(f => f.replace(/.*\//, ''))
    }
  }

  // Set up positive test
  if (!(expected instanceof Error)) {
    it(`maps ${label}`, async () => {
      mockReaddir()
      const actual = await mapper.mapUrlToFile(options)
      expect(actual).to.deep.equal(expected)
    })
  // Set up error test
  } else {
    it(`does not map ${label}`, async () => {
      mockReaddir()
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
