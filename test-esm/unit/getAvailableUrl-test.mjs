import { strict as assert } from 'assert'
import LDP from '../../lib/ldp.mjs'

export async function test_noExistingResource() {
  const rm = {
    resolveUrl: (hostname, containerURI) => `https://${hostname}/root${containerURI}/`,
    mapUrlToFile: async () => { throw new Error('Not found') }
  }
  const ldp = new LDP({ resourceMapper: rm })
  const url = await ldp.getAvailableUrl('host.test', '/container', { slug: 'name.txt', extension: '', container: false })
  assert.equal(url, 'https://host.test/root/container/name.txt')
}

export async function test_existingResourcePrefixes() {
  let called = 0
  const rm = {
    resolveUrl: (hostname, containerURI) => `https://${hostname}/root${containerURI}/`,
    mapUrlToFile: async () => {
      called += 1
      // First call indicates file exists (resolve), so return some object
      if (called === 1) return { path: '/some/path' }
      // Subsequent calls simulate not found
      throw new Error('Not found')
    }
  }
  const ldp = new LDP({ resourceMapper: rm })
  const url = await ldp.getAvailableUrl('host.test', '/container', { slug: 'name.txt', extension: '', container: false })
  // Should contain a uuid-prefix before name.txt, i.e. -name.txt
  assert.ok(url.endsWith('-name.txt') || url.includes('-name.txt'))
}
