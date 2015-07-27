/*jslint node: true*/
"use strict";

var fs = require('fs');
var debug = require('../logging').handlers;
var utils = require('../utils.js');
var metadata = require('../metadata.js');

// Delete a container or resource
function handler(req, res) {
    debug('DELETE -- ' + req.originalUrl);

    var ldp = req.app.locals.ldp;
    var filename = utils.uriToFilename(req.path, ldp.root);

    ldp.delete(filename, function(err) {
        if (err) {
            debug("DELETE -- error: " + err);
            return res
                .status(err.status)
                .send(err.message);
        }

        debug("DELETE -- Ok.");
        return res.sendStatus(200);

    });

}

exports.handler = handler;
