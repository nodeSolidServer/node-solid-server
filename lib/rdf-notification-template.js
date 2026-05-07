import { v4 as uuid } from 'uuid'

const CONTEXT_ACTIVITYSTREAMS = 'https://www.w3.org/ns/activitystreams'
const CONTEXT_NOTIFICATION = 'https://www.w3.org/ns/solid/notification/v1'
const CONTEXT_XML_SCHEMA = 'http://www.w3.org/2001/XMLSchema'

function generateJSONNotification ({
  activity: type,
  eventID,
  date: published,
  object,
  target,
  state = undefined
}) {
  return {
    published,
    type,
    id: `urn:uuid:${uuid()}`,
    ...(eventID) && { state: eventID },
    object,
    ...(type === 'Add') && { target },
    ...(type === 'Remove') && { origin: target }
  }
}

function generateTurtleNotification ({
  activity,
  eventID,
  date,
  object,
  target
}) {
  let targetLine = ''
  let stateLine = ''

  if (activity === 'Add') {
    targetLine = `\n    as:target <${target}> ;`
  }
  if (activity === 'Remove') {
    targetLine = `\n    as:origin <${target}> ;`
  }
  if (eventID) {
    stateLine = `\n    notify:state "${eventID}" ;`
  }

  return `@prefix as: <${CONTEXT_ACTIVITYSTREAMS}#> .
@prefix notify: <${CONTEXT_NOTIFICATION}#> .
@prefix xsd: <${CONTEXT_XML_SCHEMA}#> .

<urn:uuid:${uuid.v4()}> a as:${activity} ;
    as:object <${object}> ;${targetLine}${stateLine}
    as:published "${date}"^^xsd:dateTime .`.replaceAll('\n', '\r\n')
}

function serializeToJSONLD (notification, isActivityStreams = false) {
  notification['@context'] = [CONTEXT_NOTIFICATION]
  if (!isActivityStreams) {
    notification['@context'].unshift(CONTEXT_ACTIVITYSTREAMS)
  }
  return JSON.stringify(notification, null, 2)
}

export default function rdfTemplate (props) {
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
