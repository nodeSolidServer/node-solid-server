module.exports = handler

const libPath = require('path/posix')

const headerTemplate = require('express-prep/templates').header
const solidRDFTemplate = require('../rdf-notification-template')

const ALLOWED_RDF_MIME_TYPES = [
  'application/ld+json',
  'application/activity+json',
  'text/turtle'
]

function getParent (path) {
  if (path === '' || path === '/') return
  const parent = libPath.dirname(path)
  return parent === '/' ? '/' : `${parent}/`
}

function getActivity (method, path) {
  if (method === 'DELETE') {
    return 'Delete'
  }
  if (method === 'POST' && path.endsWith('/')) {
    return 'Add'
  }
  return 'Update'
}

function getParentActivity (method, status) {
  if (method === 'DELETE') {
    return 'Remove'
  }
  if (status === 201) {
    return 'Add'
  }
  return 'Update'
}

function handler (req, res, next) {
  const { trigger, defaultNotification } = res.events.prep

  const { method, path } = req
  const { statusCode } = res
  const eventID = res.getHeader('event-id')
  const fullUrl = new URL(path, `${req.protocol}://${req.hostname}/`)

  // Date is a hack since node does not seem to provide access to send date.
  // Date needs to be shared with parent notification
  const eventDate = res._header.match(/^Date: (.*?)$/m)?.[1] ||
    new Date().toUTCString()

  // If the resource itself newly created,
  // it could not have been subscribed for notifications already
  if (!((method === 'PUT' || method === 'PATCH') && statusCode === 201)) {
    try {
      trigger({
        generateNotification (
          negotiatedFields
        ) {
          const mediaType = negotiatedFields['content-type']
          const activity = getActivity(method, path)
          const target = activity === 'Add'
            ? res.getHeader('location')
            : undefined
          if (ALLOWED_RDF_MIME_TYPES.includes(mediaType?.[0])) {
            return `${headerTemplate(negotiatedFields)}\r\n${solidRDFTemplate({
              activity,
              eventID,
              object: String(fullUrl),
              target,
              date: eventDate,
              // We use eTag as a proxy for state for now
              state: res.getHeader('ETag'),
              mediaType
            })}`
          } else {
            return defaultNotification({
              ...(res.method === 'POST') && { location: res.getHeader('Content-Location') }
            })
          }
        }
      })
    } catch (error) {
      // Failed notification message
    }
  }

  // Write a notification to parent container
  // POST in Solid creates a child resource
  const parent = getParent(path)
  if (parent && method !== 'POST') {
    try {
      const parentID = res.setEventID(parent)
      const parentUrl = new URL(parent, fullUrl)
      trigger({
        path: parent,
        generateNotification (
          negotiatedFields
        ) {
          const mediaType = negotiatedFields['content-type']
          const activity = getParentActivity(method, statusCode)
          const target = activity !== 'Update' ? String(fullUrl) : undefined
          if (ALLOWED_RDF_MIME_TYPES.includes(mediaType?.[0])) {
            return `${headerTemplate(negotiatedFields)}\r\n${solidRDFTemplate({
              activity,
              eventID: parentID,
              date: eventDate,
              object: String(parentUrl),
              target,
              eTag: undefined,
              mediaType
            })}`
          }
        }
      })
    } catch (error) {
      // Failed notification message
    }
  }

  next()
}
