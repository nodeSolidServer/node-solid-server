module.exports.compileTemplate = compileTemplate
module.exports.processHandlebarFile = processHandlebarFile
module.exports.writeTemplate = writeTemplate

const Handlebars = require('handlebars')
const debug = require('../debug').errors
const { processFile, readFile, writeFile } = require('./fs-utils')

async function compileTemplate (filePath) {
  const indexTemplateSource = readFile(filePath)
  return Handlebars.compile(indexTemplateSource)
}

/**
 * Reads a file, processes it (performing template substitution), and saves
 * back the processed result.
 *
 * @param filePath {string}
 * @param substitutions {Object}
 *
 * @return {Promise}
 */
async function processHandlebarFile (filePath, substitutions) {
  return processFile(filePath, (rawSource) => {
    try {
      const template = Handlebars.compile(rawSource)
      return template(substitutions)
    } catch (error) {
      debug(`Error processing template: ${error}`)
      return rawSource
    }
  })
}

function writeTemplate (filePath, template, substitutions) {
  const source = template(substitutions)
  writeFile(filePath, source)
}

function writeTemplate (filePath, template, substitutions) {
  const source = template(substitutions)
  writeFile(filePath, source)
}
