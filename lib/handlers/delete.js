/*jslint node: true*/
"use strict";

var fs = require('fs');
var debug = require('../debug').handlers;
var utils = require('../utils.js');
var metadata = require('../metadata.js');

// Delete a container or resource
function handler(req, res, next) {
    debug('DELETE -- ' + req.originalUrl);

    var ldp = req.app.locals.ldp;

    ldp.delete(req.path, function(err) {
        if (err) {
            debug("DELETE -- error: " + err);
            return next(err);
        }

        debug("DELETE -- Ok.");

        res.sendStatus(200);
        return next();
    });

}

exports.handler = handler;
