import Handlebars from 'handlebars'
import debugModule from '../debug.js'
import { processFile, readFile, writeFile } from './fs-utils.js'

const debug = debugModule.errors

export async function compileTemplate (filePath) {
  const indexTemplateSource = readFile(filePath)
  return Handlebars.compile(indexTemplateSource)
}

export async function processHandlebarFile (filePath, substitutions) {
  return processFile(filePath, (rawSource) => processHandlebarTemplate(rawSource, substitutions))
}

function processHandlebarTemplate (source, substitutions) {
  try {
    const template = Handlebars.compile(source)
    return template(substitutions)
  } catch (error) {
    debug(`Error processing template: ${error}`)
    return source
  }
}

export function writeTemplate (filePath, template, substitutions) {
  const source = template(substitutions)
  writeFile(filePath, source)
}
