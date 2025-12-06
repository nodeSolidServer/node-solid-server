import $rdf from 'rdflib'

export default function parse (profile, graph, uri, mimeType, callback) {
  try {
    $rdf.parse(profile, graph, uri, mimeType)
    return callback(null, graph)
  } catch (e) {
    return callback(new Error('Could not load/parse profile data: ' + e))
  }
}
