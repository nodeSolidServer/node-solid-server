import { posix as libPath } from 'path'
import { header as headerTemplate } from 'express-prep/templates'
import solidRDFTemplate from '../rdf-notification-template.mjs'
import debug from '../debug.mjs'
const debugPrep = debug.prep

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

function filterMillseconds (isoDate) {
  return `${isoDate.substring(0, 19)}${isoDate.substring(23)}`
}

function getDate (date) {
  if (date) {
    const eventDate = new Date(date)
    if (!isNaN(eventDate.valueOf())) {
      return filterMillseconds(eventDate.toISOString())
    }
  }
  const now = new Date()
  return filterMillseconds(now.toISOString())
}

export default function handler (req, res, next) {
  const { trigger, defaultNotification } = res.events.prep

  const { method, path } = req
  const { statusCode } = res
  const eventID = res.setEventID()
  const fullUrl = new URL(path, `${req.protocol}://${req.hostname}/`)

  // Date is a hack since node does not seem to provide access to send date.
  // Date needs to be shared with parent notification
  const eventDate = getDate(res._header.match(/^Date: (.*?)$/m)?.[1])

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
          const object = activity === 'Add'
            ? res.getHeader('location')
            : String(fullUrl)
          const target = activity === 'Add'
            ? String(fullUrl)
            : undefined
          if (ALLOWED_RDF_MIME_TYPES.includes(mediaType?.[0])) {
            return `${headerTemplate(negotiatedFields)}\r\n${solidRDFTemplate({
              activity,
              eventID,
              object,
              target,
              date: eventDate,
              mediaType
            })}`
          } else {
            return defaultNotification()
          }
        }
      })
    } catch (error) {
      debugPrep(`Failed to trigger notification on route ${fullUrl}`)
      // No special handling is necessary since the resource mutation was
      // already successful. The purpose of this block is to prevent Express
      // from triggering error handling middleware when notifications fail.
      // An error notification might be sent in the future.
    }
  }

  // Write a notification to parent container
  // POST in Solid creates a child resource
  const parent = getParent(path)
  if (parent && method !== 'POST') {
    res.setEventID({
      path: parent,
      id: eventID
    })
    const parentUrl = new URL(parent, fullUrl)
    try {
      trigger({
        path: parent,
        generateNotification (
          negotiatedFields
        ) {
          const mediaType = negotiatedFields['content-type']
          const activity = getParentActivity(method, statusCode)
          const object = activity === 'Update' ? String(parentUrl) : String(fullUrl)
          const target = activity === 'Update' ? undefined : String(parentUrl)
          if (ALLOWED_RDF_MIME_TYPES.includes(mediaType?.[0])) {
            return `${headerTemplate(negotiatedFields)}\r\n${solidRDFTemplate({
              activity,
              eventID,
              date: eventDate,
              object,
              target,
              mediaType
            })}`
          }
        }
      })
    } catch (error) {
      debugPrep(`Failed to trigger notification on parent route ${parentUrl}`)
      // No special handling is necessary since the resource mutation was
      // already successful. The purpose of this block is to prevent Express
      // from triggering error handling middleware when notifications fail.
      // An error notification might be sent in the future.
    }
  }

  next()
}