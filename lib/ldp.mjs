/* eslint-disable node/no-deprecated-api */

import { join, dirname } from 'path'
import intoStream from 'into-stream'
import url from 'url'
import fs from 'fs'
import $rdf from 'rdflib'
import { mkdirp } from 'fs-extra'
import { v4 as uuid } from 'uuid' // there seem to be an esm module
import debug from './debug.mjs'
import error from './http-error.mjs'
import { stringToStream, serialize, overQuota, getContentType, parse } from './utils.mjs'
import extend from 'extend'
import rimraf from 'rimraf'
import { exec } from 'child_process'
import * as ldpContainer from './ldp-container.mjs'
import fetch from 'node-fetch'
import { promisify } from 'util'
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
    debug.handlers('PUT -- Mapped url to file: ' + path)

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

  async graph (url, baseUri, contentType) {
    const body = await this.readResource(url)
    if (!contentType) {
      ({ contentType } = await this.resourceMapper.mapUrlToFile({ url }))
    }
    return new Promise((resolve, reject) => {
      const graph = $rdf.graph()
      $rdf.parse(body, graph, baseUri, contentType,
        err => err ? reject(err) : resolve(graph))
    })
  }

  static getRDFMimeTypes () {
    return Array.from(RDF_MIME_TYPES)
  }

  getTrustedOrigins (req) {
    const trustedOrigins = [this.resourceMapper.resolveUrl(req.hostname)].concat(this.trustedOrigins)
    if (this.multiuser) {
      trustedOrigins.push(this.serverUri)
    }
    return trustedOrigins
  }

  async getAvailableUrl (hostname, containerURI, { slug = uuid(), extension, container } = {}) {
    let requestUrl = this.resourceMapper.resolveUrl(hostname, containerURI)
    requestUrl = requestUrl.replace(/\/*$/, '/')

    let itemName = slug.endsWith(extension) || slug.endsWith(this.suffixAcl) || slug.endsWith(this.suffixMeta) ? slug : slug + extension
    try {
      // check whether resource exists
      const context = container ? '/' : ''
      await this.resourceMapper.mapUrlToFile({ url: (requestUrl + itemName + context) })
      itemName = `${uuid()}-${itemName}`
    } catch (e) {
      try {
        // check whether resource with same name exists
        const context = !container ? '/' : ''
        await this.resourceMapper.mapUrlToFile({ url: (requestUrl + itemName + context) })
        itemName = `${uuid()}-${itemName}`
      } catch (e) {}
    }
    if (container) itemName += '/'
    return requestUrl + itemName
  }

  async exists (hostname, path, searchIndex = true) {
    const options = { hostname, path, includeBody: false, searchIndex }
    return await this.get(options, searchIndex)
  }

  async fetchGraph (uri, options = {}) {
    const response = await fetch(uri)
    if (!response.ok) {
      const err = new Error(
        `Error fetching ${uri}: ${response.status} ${response.statusText}`
      )
      err.statusCode = response.status || 400
      throw err
    }
    const body = await response.text()

    return parse(body, uri, getContentType(response.headers))
  }

  async checkItemName (url) {
    let testName, testPath
    const { hostname, pathname } = this.resourceMapper._parseUrl(url)
    let itemUrl = this.resourceMapper.resolveUrl(hostname, pathname)
    if (this._containsInvalidSuffixes(itemUrl)) {
      throw error(400, `${itemUrl} contained reserved suffixes in path`)
    }
    const container = itemUrl.endsWith('/')
    try {
      const testUrl = container ? itemUrl.slice(0, -1) : itemUrl + '/'
      const { path: testPathLocal } = await this.resourceMapper.mapUrlToFile({ url: testUrl })
      testPath = testPathLocal
      testName = container ? fs.lstatSync(testPath).isFile() : fs.lstatSync(testPath).isDirectory()
    } catch (err) {
      testName = false

      if (itemUrl.endsWith('/')) itemUrl = itemUrl.substring(0, itemUrl.length - 1)
      itemUrl = itemUrl.substring(0, itemUrl.lastIndexOf('/') + 1)
      const { pathname: parentPathname } = this.resourceMapper._parseUrl(itemUrl)
      if (parentPathname !== '/') {
        return await this.checkItemName(itemUrl)
      }
    }
    if (testName) {
      throw error(409, `${testPath}: Container and resource cannot have the same name in URI`)
    }
  }

  async createDirectory (pathArg, hostname, nonContainer = true) {
    try {
      const dirName = dirname(pathArg)
      if (!fs.existsSync(dirName)) {
        await promisify(mkdirp)(dirName)
        if (this.live && nonContainer) {
          const parentDirectoryPath = utilPath.dirname(dirName) + utilPath.sep
          const parentDirectoryUrl = (await this.resourceMapper.mapFileToUrl({ path: parentDirectoryPath, hostname })).url
          this.live(url.parse(parentDirectoryUrl).pathname)
        }
      }
    } catch (err) {
      debug.handlers('PUT -- Error creating directory: ' + err)
      throw error(err, 'Failed to create the path to the new resource')
    }
  }

  async checkFileExtension (urlArg, pathArg) {
    try {
      const { path: existingPath } = await this.resourceMapper.mapUrlToFile({ url: urlArg })
      if (pathArg !== existingPath) {
        try {
          await withLock(existingPath, () => promisify(fs.unlink)(existingPath))
        } catch (err) { throw error(err, 'Failed to delete resource') }
      }
    } catch (err) { }
  }

  async deleteContainer (directory) {
    if (directory[directory.length - 1] !== '/') directory += '/'
    let list
    try {
      list = await promisify(fs.readdir)(directory)
    } catch (err) {
      throw error(404, 'The container does not exist')
    }
    if (list.some(file => !file.endsWith(this.suffixMeta) && !file.endsWith(this.suffixAcl))) {
      throw error(409, 'Container is not empty')
    }
    try {
      await promisify(rimraf)(directory)
    } catch (err) {
      throw error(err, 'Failed to delete the container')
    }
  }

  async deleteDocument (filePath) {
    const linkPath = this.resourceMapper._removeDollarExtension(filePath)
    try {
      await withLock(filePath, () => promisify(fs.unlink)(filePath))
      const aclPath = `${linkPath}${this.suffixAcl}`
      if (await promisify(fs.exists)(aclPath)) {
        await withLock(aclPath, () => promisify(fs.unlink)(aclPath))
      }
      const metaPath = `${linkPath}${this.suffixMeta}`
      if (await promisify(fs.exists)(metaPath)) {
        await withLock(metaPath, () => promisify(fs.unlink)(metaPath))
      }
    } catch (err) {
      debug.container('DELETE -- unlink() error: ' + err)
      throw error(err, 'Failed to delete resource')
    }
  }

  async get (options, searchIndex = true) {
    let pathLocal, contentType, stats
    try {
      ({ path: pathLocal, contentType } = await this.resourceMapper.mapUrlToFile({ url: options, searchIndex }))
      stats = await this.stat(pathLocal)
    } catch (err) {
      throw error(err.status || 500, err.message)
    }

    if (!options.includeBody) {
      return { stream: stats, contentType, container: stats.isDirectory() }
    }

    if (stats.isDirectory()) {
      const { url: absContainerUri } = await this.resourceMapper.mapFileToUrl({ path: pathLocal, hostname: options.hostname })
      const metaFile = await this.readContainerMeta(absContainerUri).catch(() => '')
      let data
      try {
        data = await this.listContainer(pathLocal, absContainerUri, metaFile, options.hostname)
      } catch (err) {
        debug.handlers('GET container -- Read error:' + err.message)
        throw err
      }
      const stream = stringToStream(data)
      return { stream, contentType, container: true }
    } else {
      let chunksize, contentRange, start, end
      if (options.range) {
        const total = fs.statSync(pathLocal).size
        const parts = options.range.replace(/bytes=/, '').split('-')
        const partialstart = parts[0]
        const partialend = parts[1]
        start = parseInt(partialstart, 10)
        end = partialend ? parseInt(partialend, 10) : total - 1
        chunksize = (end - start) + 1
        contentRange = 'bytes ' + start + '-' + end + '/' + total
      }
      return withLock(pathLocal, () => new Promise((resolve, reject) => {
        const stream = fs.createReadStream(pathLocal, start && end ? { start, end } : {})
        stream
          .on('error', function (err) {
            debug.handlers(`GET -- error reading ${pathLocal}: ${err.message}`)
            return reject(error(err, "Can't read file " + err))
          })
          .on('open', function () {
            debug.handlers(`GET -- Reading ${pathLocal}`)
            return resolve({ stream, contentType, container: false, contentRange, chunksize })
          })
      }))
    }
  }
}

export default LDP