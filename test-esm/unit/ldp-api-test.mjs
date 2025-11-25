import { describe, it } from 'mocha'
import { assert } from 'chai'
import LDP from '../../lib/ldp.mjs'

describe('LDP ESM API', () => {
  it('exports expected methods', () => {
    const proto = LDP.prototype
    const expected = [
      'stat', 'readResource', 'readContainerMeta', 'listContainer', 'post', 'put', 'putResource', 'putValidateData',
      'delete', 'copy', 'patch', 'applyPatch', 'applyPatchUpdate', 'applyPatchInsertDelete', 'parseQuads',
      'getGraph', 'graph', 'getAvailableUrl', 'getTrustedOrigins', 'exists', 'get'
    ]
    expected.forEach(fn => {
      assert.strictEqual(typeof proto[fn], 'function', `Missing method ${fn}`)
    })
  })
})
