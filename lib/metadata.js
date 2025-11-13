// TODO: This is a CommonJS wrapper. Use metadata.mjs directly once ESM migration is complete.
exports.Metadata = Metadata

function Metadata () {
  this.filename = ''
  this.isResource = false
  this.isSourceResource = false
  this.isContainer = false
  this.isBasicContainer = false
  this.isDirectContainer = false
  this.isStorage = false
}
