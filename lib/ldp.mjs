/* eslint-disable node/no-deprecated-api */

import { join, dirname } from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const intoStream = require('into-stream')
import url from 'url'
import fs from 'fs'
const $rdf = require('rdflib')
const { mkdirp } = require('fs-extra')
const uuid = require('uuid')
import debug from './debug.mjs'
import error from './http-error.mjs'
import { stringToStream, serialize, overQuota, getContentType, parse } from './utils.mjs'
const extend = require('extend')
const rimraf = require('rimraf')
import * as ldpContainer from './ldp-container.mjs'
const fetch = require('node-fetch')
import { promisify } from 'util'
import URL from 'url'
import withLock from './lock.mjs'
import utilPath from 'path'
import { clearAclCache } from './acl-checker.mjs'

const RDF_MIME_TYPES = new Set([
  'text/turtle', // .ttl
  'text/n3', // .n3
  'text/html', // RDFa
  'application/xhtml+xml', // RDFa
  'application/n3',
  'application/nquads',
  'application/n-quads',
  'application/rdf+xml', // .rdf
  'application/ld+json', // .jsonld
  'application/x-turtle'
])

const suffixAcl = '.acl'
const suffixMeta = '.meta'
const AUXILIARY_RESOURCES = [suffixAcl, suffixMeta]

class LDP {
  constructor (argv = {}) {
    extend(this, argv)

    // Suffixes
    if (!this.suffixAcl) {
      this.suffixAcl = suffixAcl
    }
    if (!this.suffixMeta) {
      this.suffixMeta = suffixMeta
    }

    // Error pages folder
    this.errorPages = null
    if (!this.noErrorPages) {
      this.errorPages = argv.errorPages
      if (!this.errorPages) {
        // TODO: For now disable error pages if errorPages parameter is not explicitly passed
        this.noErrorPages = true
      } else if (!this.errorPages.endsWith('/')) {
        this.errorPages += '/'
      }
    }

    if (this.skin !== false) {
      this.skin = true
    }

    if (this.corsProxy && this.corsProxy[0] !== '/') {
      this.corsProxy = '/' + this.corsProxy
    }

    return this
  }

  async stat (file) {
    return new Promise((resolve, reject) => {
      fs.stat(file, (err, stats) => {
        if (err) return reject(error(err, "Can't read metadata of " + file))
        resolve(stats)
      })
    })
  }

  async readResource (url) {
    try {
      const { path } = await this.resourceMapper.mapUrlToFile({ url })
      return await withLock(path, () => promisify(fs.readFile)(path, { encoding: 'utf8' }))
    } catch (err) {
      throw error(err.status, err.message)
    }
  }

  async readContainerMeta (url) {
    if (url[url.length - 1] !== '/') {
      url += '/'
    }
    return this.readResource(url + this.suffixMeta)
  }

  async listContainer (container, reqUri, containerData, hostname) {
    const resourceGraph = $rdf.graph()
    try {
      $rdf.parse(containerData, resourceGraph, reqUri, 'text/turtle')
    } catch (err) {
      debug.handlers('GET -- Error parsing data: ' + err)
      throw error(500, "Can't parse container .meta")
    }

    try {
      // add container stats
      await ldpContainer.addContainerStats(this, reqUri, container, resourceGraph)
      // read directory
      const files = await ldpContainer.readdir(container)
      // iterate through all the files
      await Promise.all(files.map(async file => {
        const { url: fileUri } = await this.resourceMapper.mapFileToUrl(
          { path: join(container, file), hostname })
        return await ldpContainer.addFile(this, resourceGraph, reqUri, fileUri, container, file)
      }))
    } catch (err) {
      throw error(500, "Can't list container")
    }

    // TODO 'text/turtle' is fixed, should be contentType instead
    // This forces one more translation turtle -> desired
    try {
      return await serialize(resourceGraph, reqUri, 'text/turtle')
    } catch (err) {
      debug.handlers('GET -- Error serializing container: ' + err)
      throw error(500, "Can't serialize container")
    }
  }

