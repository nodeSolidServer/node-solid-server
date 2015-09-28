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
    var filename = utils.uriToFilename(req.path, ldp.root);

    ldp.delete(filename, function(err) {
        if (err) {
            debug("DELETE -- error: " + err);
            return next(err);
        }

        debug("DELETE -- Ok.");
        if (ldp.live) ldp.live(req.originalUrl)
        return res.sendStatus(200);
    });

}

exports.handler = handler;
