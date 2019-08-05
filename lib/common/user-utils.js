const $rdf = require('rdflib')

const SOLID = $rdf.Namespace('http://www.w3.org/ns/solid/terms#')
const VCARD = $rdf.Namespace('http://www.w3.org/2006/vcard/ns#')

module.exports.getName = getName
module.exports.getWebId = getWebId
module.exports.isValidUsername = isValidUsername

async function getName (webId, fetchGraph) {
  const graph = await fetchGraph(webId)
  const nameNode = graph.any($rdf.sym(webId), VCARD('fn'))
  return nameNode.value
}

async function getWebId (accountDirectory, accountUrl, suffixMeta, fetchData) {
  const metaFilePath = `${accountDirectory}/${suffixMeta}`
  const metaFileUri = `${accountUrl}${suffixMeta}`
  const metaData = await fetchData(metaFilePath)
  const metaGraph = $rdf.graph()
  $rdf.parse(metaData, metaGraph, metaFileUri, 'text/turtle')
  const webIdNode = metaGraph.any(undefined, SOLID('account'), $rdf.sym(accountUrl))
  return webIdNode.value
}

function isValidUsername (username) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(username)
}