  async post (hostname, containerPath, stream, { container, slug, extension, contentType }) {
    // POST without content type is forbidden
    if (!contentType) {
      throw error(400,
        'POSTrequest requires a content-type via the Content-Type header')
    }

    if (overQuota(this.quotaFile, this.quota)) {
      debug.handlers('POST -- Over quota')
      throw error(413, 'Storage quota exceeded')
    }
    // prepare slug
    if (slug) {
      if (slug.match(/\/|\.|\\|\?|%|!|#|&| |\||\*|\+/)) {
        throw error(400, 'The name of new file POSTed may not contain:  \\ / . ? % * + | & = # @ $ : ! & ` " ~  or a space')
      }
    }

    slug = slug || uuid.v4()

    if (extension && !slug.endsWith(extension)) {
      slug += extension
    }

    const file = utilPath.join(containerPath, slug)
    const url = this.resourceMapper.resolveUrl(hostname, '/' + file)

    debug.handlers('POST -- Will POST to ' + url)

    // check if file already exists
    if (fs.existsSync(file)) {
      throw error(409, 'File already exists')
    }

    await this.putResource(url, stream, contentType)

    await clearAclCache()

    debug.handlers('POST -- Created new resource')

    return { url }
  }

  async put (url, stream, contentType = 'text/turtle') {
    const { path } = await this.resourceMapper.mapUrlToFile({
      url,
      contentType,
      createIfNotExists: true,
      searchIndex: false
    })

    return await this.putResource(url, stream, contentType, path)
  }

  async putResource (url, stream, contentType, path) {
    if (overQuota(this.quotaFile, this.quota)) {
      debug.handlers('PUT -- Over quota')
      throw error(413, 'Storage quota exceeded')
    }

    // First check whether the file exists - if yes, ensure that it's not being edited by someone else first
    if (!path) {
      try {
        const pathToPutFile = await this.resourceMapper.mapUrlToFile({ url })
        path = pathToPutFile.path
      } catch (err) {
        // File doesn't exist, set path based on URL
        const pathToPutFile = await this.resourceMapper.mapUrlToFile({ url, createIfNotExists: true, contentType })
        path = pathToPutFile.path
      }
    }

    debug.handlers('PUT -- Putting resource: ' + path)

    if (contentType === 'text/n3' || contentType === 'application/ld+json' ||
      contentType === 'application/json') {
      contentType = 'text/turtle'
    }

    stream = await this.putValidateData(stream, contentType)

    // check if file already exists
    const fileExists = fs.existsSync(path)

    await withLock(path, async () => {
      // Create file
      mkdirp(dirname(path))

      // check if file already exists
      if (fs.existsSync(path + this.suffixMeta)) {
        debug.handlers('PUT -- Removing metadata file')
        rimraf.sync(path + this.suffixMeta)
      }

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path)

        file.on('error', function () {
          reject(error(500, 'Error writing data'))
        })
        file.on('finish', function () {
          debug.handlers('PUT -- Wrote data to: ' + path)
          resolve()
        })

        stream.on('error', function (err) {
          debug.handlers('PUT -- Error streaming data: ' + err)
          file.destroy()
          reject(error(500, 'Error streaming data'))
        })

        stream.pipe(file)
      })
    })

    await clearAclCache()

    // return information about a newly created resource
    if (!fileExists) {
      debug.handlers('PUT -- Created new resource.')
    } else {
      debug.handlers('PUT -- Updated existing resource.')
    }
  }

  async putValidateData (stream, contentType) {
    debug.handlers('PUT -- Content-Type is ' + contentType)

    // check if the stream is valid
    if (!stream) {
      throw error(400, 'Empty file not allowed for create/update, use DELETE instead')
    }

    // validate data for RDF files
    if (contentType && RDF_MIME_TYPES.has(contentType)) {
      try {
        // Read whole stream into a string
        const data = await new Promise((resolve, reject) => {
          let text = ''

          stream.on('data', function (chunk) {
            text += chunk
          })
          stream.on('end', function () {
            resolve(text)
          })
          stream.on('error', function (err) {
            reject(err)
          })
        })

        // Try to parse the data
        await parse(data, {
          contentType,
          baseIRI: 'http://example.com/'
        })
        debug.handlers('PUT -- Data is valid ' + contentType)

        return intoStream(data)
      } catch (err) {
        debug.handlers('PUT -- Data is not valid')
        throw error(400, 'Unparseable file')
      }
    } else {
      return stream
    }
  }

  async delete (url) {
    // Check for Trailing Slash
    const isContainer = url.endsWith('/')

    try {
      const { path } = await this.resourceMapper.mapUrlToFile({ url })

      await withLock(path, () => new Promise((resolve, reject) => {
        if (fs.existsSync(path)) {
          if (isContainer && fs.lstatSync(path).isFile()) {
            throw error(409, 'Cannot perform folder operation on a file')
          }
          if (!isContainer && fs.lstatSync(path).isDirectory()) {
            throw error(409, 'Cannot perform file operation on a container')
          }

          if (!isContainer) {
            rimraf.sync(path)
            // Remove metadata file too
            try {
              rimraf.sync(path + this.suffixMeta)
              rimraf.sync(path + this.suffixAcl)
            } catch (err) {
              if (err.code !== 'ENOENT') {
                throw new Error(err.code)
              }
            }
          } else {
            fs.readdir(path, (err, files) => {
              if (err) {
                throw err
              }
              if (files.length) {
                throw error(409, 'Container is not empty')
              }
              rimraf.sync(path)
              // Remove metadata and acl files too (but silently - the directory might be clean)
              try {
                rimraf.sync(path.replace(/\/$/, '') + this.suffixMeta)
                rimraf.sync(path.replace(/\/$/, '') + this.suffixAcl)
              } catch (err) {
                if (err.code !== 'ENOENT') {
                  throw new Error(err.code)
                }
              }
            })
          }
          resolve()
        } else {
          throw error(404, 'The resource you are trying to delete does not exist')
        }
      }))

      await clearAclCache()

      debug.handlers('DELETE -- Deleted ' + path)
    } catch (err) {
      debug.handlers('DELETE -- Error:' + err)
      throw err
    }
  }

  async copy (from, to, options) {
    if (overQuota(this.quotaFile, this.quota)) {
      debug.handlers('COPY -- Over quota')
      throw error(413, 'Storage quota exceeded')
    }

    const originalParsedPath = url.parse(from)
    const parsedPath = url.parse(to)
    const fromPath = this.resourceMapper.resolveFilePath(
      originalParsedPath.hostname,
      decodeURIComponent(originalParsedPath.pathname)
    )
    const toPath = this.resourceMapper.resolveFilePath(
      parsedPath.hostname,
      decodeURIComponent(parsedPath.pathname)
    )

    // Check if file already exists
    if (fs.existsSync(toPath)) {
      throw error(412, 'Target file already exists')
    }

    let copyPromise

    // create destination directory if not exists
    mkdirp(dirname(toPath))

    // If original is a single file
    if (!fromPath.endsWith('/')) {
      copyPromise = new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(fromPath)
        const writeStream = fs.createWriteStream(toPath)
        readStream.on('error', function (err) {
          debug.handlers('Error reading file: ' + err)
          reject(error(500, err))
        })
        writeStream.on('error', function (err) {
          debug.handlers('Error writing file: ' + err)
          reject(error(500, err))
        })
        writeStream.on('finish', function () {
          debug.handlers('Finished copying file')
          resolve()
        })
        readStream.pipe(writeStream)
      })
    } else {
      // If original is a folder, copy recursively
      copyPromise = new Promise((resolve, reject) => {
        const { exec } = require('child_process')
        exec(`cp -r "${fromPath}" "${toPath}"`, function (err) {
          if (err) {
            debug.handlers('Error copying directory: ' + err)
            reject(error(500, err))
          } else {
            debug.handlers('Finished copying directory')
            resolve()
          }
        })
      })
    }

    await copyPromise
    // Copy ACL file if exists
    if (fs.existsSync(fromPath + this.suffixAcl)) {
      const readAclStream = fs.createReadStream(fromPath + this.suffixAcl)
      const writeAclStream = fs.createWriteStream(toPath + this.suffixAcl)
      await new Promise((resolve, reject) => {
        readAclStream.on('error', function (err) {
          debug.handlers('Error reading ACL file: ' + err)
          reject(error(500, err))
        })
        writeAclStream.on('error', function (err) {
          debug.handlers('Error writing ACL file: ' + err)
          reject(error(500, err))
        })
        writeAclStream.on('finish', function () {
          debug.handlers('Finished copying ACL file')
          resolve()
        })
        readAclStream.pipe(writeAclStream)
      })
    }

    // Copy meta file if exists
    if (fs.existsSync(fromPath + this.suffixMeta)) {
      const readMetaStream = fs.createReadStream(fromPath + this.suffixMeta)
      const writeMetaStream = fs.createWriteStream(toPath + this.suffixMeta)
      await new Promise((resolve, reject) => {
        readMetaStream
          .on('error', function (err) {
            debug.handlers('Error reading meta file: ' + err)
            reject(error(500, err))
          })
          .on('open', function () {
            readMetaStream.pipe(writeMetaStream)
          })
        writeMetaStream.on('error', function (err) {
          debug.handlers('Error writing meta file: ' + err)
          reject(error(500, err))
        })
        writeMetaStream.on('finish', function () {
          debug.handlers('Finished copying meta file')
          resolve()
        })
      })
    }

    await clearAclCache()

    debug.handlers('COPY -- Copied ' + fromPath + ' to ' + toPath)
  }

  async patch (uri, patchObject) {
    if (overQuota(this.quotaFile, this.quota)) {
      debug.handlers('PATCH -- Over quota')
      throw error(413, 'Storage quota exceeded')
    }

    const url = uri
    let path
    try {
      ({ path } = await this.resourceMapper.mapUrlToFile({ url }))
    } catch (err) {
      throw error(err.status || 500, err.message)
    }

    await withLock(path, async () => {
      let originalData = ''

      try {
        originalData = await promisify(fs.readFile)(path, { encoding: 'utf8' })
      } catch (err) {
        throw error(err, 'Cannot patch a file that does not exist')
      }

      const contentType = getContentType(path)
      const patchedData = await this.applyPatch(originalData, patchObject, contentType, uri)

      // Write patched data back to file
      await promisify(fs.writeFile)(path, patchedData, 'utf8')
    })

    await clearAclCache()

    debug.handlers('PATCH -- Patched:' + path)
  }

  async applyPatch (data, patchObject, contentType, uri) {
    const baseGraph = $rdf.graph()
    let patchedGraph

    try {
      $rdf.parse(data, baseGraph, uri, contentType)
    } catch (err) {
      throw error(500, 'Cannot parse file for patching: ' + uri)
    }

    // Apply patches
    if (patchObject.updates) {
      patchedGraph = await this.applyPatchUpdate(baseGraph, patchObject.updates, uri, contentType)
    } else if (patchObject.deletes || patchObject.inserts) {
      patchedGraph = await this.applyPatchInsertDelete(baseGraph, patchObject, uri, contentType)
    } else {
      throw error(422, 'Invalid patch object')
    }

    try {
      return await serialize(patchedGraph, uri, contentType)
    } catch (err) {
      throw error(500, 'Cannot serialize patched file: ' + uri)
    }
  }

  async applyPatchUpdate (baseGraph, updates, uri, contentType) {
    const patchedGraph = baseGraph

    for (const update of updates) {
      if (update.operation === 'delete') {
        const deleteQuads = this.parseQuads(update.where, uri, contentType)
        for (const quad of deleteQuads) {
          patchedGraph.removeMatches(quad.subject, quad.predicate, quad.object)
        }
      } else if (update.operation === 'insert') {
        const insertQuads = this.parseQuads(update.quads, uri, contentType)
        for (const quad of insertQuads) {
          patchedGraph.add(quad.subject, quad.predicate, quad.object)
        }
      } else {
        throw error(422, 'Unknown patch operation: ' + update.operation)
      }
    }

    return patchedGraph
  }

  async applyPatchInsertDelete (baseGraph, patchObject, uri, contentType) {
    const patchedGraph = baseGraph

    // Apply deletes first
    if (patchObject.deletes) {
      const deleteQuads = this.parseQuads(patchObject.deletes, uri, contentType)
      for (const quad of deleteQuads) {
        patchedGraph.removeMatches(quad.subject, quad.predicate, quad.object)
      }
    }

    // Apply inserts
    if (patchObject.inserts) {
      const insertQuads = this.parseQuads(patchObject.inserts, uri, contentType)
      for (const quad of insertQuads) {
        patchedGraph.add(quad.subject, quad.predicate, quad.object)
      }
    }

    return patchedGraph
  }

  parseQuads (quads, uri, contentType) {
    const graph = $rdf.graph()
    $rdf.parse(quads, graph, uri, contentType)
    return graph.statements
  }

  // FIXME: might want to use streams
  async getGraph (file) {
    try {
      const data = await promisify(fs.readFile)(file, { encoding: 'utf8' })
      return await parse(data, { contentType: getContentType(file), baseIRI: file })
    } catch (err) {
      throw error(err, 'Cannot read graph: ' + file)
    }
  }

  static getRDFMimeTypes () {
    return Array.from(RDF_MIME_TYPES)
  }
}

export default LDP