var path = require('path');

var options = require('./options.js');
var logging = require('./logging.js');

module.exports.uriToFilename = function(uri) {
    //if (uri.slice(0, options.pathStart.length) !== options.pathStart) {
        //throw "Path '" + uri + "'not starting with base '" + options.pathStart + "'.";
    //}
    //var filename = options.fileBase + uri.slice(options.pathStart.length);
    var filename = path.join(options.fileBase, uri);
    logging.log(' -- filename ' +filename);
    return filename;
};
