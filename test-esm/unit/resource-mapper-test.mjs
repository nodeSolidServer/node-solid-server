import { describe, it } from 'mocha'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

// Import CommonJS modules
// const ResourceMapper = require('../../lib/resource-mapper')
import ResourceMapper from '../../lib/resource-mapper.mjs'
// import { createRequire } from 'module'

// const require = createRequire(import.meta.url)
const { expect } = chai
chai.use(chaiAsPromised)

const rootUrl = 'http://localhost/'
const rootPath = '/var/www/folder/'

// Helper functions for testing
function asserter (fn) {
  return function (mapper, label, ...args) {
    return fn(it, mapper, label, ...args)
  }
}

function mapsUrl (it, mapper, label, options, files, expected) {
  // Shift parameters if necessary
  if (!expected) {
    expected = files
    files = undefined // No files array means don't mock filesystem
  }

  // Mock filesystem only if files array is provided
  function mockReaddir () {
    if (files !== undefined) {
      mapper._readdir = async (path) => {
        // For the tests to work, we need to check if the path is in the expected range
        expect(path.startsWith(rootPath)).to.equal(true)

        if (!files.length) {
          // When empty files array is provided, simulate directory not found
          throw new Error(`${path} Resource not found`)
        }

        // Return just the filenames (not full paths) that are in the requested directory
        // Normalize the path to handle different slash directions
        const requestedDir = path.replace(/\\/g, '/')

        const matchingFiles = files
          .filter(f => {
            const normalizedFile = f.replace(/\\/g, '/')
            const fileDir = normalizedFile.substring(0, normalizedFile.lastIndexOf('/') + 1)
            return fileDir === requestedDir
          })
          .map(f => {
            const normalizedFile = f.replace(/\\/g, '/')
            const filename = normalizedFile.substring(normalizedFile.lastIndexOf('/') + 1)
            return filename
          })
          .filter(f => f) // Only non-empty filenames

        return matchingFiles
      }
    }
    // If no files array, don't mock - let it use real filesystem or default behavior
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
        url: 'http://localhost/space/%20foo .html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/ foo .html`,
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

    itMapsUrl(mapper, "a URL that doesn't have an extension but should be saved as HTML",
      {
        url: 'http://localhost/space/foo',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'a URL that already has the right extension',
      {
        url: 'http://localhost/space/foo.html',
        contentType: 'text/html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })

    // GET base cases

    itMapsUrl(mapper, 'a URL with a proper extension',
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

    itMapsUrl(mapper, "a URL that doesn't have an extension",
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.html`,
        `${rootPath}space/foo$.json`,
        `${rootPath}space/foo$.md`,
        `${rootPath}space/foo$.rdf`,
        `${rootPath}space/foo$.xml`,
        `${rootPath}space/foo$.txt`,
        `${rootPath}space/foo$.ttl`,
        `${rootPath}space/foo$.jsonld`,
        `${rootPath}space/foo`
      ],
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, "a URL that doesn't have an extension but has multiple possible files",
      {
        url: 'http://localhost/space/foo'
      },
      [
        `${rootPath}space/foo$.html`,
        `${rootPath}space/foo$.ttl`
      ],
      {
        path: `${rootPath}space/foo$.html`,
        contentType: 'text/html'
      })

    // Test with various content types
    const contentTypes = [
      ['text/turtle', 'ttl'],
      ['application/ld+json', 'jsonld'],
      ['application/json', 'json'],
      ['text/plain', 'txt'],
      ['text/markdown', 'md'],
      ['application/rdf+xml', 'rdf'],
      ['application/xml', 'xml']
    ]

    contentTypes.forEach(([contentType, extension]) => {
      itMapsUrl(mapper, `a URL for ${contentType}`,
        {
          url: `http://localhost/space/foo.${extension}`,
          contentType,
          createIfNotExists: true
        },
        {
          path: `${rootPath}space/foo.${extension}`,
          contentType
        })
    })

    // Directory mapping tests
    itMapsUrl(mapper, 'a directory URL',
      {
        url: 'http://localhost/space/'
      },
      [
        `${rootPath}space/index.html`
      ],
      {
        path: `${rootPath}space/index.html`,
        contentType: 'text/html'
      })

    itMapsUrl(mapper, 'the root directory URL',
      {
        url: 'http://localhost/'
      },
      [
        `${rootPath}index.html`
      ],
      {
        path: `${rootPath}index.html`,
        contentType: 'text/html'
      })

    // Test file to URL mapping
    itMapsFile(mapper, 'a regular file path',
      {
        path: `${rootPath}space/foo.html`,
        hostname: 'localhost'
      },
      {
        url: 'http://localhost/space/foo.html',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a directory path',
      {
        path: `${rootPath}space/`,
        hostname: 'localhost'
      },
      {
        url: 'http://localhost/space/',
        contentType: 'text/turtle'
      })
    // --- Additional error and edge-case tests for full parity ---
    itMapsUrl(mapper, 'a URL without content type',
      {
        url: 'http://localhost/space/foo.html',
        createIfNotExists: true
      },
      {
        path: `${rootPath}space/foo.html$.unknown`,
        contentType: 'application/octet-stream'
      })

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

    itMapsUrl(mapper, 'a URL ending with a slash for text/turtle',
      {
        url: 'http://localhost/space/',
        contentType: 'text/turtle',
        createIfNotExists: true
      },
      new Error('Index file needs to have text/html as content type'))

    itMapsUrl(mapper, 'a URL of a non-existent folder',
      {
        url: 'http://localhost/space/foo/'
      },
      [],
      new Error('/space/foo/ Resource not found'))

    itMapsUrl(mapper, 'a URL of a non-existent file',
      {
        url: 'http://localhost/space/foo.html'
      },
      [],
      new Error('/space/foo.html Resource not found'))

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
      { path: `${rootPath}space/%2ffoo%2F$.bar` },
      {
        url: 'http://localhost/space/%2ffoo%2F',
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

    itMapsFile(mapper, 'a file with %encoded /',
      { path: `${rootPath}%2Fspace/%25252Ffoo%2f.html` },
      {
        url: 'http://localhost/%2Fspace/%25252Ffoo%2f.html',
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file with even stranger disallowed IRI characters',
      { path: `${rootPath}%2fspace%2F/Blog discovery for the future? · Issue #96 · scripting:Scripting-News · GitHub.pdf` },
      {
        url: 'http://localhost/%2fspace%2F/Blog%20discovery%20for%20the%20future%3F%20%C2%B7%20Issue%20%2396%20%C2%B7%20scripting%3AScripting-News%20%C2%B7%20GitHub.pdf',
        contentType: 'application/pdf'
      })
  })

  describe('A ResourceMapper instance for a multi-host setup', () => {
    const mapper = new ResourceMapper({
      rootUrl,
      rootPath,
      includeHost: true
    })

    itMapsUrl(mapper, 'a URL with host in path',
      {
        url: 'http://example.org/space/foo.html'
      },
      [
        `${rootPath}example.org/space/foo.html`
      ],
      {
        path: `${rootPath}example.org/space/foo.html`,
        contentType: 'text/html'
      })

    itMapsFile(mapper, 'a file path with host directory',
      {
        path: `${rootPath}example.org/space/foo.html`,
        hostname: 'example.org'
      },
      {
        url: 'http://example.org/space/foo.html',
        contentType: 'text/html'
      })
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

  // Additional test cases for various port configurations
  describe('A ResourceMapper instance for an HTTP host with non-default port', () => {
    const mapper = new ResourceMapper({
      rootUrl: 'http://localhost:8080/',
      rootPath,
      includeHost: false
    })

    itMapsUrl(mapper, 'a URL with non-default HTTP port',
      {
        url: 'http://localhost:8080/space/foo.html'
      },
      [
        `${rootPath}space/foo.html`
      ],
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })
  })

  describe('A ResourceMapper instance for an HTTPS host with non-default port', () => {
    const mapper = new ResourceMapper({
      rootUrl: 'https://localhost:8443/',
      rootPath,
      includeHost: false
    })

    itMapsUrl(mapper, 'a URL with non-default HTTPS port',
      {
        url: 'https://localhost:8443/space/foo.html'
      },
      [
        `${rootPath}space/foo.html`
      ],
      {
        path: `${rootPath}space/foo.html`,
        contentType: 'text/html'
      })
  })
})
