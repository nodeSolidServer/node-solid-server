
const fs = require('fs')
const Handlebars = require('handlebars')
const path = require('path')
const validate = require('turtle-validator/lib/validator')

const regex = new RegExp('\\.(acl|ttl)$', 'i')
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
