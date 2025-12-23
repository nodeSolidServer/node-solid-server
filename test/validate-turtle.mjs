
import { fileURLToPath } from 'url'
import fs from 'node:fs'
import Handlebars from 'handlebars'
import path from 'node:path'
import validateModule from 'turtle-validator/lib/validator.js'

const validate = validateModule.default || validateModule
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const regex = /\\.(acl|ttl)$/i
const substitutions = {
  webId: 'http://example.com/#me',
  email: 'test@example.com',
  name: 'Test test'
}

const files = recursiveFiles(path.join(__dirname, '../default-templates/'))

for (const file of files) {
  const data = fs.readFileSync(file, 'utf8')
  const template = Handlebars.compile(data)
  validate(template(substitutions), feedback => {
    if (feedback.errors.length > 0) {
      throw new Error(`Validation error in ${file}: ${feedback.errors[0]}`)
    }
  })
}

function recursiveFiles (dir) {
  const content = fs.readdirSync(dir)
  return [].concat(...content.map(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      return recursiveFiles(fullPath)
    } else if (regex.test(file)) {
      return [fullPath]
    }
    return []
  }))
}
