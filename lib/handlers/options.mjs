/* eslint-disable node/no-deprecated-api */

import { addLink } from '../header.mjs'
import url from 'url'

export default function handler (req, res, next) {
  linkServiceEndpoint(req, res)
  linkAuthProvider(req, res)
  linkAcceptEndpoint(res)

  res.status(204)

  next()
}

function linkAuthProvider (req, res) {
  const locals = req.app.locals
  if (locals.authMethod === 'oidc') {
    const oidcProviderUri = locals.host.serverUri
    addLink(res, oidcProviderUri, 'http://openid.net/specs/connect/1.0/issuer')
  }
}

function linkServiceEndpoint (req, res) {
  const serviceEndpoint = url.resolve(req.app.locals.ldp.resourceMapper.resolveUrl(req.hostname, req.path), '.well-known/solid')
  addLink(res, serviceEndpoint, 'service')
}

function linkAcceptEndpoint (res) {
  res.header('Accept-Patch', 'text/n3, application/sparql-update, application/sparql-update-single-match')
  res.header('Accept-Post', '*/*')
  res.header('Accept-Put', '*/*')
}