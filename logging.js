/*jslint node: true*/
"use strict";

var options = require('./options.js');
var time = require('./time.js');

function log(message) {
    if (options.verbose) {
        //console.log.apply(console, arguments); // was arguments
        console.log(time.timestamp() + ' ' + message ); // was arguments
    }
}

exports.log = log;

