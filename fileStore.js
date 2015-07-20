/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');

var turtleExtension = ".ttl";

function uriToFilename(uri, base) {
    var filename = path.join(base, uri);
    // Make sure filename ends with '/'  if filename exists and is a directory.
    try {
        var fileStats = fs.statSync(filename);
        if (fileStats.isDirectory() && !S(filename).endsWith('/')) {
            filename += '/';
        } else if (fileStats.isFile() && S(filename).endsWith('/')) {
            filename = S(filename).chompRight('/').s;
        }
    } catch (err) {}
    return filename;
}

function uriToRelativeFilename(uri, base) {
    var filename = uriToFilename(uri, base);
    var relative = path.relative(base, filename);
    return relative;
}

function filenameToBaseUri(filename, uri, base) {
    var uriPath = S(filename).strip(base).toString();
    return uri + '/' + uriPath;
}

function uriAbs(req) {
    return req.protocol + '://' + req.get('host');
}

function uriBase(req) {
    return uriAbs(req) + (req.baseUrl || '');
}

function getResourceLink(filename, uri, base, suffix, otherSuffix) {
    var link = filenameToBaseUri(filename, uri, base);
    if (S(link).endsWith(suffix)) {
        return link;
    } else if (S(link).endsWith(otherSuffix)) {
        return S(link).chompRight(otherSuffix).s + suffix;
    } else {
        return link+suffix;
    }
}

exports.uriToFilename = uriToFilename;
exports.uriToRelativeFilename = uriToRelativeFilename;
exports.filenameToBaseUri = filenameToBaseUri;
exports.uriAbs = uriAbs;
exports.uriBase = uriBase;
exports.getResourceLink = getResourceLink;
