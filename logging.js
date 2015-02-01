options = require('./options.js')

module.exports.log = function() {
    if (options.verbose) console.log.apply(console, arguments);
}

