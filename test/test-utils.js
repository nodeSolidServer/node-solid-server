var fs = require('fs');
var fsExtra = require('fs-extra');

exports.rm = function (file) {
  try {
    return fs.unlinkSync(__dirname + '/resources/' + file);
  } catch (e) {
    // do nothing, suppress "Error: ENOENT, no such file or directory" errors
  }

};

exports.write = function (text, file) {
  return fs.writeFileSync(__dirname + '/resources/' + file, text);
};

exports.cp = function (src, dest) {
  return fsExtra.copySync(
    __dirname + '/resources/' + src,
    __dirname + '/resources/' + dest);
};

exports.read = function (file) {
  return fs.readFileSync(__dirname + '/resources/' + file, {
      'encoding': 'utf8'
    });
};
