import { expect } from 'chai'
import get from '../../lib/webid/lib/get.mjs'

describe('webid get()', () => {
  const originalFetch = global.fetch
  const originalTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED

  function callGet (webid) {
    return new Promise((resolve, reject) => {
      get(webid, (err, body, contentType) => {
        if (err) {
          reject(err)
          return
        }
        resolve({ body, contentType })
      })
    })
  }

  afterEach(() => {
    global.fetch = originalFetch
    if (originalTlsSetting === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTlsSetting
    }
  })

  it('uses an insecure dispatcher for https fetches when TLS verification is disabled', async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    global.fetch = async (url, options) => {
      expect(url).to.equal('https://example.com/profile/card#me')
      expect(options.method).to.equal('GET')
      expect(options.headers.Accept).to.equal('text/turtle, application/ld+json')
      expect(options.dispatcher).to.exist

      return {
        ok: true,
        headers: {
          get: () => 'text/turtle'
        },
        text: async () => '@prefix ex: <http://example.com/> .'
      }
    }

    const { body, contentType } = await callGet('https://example.com/profile/card#me')
    expect(contentType).to.equal('text/turtle')
    expect(body).to.include('@prefix ex:')
  })

  it('does not use an insecure dispatcher when TLS verification is enabled', async () => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED

    global.fetch = async (url, options) => {
      expect(options.dispatcher).to.equal(undefined)

      return {
        ok: true,
        headers: {
          get: () => 'text/turtle'
        },
        text: async () => 'ok'
      }
    }

    const { body } = await callGet('https://example.com/profile/card#me')
    expect(body).to.equal('ok')
  })
})
