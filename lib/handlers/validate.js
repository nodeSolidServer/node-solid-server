module.exports = handler

const bodyParser = require('body-parser')
const error = require('../http-error')
const LDP = require('../ldp')
const $rdf = require('rdflib')
const debug = require('../debug')

function handler (req, res, next) {
  bodyParser.text({ type: () => true })(req, res, () => validate(req, res, next))
}

function validate (req, res, next) {
  const contentType = req.get('content-type')
  if (!LDP.mimetypeIsRdf(contentType)) {
    return next()
  }

  const resourceGraph = $rdf.graph()
  const requestUri = `${req.protocol}//${req.get('host')}${req.originalUrl}`
  try {
    $rdf.parse(req.body, resourceGraph, requestUri, contentType)
  } catch (err) {
    debug.handlers('VALIDATE -- Error parsing data: ' + err)
    return next(error(400, 'Unable to parse the body of request'))
  }
  next()
}
