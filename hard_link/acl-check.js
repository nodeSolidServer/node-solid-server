// Access control logic

const $rdf = require('rdflib')

const ACL = $rdf.Namespace('http://www.w3.org/ns/auth/acl#')
const FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/')
const VCARD = $rdf.Namespace('http://www.w3.org/2006/vcard/ns#')

let _logger

function publisherTrustedApp (kb, doc, aclDoc, modesRequired, origin, docAuths) {
  let app = $rdf.sym(origin)
  let appAuths = docAuths.filter(auth => kb.holds(auth, ACL('mode'), ACL('Control'), aclDoc))
  let owners = appAuths.map(auth => kb.each(auth, ACL('agent'))).flat() //  owners
  let relevant = owners.map(owner => kb.each(owner, ACL('trust'), null, owner.doc()).filter(
    ta => kb.holds(ta, ACL('trustedApp'), app, owner.doc()))).flat() // ta's
  let modesOK = relevant.map(ta => kb.each(ta, ACL('mode'))).flat().map(m => m.uri)
  let modesRequiredURIs = modesRequired.map(m => m.uri)
  modesRequiredURIs.every(uri => modesOK.includes(uri))
  // modesRequired.every(mode => appAuths.some(auth => kb.holds(auth, ACL('mode'), mode, aclDoc)))
}

function accessDenied (kb, doc, directory, aclDoc, agent, modesRequired, origin, trustedOrigins, originTrustedModes = []) {
  log(`accessDenied: checking access to ${doc} by ${agent} and origin ${origin}`)
  const modeURIorReasons = modesAllowed(kb, doc, directory, aclDoc, agent, origin, trustedOrigins, originTrustedModes)
  let ok = false
  log('accessDenied: modeURIorReasons: ' + JSON.stringify(Array.from(modeURIorReasons)))
  modesRequired.forEach(mode => {
    log(` checking ` + mode)
    if (modeURIorReasons.has(mode.uri)) {
      log('  Mode required and allowed:' + mode)
    } else if (mode.sameTerm(ACL('Append')) && modeURIorReasons.has(ACL('Write').uri)) {
      log('  Append required and Write allowed. OK')
    } else {
      ok = modeURIorReasons.values().next().value || 'Forbidden'
      if (ok.startsWith('http')) {
        // Then, the situation is that one mode has failed, the other
        // has passed, and we get URI of the one that passed, but that's not a good error
        ok = 'All Required Access Modes Not Granted'
      }
      log('  MODE REQUIRED NOT ALLOWED: ' + mode + ' Denying with ' + ok)
    }
  })
  return ok
}

async function getTrustedModesForOrigin (kb, doc, directory, aclDoc, origin, fetch) {
  // FIXME: this is duplicate code from the modesAllowed function, will refactor,
  // see https://github.com/solid/acl-check/issues/22
  var auths
  if (!directory) { // Normal case, ACL for a file
    auths = kb.each(null, ACL('accessTo'), doc, aclDoc)
    log(`   ${auths.length} direct authentications about ${doc}`)
  } else {
    auths = kb.each(null, ACL('default'), directory, null)
    auths = auths.concat(kb.each(null, ACL('defaultForNew'), directory, null)) // Deprecated but keep for ages
    log(`   ${auths.length}  default authentications about ${directory} in ${aclDoc}`)
  }
  const ownerAuths = auths.filter(auth => kb.holds(auth, ACL('mode'), ACL('Control'), aclDoc))
  const owners = ownerAuths.reduce((acc, auth) => acc.concat(kb.each(auth, ACL('agent'))), []) //  owners
  let result
  try {
    result = await Promise.all(owners.map(owner => {
      return fetch(owner).then(() => {
        const q = `
        SELECT ?mode WHERE {
          ${owner} ${ACL('trustedApp')} ?trustedOrigin.
          ?trustedOrigin  ${ACL('origin')} ${origin};
                          ${ACL('mode')} ?mode .
        }`
        return query(q, kb)
      }).catch(e => {
        log('could not fetch owner doc', owner, e.message)
      })
    }))
  } catch (e) {
    log('error checking owner profiles', e.message)
  }
  let trustedModes = []
  result.map(ownerResults => ownerResults.map(entry => {
    trustedModes.push(entry['?mode'])
  }))
  return Promise.resolve(trustedModes)
}

async function query (queryString, store) {
  return new Promise((resolve, reject) => {
    try {
      const query = $rdf.SPARQLToQuery(queryString, true, store)
      const results = []
      store.query(query, (result) => {
        results.push(result)
      }, null, () => {
        resolve(results)
      })
    } catch (err) {
      reject(err)
    }
  })
}

