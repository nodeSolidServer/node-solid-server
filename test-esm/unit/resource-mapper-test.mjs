import { describe, it } from 'mocha'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { expect } = chai
chai.use(chaiAsPromised)

// Import CommonJS modules
const ResourceMapper = require('../../lib/resource-mapper')

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
    files = undefined  // No files array means don't mock filesystem
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