import { describe, it } from 'mocha'
import { assert } from 'chai'
import LDP from '../../lib/ldp.mjs'

describe('LDP.getTrustedOrigins', () => {
  it('includes resourceMapper.resolveUrl(hostname), trustedOrigins and serverUri when multiuser', () => {
    const rm = { resolveUrl: (hostname) => `https://${hostname}/` }
    const ldp = new LDP({ resourceMapper: rm, trustedOrigins: ['https://trusted.example/'], multiuser: true, serverUri: 'https://server.example/' })
    const res = ldp.getTrustedOrigins({ hostname: 'host.test' })
    assert.includeMembers(res, ['https://host.test/', 'https://trusted.example/', 'https://server.example/'])
  })

  it('omits serverUri when not multiuser', () => {
    const rm = { resolveUrl: (hostname) => `https://${hostname}/` }
    const ldp = new LDP({ resourceMapper: rm, trustedOrigins: ['https://trusted.example/'], multiuser: false, serverUri: 'https://server.example/' })
    const res = ldp.getTrustedOrigins({ hostname: 'host.test' })
    assert.includeMembers(res, ['https://host.test/', 'https://trusted.example/'])
    assert.notInclude(res, 'https://server.example/')
  })
})