/* Function checkAccess
** @param kb A quadstore
** @param doc the resource (A named node) or directory for which ACL applies
*/
function checkAccess (kb, doc, directory, aclDoc, agent, modesRequired, origin, trustedOrigins, originTrustedModes) {
  return !accessDenied(kb, doc, directory, aclDoc, agent, modesRequired, origin, trustedOrigins, originTrustedModes)
}

function modesAllowed (kb, doc, directory, aclDoc, agent, origin, trustedOrigins, originTrustedModes = []) {
  var auths
  if (!directory) { // Normal case, ACL for a file
    auths = kb.each(null, ACL('accessTo'), doc, aclDoc)
    log(`   ${auths.length} direct authentications about ${doc}`)
  } else {
    auths = kb.each(null, ACL('default'), directory, null)
    auths = auths.concat(kb.each(null, ACL('defaultForNew'), directory, null)) // Deprecated but keep for ages
    log(`   ${auths.length}  default authentications about ${directory} in ${aclDoc}`)
  }
  if (origin && trustedOrigins && nodesIncludeNode(trustedOrigins, origin)) {
    log('Origin ' + origin + ' is trusted')
    origin = null // stop worrying about origin
    log(`  modesAllowed: Origin ${origin} is trusted.`)
  }

  function agentOrGroupOK (auth, agent) {
    log(`   Checking auth ${auth} with agent ${agent}`)
    if (!agent) {
      log(`    Agent or group: Fail: not public and not logged on.`)
      return false
    }
    if (kb.holds(auth, ACL('agentClass'), ACL('AuthenticatedAgent'), aclDoc)) {
      log('    AuthenticatedAgent: logged in, looks good')
      return true
    }
    if (kb.holds(auth, ACL('agent'), agent, aclDoc)) {
      log('    Agent explicitly authenticated.')
      return true
    }
    if (kb.each(auth, ACL('agentGroup'), null, aclDoc).some(
      group => kb.holds(group, VCARD('hasMember'), agent, group.doc()))) {
      log('    Agent is member of group which has access.')
      return true
    }
    log('    Agent or group access fails for this authentication.')
    return false
  } // Agent or group

  function originOK (auth, origin) {
    return kb.holds(auth, ACL('origin'), origin, aclDoc)
  }

  function agentAndAppFail (auth) {
    if (kb.holds(auth, ACL('agentClass'), FOAF('Agent'), aclDoc)) {
      log(`    Agent or group: Ok, its public.`)
      return false
    }
    if (!agentOrGroupOK(auth, agent)) {
      log('     The agent/group check fails')
      return 'User Unauthorized'
    }
    if (!origin) {
      log('     Origin check not needed: no origin.')
      return false
    }
    if (originTrustedModes && originTrustedModes.length > 0) {
      log(`     Origin might have access (${originTrustedModes.join(', ')})`)
      return false
    }
    if (originOK(auth, origin)) {
      log('     Origin check succeeded.')
      return false
    }
    log('     Origin check FAILED. Origin not trusted.')
    return 'Origin Unauthorized' // @@ look for other trusted apps
  }

  var modeURIorReasons = new Set()

  auths.forEach(auth => {
    let agentAndAppStatus = agentAndAppFail(auth)
    if (agentAndAppStatus) {
      log('      Check failed: ' + agentAndAppStatus)
      modeURIorReasons.add(agentAndAppStatus)
    } else {
      let modes = kb.each(auth, ACL('mode'), null, aclDoc)
      if (originTrustedModes && originTrustedModes.length > 0) {
        modes = modes.filter(mode => nodesIncludeNode(originTrustedModes, mode))
      }
      modes.forEach(mode => {
        log('      Mode allowed: ' + mode)
        modeURIorReasons.add(mode.uri)
      })
    }
  })
  return modeURIorReasons
}

function nodesIncludeNode (nodes, node) {
  return nodes.some(trustedOrigin => trustedOrigin.termType === node.termType && trustedOrigin.value === node.value)
}

function configureLogger (logger) {
  _logger = logger
}

function log (...msgs) {
  return (_logger || console.log).apply(_logger, msgs)
}

module.exports.accessDenied = accessDenied
module.exports.checkAccess = checkAccess
module.exports.configureLogger = configureLogger
module.exports.getTrustedModesForOrigin = getTrustedModesForOrigin
module.exports.log = log
module.exports.modesAllowed = modesAllowed
module.exports.publisherTrustedApp = publisherTrustedApp
