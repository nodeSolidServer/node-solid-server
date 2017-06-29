var fs = require('fs')
var fsExtra = require('fs-extra')
var rimraf = require('rimraf')
var path = require('path')

exports.rm = function (file) {
  return rimraf.sync(path.join(__dirname, '/resources/' + file))
}

exports.write = function (text, file) {
  return fs.writeFileSync(path.join(__dirname, '/resources/' + file), text)
}

exports.cp = function (src, dest) {
  return fsExtra.copySync(
    path.join(__dirname, '/resources/' + src),
    path.join(__dirname, '/resources/' + dest))
}

exports.read = function (file) {
  return fs.readFileSync(path.join(__dirname, '/resources/' + file), {
    'encoding': 'utf8'
  })
}

// Backs up the given file
exports.backup = function (src) {
  exports.cp(src, src + '.bak')
}

// Restores a backup of the given file
exports.restore = function (src) {
  exports.cp(src + '.bak', src)
  exports.rm(src + '.bak')
}
