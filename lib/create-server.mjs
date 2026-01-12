import express from 'express'
import fs from 'fs'
import https from 'https'
import http from 'http'
import SolidWs from 'solid-ws'
import globalTunnel from 'global-tunnel-ng'
import debug from './debug.mjs'
import createApp from './create-app.mjs'
import ACLChecker from './acl-checker.mjs'
import url from 'url'

function createServer (argv, app) {
  argv = argv || {}
  app = app || express()
  const ldpApp = createApp(argv)
  const ldp = ldpApp.locals.ldp || {}
  let mount = argv.mount || '/'
  // Removing ending '/'
  if (mount.length > 1 &&
    mount[mount.length - 1] === '/') {
    mount = mount.slice(0, -1)
  }
  app.use(mount, ldpApp)
  debug.settings('Base URL (--mount): ' + mount)
  if (argv.idp) {
    console.warn('The idp configuration option has been renamed to multiuser.')
    argv.multiuser = argv.idp
    delete argv.idp
  }

  if (argv.httpProxy) {
    globalTunnel.initialize(argv.httpProxy)
  }

  let server
  const needsTLS = argv.sslKey || argv.sslCert
  if (!needsTLS) {
    server = http.createServer(app)
  } else {
    debug.settings('SSL Private Key path: ' + argv.sslKey)
    debug.settings('SSL Certificate path: ' + argv.sslCert)

    if (!argv.sslCert && !argv.sslKey) {
      throw new Error('Missing SSL cert and SSL key to enable WebIDs')
    }

    if (!argv.sslKey && argv.sslCert) {
      throw new Error('Missing path for SSL key')
    }

    if (!argv.sslCert && argv.sslKey) {
      throw new Error('Missing path for SSL cert')
    }

    let key
    try {
      key = fs.readFileSync(argv.sslKey)
    } catch (e) {
      throw new Error('Can\'t find SSL key in ' + argv.sslKey)
    }

    let cert
    try {
      cert = fs.readFileSync(argv.sslCert)
    } catch (e) {
      throw new Error('Can\'t find SSL cert in ' + argv.sslCert)
    }

    const credentials = Object.assign({
      key: key,
      cert: cert
    }, argv)

    if (ldp.webid && ldp.auth === 'tls') {
      credentials.requestCert = true
    }

    server = https.createServer(credentials, app)
  }

  // Look for port or list of ports to redirect to argv.port
  if ('redirectHttpFrom' in argv) {
    const redirectHttpFroms = argv.redirectHttpFrom.constructor === Array
      ? argv.redirectHttpFrom
      : [argv.redirectHttpFrom]
    const portStr = argv.port === 443 ? '' : ':' + argv.port
    redirectHttpFroms.forEach(redirectHttpFrom => {
      debug.settings('will redirect from port ' + redirectHttpFrom + ' to port ' + argv.port)
      const redirectingServer = express()
      redirectingServer.get('*', function (req, res) {
        const host = req.headers.host.split(':') // ignore port
        debug.server(host, '=> https://' + host + portStr + req.url)
        res.redirect('https://' + host + portStr + req.url)
      })
      redirectingServer.listen(redirectHttpFrom)
    })
  }

  // Setup Express app
  if (ldp.live) {
    // Get reference to session middleware for WebSocket upgrade parsing
    // The session middleware is stored on the Express app
    const sessionParser = ldpApp._router.stack.find(
      layer => layer.name === 'session' && layer.handle
    )?.handle

    // Extract WebID during WebSocket upgrade (before connection established)
    server.on('upgrade', function (request, socket, head) {
      // Create an authentication promise that resolves when auth is complete
      request.authPromise = (async () => {
        try {
          let webId = null

          // Parse session cookie manually (session middleware doesn't run on upgrade)
          if (sessionParser) {
          // Create a minimal response object for session parser
            const res = {
              getHeader: () => {},
              setHeader: () => {},
              end: () => {}
            }

            await new Promise((resolve, reject) => {
              sessionParser(request, res, (err) => {
                if (err) reject(err)
                else resolve()
              })
            })

            // Now req.session is available if cookie was valid
            if (request.session && request.session.userId) {
              webId = request.session.userId
              debug.ACL(`WebSocket upgrade: Found WebID in session: ${webId}`)
            }
          } else {
            debug.ACL('WebSocket upgrade: Session parser not found')
          }

          // Check Authorization header for Bearer token (alternative auth method)
          if (!webId && request.headers.authorization) {
            const authHeader = request.headers.authorization
            debug.ACL(`WebSocket upgrade: Found Authorization header: ${authHeader.substring(0, 20)}...`)
            if (authHeader.startsWith('Bearer ')) {
              try {
                const oidc = ldpApp.locals.oidc
                if (oidc && oidc.rs) {
                  debug.ACL('WebSocket upgrade: Attempting Bearer token authentication')
                  // Authenticate using OIDC Resource Server
                  await new Promise((resolve, reject) => {
                    const res = {
                      getHeader: () => {},
                      setHeader: () => {},
                      status: () => res,
                      send: () => {},
                      end: () => {}
                    }

                    const tokenTypesSupported = ldp.tokenTypesSupported || ['DPoP', 'Bearer']
                    debug.ACL(`WebSocket upgrade: Token types supported: ${JSON.stringify(tokenTypesSupported)}`)
                    oidc.rs.authenticate({ tokenTypesSupported })(request, res, async (err) => {
                      if (err) {
                        debug.ACL(`WebSocket upgrade: Bearer token authentication failed: ${err.message}`)
                        debug.ACL(`WebSocket upgrade: Error stack: ${err.stack}`)
                        // Don't reject - just continue without auth
                        resolve()
                      } else {
                        debug.ACL(`WebSocket upgrade: Bearer token authenticated, claims: ${JSON.stringify(request.claims)}`)
                        // Extract WebID from token claims
                        try {
                          const tokenWebId = await oidc.webIdFromClaims(request.claims)
                          debug.ACL(`WebSocket upgrade: webIdFromClaims returned: ${tokenWebId}`)
                          if (tokenWebId) {
                            webId = tokenWebId
                            debug.ACL(`WebSocket upgrade: Found WebID in Bearer token: ${webId}`)
                          } else {
                            debug.ACL('WebSocket upgrade: webIdFromClaims returned null/undefined')
                          }
                          resolve()
                        } catch (claimErr) {
                          debug.ACL(`WebSocket upgrade: Could not extract WebID from claims: ${claimErr.message}`)
                          debug.ACL(`WebSocket upgrade: Claim error stack: ${claimErr.stack}`)
                          // Don't reject - just continue without auth
                          resolve()
                        }
                      }
                    })
                  })
                } else {
                  debug.ACL('WebSocket upgrade: OIDC not initialized, cannot verify Bearer token')
                }
              } catch (tokenErr) {
                debug.ACL(`WebSocket upgrade: Bearer token verification error: ${tokenErr.message}`)
              // Continue without auth
              }
            }
          }

          // Store WebID on request for use in authorizeSubscription callback
          request.webId = webId
          debug.ACL(`WebSocket upgrade: ${webId ? 'Authenticated as ' + webId : 'Anonymous connection'}`)
          debug.ACL(`WebSocket upgrade: Set request.webId to ${request.webId}`)
          debug.ACL(`WebSocket upgrade: request object keys: ${Object.keys(request).join(', ')}`)
        } catch (error) {
          debug.ACL(`WebSocket upgrade error: ${error.message}`)
          // Don't block the upgrade on errors, just proceed without auth
          request.webId = null
        }
      })()
    })

    // Authorization callback for WebSocket subscriptions
    // Checks ACL read permission before allowing subscription
    const authorizeSubscription = async function (iri, req, callback) {
      // Wait for authentication to complete
      if (req.authPromise) {
        try {
          await req.authPromise
        } catch (err) {
          debug.ACL(`WebSocket authorization: auth promise failed: ${err.message}`)
        }
      }

      // Extract userId from the request (set during upgrade event)
      const userId = req.webId || null
      debug.ACL(`WebSocket authorization callback: iri=${iri}, userId=${userId}, req.webId=${req.webId}`)

      try {
        // Security: Validate URL length to prevent DoS
        const MAX_URL_LENGTH = 2048
        if (iri.length > MAX_URL_LENGTH) {
          debug.ACL(`WebSocket subscription DENIED: URL too long (${iri.length} > ${MAX_URL_LENGTH})`)
          return callback(null, false)
        }

        const parsedUrl = url.parse(iri)
        const resourcePath = decodeURIComponent(parsedUrl.pathname)
        const hostname = parsedUrl.hostname || req.headers.host?.split(':')[0]
        const rootUrl = ldp.resourceMapper.resolveUrl(hostname)
        const resourceUrl = rootUrl + resourcePath

        // Security: Prevent SSRF - only allow subscriptions to this server
        // Check if requested hostname matches the request's host
        const requestHost = req.headers.host?.split(':')[0]
        if (parsedUrl.hostname && parsedUrl.hostname !== requestHost && parsedUrl.hostname !== hostname) {
          debug.ACL(`WebSocket subscription DENIED: Cross-origin subscription attempt (${parsedUrl.hostname} !== ${requestHost})`)
          return callback(null, false)
        }

        // Create a minimal request-like object for ACLChecker
        const pseudoReq = {
          hostname,
          path: resourcePath,
          headers: req.headers,
          get: (header) => {
            const headerLower = header.toLowerCase()
            return req.headers[headerLower]
          }
        }

        const aclChecker = ACLChecker.createFromLDPAndRequest(resourceUrl, ldp, pseudoReq)

        aclChecker.can(userId, 'Read')
          .then(allowed => {
            debug.ACL(`WebSocket subscription ${allowed ? 'ALLOWED' : 'DENIED'} for ${iri} (user: ${userId || 'anonymous'})`)
            callback(null, allowed)
          })
          .catch(err => {
            debug.ACL(`WebSocket ACL check error for ${iri}: ${err.message}`)
            callback(null, false)
          })
      } catch (err) {
        debug.ACL(`WebSocket authorization error: ${err.message}`)
        callback(null, false)
      }
    }

    const solidWs = SolidWs(server, ldpApp, { authorize: authorizeSubscription })
    ldpApp.locals.ldp.live = solidWs.publish.bind(solidWs)
  }

  // Wrap server.listen() to ensure async initialization completes after server starts
  const originalListen = server.listen.bind(server)
  server.listen = function (...args) {
    // Start listening first
    originalListen(...args)

    // Then run async initialization (if needed)
    if (ldpApp.locals.initFunction) {
      const initFunction = ldpApp.locals.initFunction
      delete ldpApp.locals.initFunction

      // Run initialization after server is listening
      initFunction()
        .catch(err => {
          console.error('Initialization error:', err)
          server.emit('error', err)
        })
    }

    return server
  }

  return server
}

export default createServer
