module.exports.isValidUsername = isValidUsername

function isValidUsername (username) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(username)
}
