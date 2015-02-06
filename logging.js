/*jslint node: true*/
"use strict";

var options = require('./options.js');
var time = require('./time.js');

module.exports.log = function(message) {
    if (options.verbose) {
        //console.log.apply(console, arguments); // was arguments
        console.log(time.timestamp() + ' ' + message ); // was arguments
    }
};

