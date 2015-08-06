/*jslint node: true*/
"use strict";

var fs = require('fs');

function errorPageHandler(err, req, res, next) {
    var ldp = req.app.locals.ldp;
    if (!ldp.noErrorPages) {
        var errorPage = ldp.errorPages +
                err.status.toString() + '.html';
        fs.readFile(errorPage, 'utf8', function(readErr, text) {
            if (readErr) {
                defaultErrorHandler(err, res);
            } else {
                res.status(err.status);
                res.send(text);
            }
        });
    } else {
        defaultErrorHandler(err, res);
    }
}

function defaultErrorHandler(err, res) {
    res.status(err.status);
    res.send(err.message);
}

exports.handler = errorPageHandler;
