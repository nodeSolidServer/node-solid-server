const $rdf = require('rdflib')

const LDP = require('../ldp')

const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')
const VCARD = $rdf.Namespace('http://www.w3.org/2006/vcard/ns#')

module.exports.getName = getName
module.exports.getWebId = getWebId
module.exports.isValidUsername = isValidUsername

async function getName (webId, options = {}) {
  const ldp = setupLDP(options)
  const graph = await ldp.fetchGraph(webId)
  const nameNode = graph.any($rdf.sym(webId), VCARD('fn'))
  return nameNode.value
}

async function getWebId (accountDirectory, accountUrl, options = {}) {
  const ldp = setupLDP(options)
  const metaFileUri = `${accountUrl}/${ldp.suffixMeta}`
  const metaData = await ldp.readContainerMeta(accountDirectory)
  const metaGraph = $rdf.graph()
  $rdf.parse(metaData, metaGraph, metaFileUri, 'text/turtle')
  const webIdNode = metaGraph.any(undefined, SOLID('account'), $rdf.sym(accountUrl))
  return webIdNode.value
}

function isValidUsername (username) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(username)
}

function setupLDP (options) {
  if (!options.ldp && !options.config) {
    throw new Error('Require ldp or config set in options for getWebId')
  }
  return options.ldp || new LDP(options.config)
}
