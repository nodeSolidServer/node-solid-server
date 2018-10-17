module.exports.copyTemplateDir = copyTemplateDir
module.exports.processFile = processFile

const fs = require('fs-extra')

async function copyTemplateDir (templatePath, targetPath) {
  return new Promise((resolve, reject) => {
    fs.copy(templatePath, targetPath, (error) => {
      if (error) { return reject(error) }

      resolve()
    })
  })
}

async function processFile (filePath, manipulateSourceFn) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (error, rawSource) => {
      if (error) {
        return reject(error)
      }

      const output = manipulateSourceFn(rawSource)

      fs.writeFile(filePath, output, (error) => {
        if (error) {
          return reject(error)
        }
        resolve()
      })
    })
  })
}
