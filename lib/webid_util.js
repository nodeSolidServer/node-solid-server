'use strict'

var request = require('request')
var url = require('url')
var $rdf = require('rdflib')
var debug = require('./debug').authentication

exports.createWebIdUtils = function () {
  return new WebIdUtils()
}

/**
 * A class wrapping utility routines for WebID handling.
 * @constructor
 */
function WebIdUtils () {
}

WebIdUtils.prototype = {
  constructor: WebIdUtils,

  getInfoForWebID: function (webId) {
    var me = this

    return new Promise(function resolver (resolve, reject) {
      Promise.resolve(true).then(function (result) {
        // It's assumed the delegate's public key has already been checked by webid.verify()
        // Fetch the delegate's WebID profile
        //    This shouldn't fail if the delegate's WebID has already been verified.
        return me.getProfile(webId)
      }).then(function (profile) {
        // profile ::= { profile: <string>, contentType: <string> }
        var uriObj = url.parse(webId)
        uriObj.hash = uriObj.search = uriObj.query = null
        var base = url.format(uriObj)
        const kb = $rdf.graph()

        $rdf.parse(profile.profile, kb, base, profile.content_type)

        return me.findInfoInWebIdProfile(kb, webId)
      }).then(function (val) {
        resolve(val)
      }).catch(function (e) {
        reject(e)
      })
    })
  },

  /**
   * Verifies a delegation claim.
   * Checks if the given delegate is authorized to authenticate or act on behalf of the given delegator.
   * @param {string} delegator - WebID of a 'principal' who allows a delegate to authenticate on their behalf
   * @param {string} - WebID of an agent that is assumed to be a delegate.
   * @param {object} - The delegate's certificate. This will already have been verified and used for
   *                   authenticating the delegate as part of setting up a WebID TLS connection.
   * @returns {promise}
   */
  verifyDelegation: function (delegator, delegate, delegateCertificate) {
    var me = this
    var delegatorBase = null
    var stmtOnBehalfOfExists = false
    var stmtDelegatesExists = false
    var stmtHasIdentityDelegateExists = false
    var delegatorHasDelegatePublicKey = false

    debug('WebIdUtils#verifyDelegation')

    return new Promise(function resolver (resolve, reject) {
      Promise.resolve(true).then(function (result) {
        // It's assumed the delegate's public key has already been checked by webid.verify()
        // Fetch the delegate's WebID profile
        //    This shouldn't fail if the delegate's WebID has already been verified.
        return me.getProfile(delegate)
      }).then(function (profile) {
        // Load the delegate's profile into store
        // profile ::= { profile: <string>, contentType: <string> }
        var uriObj = url.parse(delegate)
        uriObj.hash = uriObj.search = uriObj.query = null
        var delegateBase = url.format(uriObj)
        const kb = $rdf.graph()

        $rdf.parse(profile.profile, kb, delegateBase, profile.content_type)

        stmtOnBehalfOfExists = me.statementExists(
          kb,
          delegate,
          'http://www.openlinksw.com/schemas/cert#onBehalfOf',
          delegator
        )

        debug(`WebIdUtils#verifyDelegation: Statement <${delegate}> oplcert:onBehalfOf <${delegator}> exists?:`, stmtOnBehalfOfExists)

        if (!stmtOnBehalfOfExists) {
          throw (new Error(`Relation <${delegate}> oplcert:onBehalfOf <${delegator}> not found.`))
        }

        return me.getProfile(delegator)
      }).then(function (profile) {
        // Load the delegator's profile into store
        // profile ::= { profile: <string>, contentType: <string> }
        var uriObj = url.parse(delegator)
        uriObj.hash = uriObj.search = uriObj.query = null
        delegatorBase = url.format(uriObj)
        const kb = $rdf.graph()

        $rdf.parse(profile.profile, kb, delegatorBase, profile.content_type)

        stmtHasIdentityDelegateExists = me.statementExists(
          kb,
          delegator,
          'http://www.openlinksw.com/schemas/cert#hasIdentityDelegate',
          delegate
        )

        debug(`WebIdUtils#verifyDelegation: Statement <${delegator}> oplcert:hasIdentityDelegate <${delegate}> exists?:`, stmtHasIdentityDelegateExists)

        stmtDelegatesExists = me.statementExists(
          kb,
          delegator,
          'http://www.w3.org/ns/auth/acl#delegates',
          delegate
        )

        debug(`WebIdUtils#verifyDelegation: Statement <${delegator}> acl:delegates <${delegate}> exists: `, stmtDelegatesExists)

        return kb
      }).then(function (kb) {
        return me.findDelegatePublicKeyInDelegatorProfile(
          kb,
          delegate,
          delegateCertificate.modulus,
          delegateCertificate.exponent)
      }).then(function (delegatePublicKeyFromDelegatorProfile) {
        // logger.debug("WebIdUtils#verifyDelegation: delegate_public_key from delegator's profile: ", delegatePublicKeyFromDelegatorProfile);
        delegatorHasDelegatePublicKey = delegatePublicKeyFromDelegatorProfile !== null
        debug("WebIdUtils#verifyDelegation: Delegator's WebID profile contains the delegate's public key?: ", delegatorHasDelegatePublicKey)

        if ((stmtHasIdentityDelegateExists || stmtDelegatesExists) && delegatorHasDelegatePublicKey) {
          resolve(true)
        } else {
          if (!delegatorHasDelegatePublicKey) {
            throw (new Error(`${delegatorBase} does not contain the public key of <${delegate}> .`))
          } else {
            var errMsg = `${delegatorBase} contains neither <${delegator}> acl:delegates <${delegate}> `
            errMsg += `nor <${delegator}> oplcert:hasIdentityDelegate <${delegate}>`
            throw (new Error(errMsg))
          }
        }
      }).catch(function (e) {
        debug('WebIdUtils#verifyDelegation: ', e)
        reject(e)
      })
    })
  },

  /**
   * Given a WebID, retrieves the WebID profile.
   * @returns {object} - An object with properties profile and contentType.
   */
  getProfile: function (webId) {
    return new Promise(function (resolve, reject) {
      var uri = url.parse(webId)
      var options = {
        url: uri,
        method: 'GET',
        headers: {
          'Accept': 'text/turtle, application/ld+json'
        }
      }

      request(options, function (err, res, body) {
        if (err) {
          return reject(new Error('Failed to fetch profile from ' + uri.href + ': ' + err))
        }

        if (res.statusCode !== 200) {
          return reject(new Error('Failed to retrieve WebID from ' + uri.href + ': HTTP status: ' + res.statusCode))
        }

        resolve({profile: body, contentType: res.headers['content-type']})
      })
    })
  },

  statementExists: function (kb, subject, predicate, object) {
    var s = kb.sym(subject)
    var p = kb.sym(predicate)
    var o = kb.sym(object)
    var st = kb.statementsMatching(s, p, o)
    return st.length > 0
  }, // statementExists

  findDelegatePublicKeyInDelegatorProfile: function (kb, delegate, delegateModulus, delegateExponent) {
    return new Promise(function (resolve, reject) {
      var rc = []
      delegateModulus = delegateModulus.toLowerCase()
      delegateExponent = delegateExponent.toLowerCase()
      var sparql = `
        PREFIX cert: <http://www.w3.org/ns/auth/cert#> 
        SELECT ?exponent ?modulus
        WHERE {
          <${delegate}> cert:key ?key .
          ?key cert:exponent ?exponent .
          ?key cert:modulus ?modulus .
        }
        `

      var onresult = function (result) {
        if (result) {
          var exponent = result['?exponent'].value
          var modulus = result['?modulus'].value
          rc.push({exponent, modulus})
        }
      }

      var onDone = function () {
        var i
        var publicKey = null

        for (i = 0; i < rc.length; i++) {
          if (rc[i].modulus.toLowerCase() === delegateModulus &&
              parseInt(rc[i].exponent) === parseInt(delegateExponent)) {
            publicKey = { exponent: delegateExponent, modulus: delegateModulus }
          }
        }
        resolve(publicKey)
      }

      const query = $rdf.SPARQLToQuery(sparql, false, kb)
      kb.query(query, onresult, undefined, onDone)
    })
  },

  findInfoInWebIdProfile: function (kb, webId) {
    var rc
    var name = null
    var webIdUri = kb.sym(webId)

    rc = kb.any(webIdUri, kb.sym('http://schema.org/name'))
    if (rc) {
      name = rc.value
    } else {
      rc = kb.any(webIdUri, kb.sym('http://xmlns.com/foaf/0.1/name'))
      if (rc) {
        name = rc.value
      } else {
        rc = kb.any(webIdUri, kb.sym('http://www.w3.org/2000/01/rdf-schema#label'))
        if (rc) {
          name = rc.value
        } else {
          rc = kb.any(webIdUri, kb.sym('http://www.w3.org/2004/02/skos/core#prefLabel'))
          if (rc) {
            name = rc.value
          } else {
            rc = kb.any(webIdUri, kb.sym('http://www.w3.org/2004/02/skos/core#altLabel'))
            if (rc) {
              name = rc.value
            }
          }
        }
      }
    }
    return {name}
  }

}
