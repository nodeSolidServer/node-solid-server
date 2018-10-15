/**
 * Copy the frontend assets installed through npm.
 * Be sure the correct dependency name in listed in the package.json
 */
const mkdirp = require('mkdirp')
const path = require('path')
const ncp = require('ncp').ncp
const frontendassets = require('../package').frontendassets

const sourcePath = path.resolve('node_modules')
const destinationPath = path.resolve('common/vendors')

for (let dependency of frontendassets) {
  // Ensure directory exists then copy files
  mkdirp(path.resolve(destinationPath, dependency), (err) => {
    if (err) {
      return console.error(err)
    }
    ncp(
      path.resolve(sourcePath, dependency),
      path.resolve(destinationPath, dependency),
      (err) => {
        if (err) {
          return console.error(err)
        }
        console.log('Copied', dependency, '!')
      }
    )
  })
}
