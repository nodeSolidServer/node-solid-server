const $rdf = require('rdflib')

const LDP = require('../ldp')

const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')

module.exports.getWebId = getWebId
module.exports.isValidUsername = isValidUsername

async function getWebId (accountDirectory, accountUrl, options = {}) {
  if (!options.ldp && !options.config) {
    throw new Error('Require ldp or config set in options for getWebId')
  }
  const ldp = options.ldp || new LDP(options.config)
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
