const CONTEXT_ACTIVITYSTREAMS = 'https://www.w3.org/ns/activitystreams'
const CONTEXT_NOTIFICATION = 'https://www.w3.org/ns/solid/notification/v1'
const CONTEXT_XML_SCHEMA = 'http://www.w3.org/2001/XMLSchema'

function generateJSONNotification ({
  activity: type,
  eventId: id,
  date: published,
  object,
  target,
  state = undefined
}) {
  return {
    published,
    type,
    id,
    object,
    ...(type === 'Add') && { target },
    ...(type === 'Remove') && { origin: target },
    ...(state) && { state }
  }
}

function generateTurtleNotification ({
  activity,
  eventId,
  date,
  object,
  target,
  state = undefined
}) {
  const stateLine = `\n    notify:state "${state}" ;`

  return `@prefix as: <${CONTEXT_ACTIVITYSTREAMS}#> .
@prefix notify: <${CONTEXT_NOTIFICATION}#> .
@prefix xsd: <${CONTEXT_XML_SCHEMA}#> .

<${eventId}> a as:${activity} ;${state && stateLine}
    as:object ${object} ;
    as:published "${date}"^^xsd:dateTime .`.replaceAll('\n', '\r\n')
}

function serializeToJSONLD (notification, isActivityStreams = false) {
  notification['@context'] = [CONTEXT_NOTIFICATION]
  if (!isActivityStreams) {
    notification['@context'].unshift(CONTEXT_ACTIVITYSTREAMS)
  }
  return JSON.stringify(notification, null, 2)
}

function rdfTemplate (props) {
  const { mediaType } = props
  if (mediaType[0] === 'application/activity+json' || (mediaType[0] === 'application/ld+json' && mediaType[1].get('profile')?.toLowerCase() === 'https://www.w3.org/ns/activitystreams')) {
    return serializeToJSONLD(generateJSONNotification(props), true)
  }

  if (mediaType[0] === 'application/ld+json') {
    return serializeToJSONLD(generateJSONNotification(props))
  }

  if (mediaType[0] === 'text/turtle') {
    return generateTurtleNotification(props)
  }
}

module.exports = rdfTemplate
