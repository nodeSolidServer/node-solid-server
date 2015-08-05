/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');
var turtleExtension = ".ttl";

function uriToFilename(uri, base) {
    var filename = path.join(base, uri);
    // Make sure filename ends with '/'  if filename exists and is a directory.

    // TODO this sync operation can be avoided and can be left
    // to do, to other components, see `ldp.get`
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

function uriRelative(uri) {
    var relative = path.basename(uri);
    return relative;
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

function formatDateTime(date, format) {
    return format.split('{').map(function(s){
        var k = s.split('}')[0];
        var width = {'Milliseconds':3, 'FullYear':4};
        var d = {'Month': 1};
        return s?  ( '000' + (date['get' + k]() + (d[k]|| 0))).slice(-(width[k]||2)) + s.split('}')[1] : '';
    }).join('');
}

function timestamp() {
    return formatDateTime(new Date(),
        '{FullYear}-{Month}-{Date}T{Hours}:{Minutes}:{Seconds}.{Milliseconds}');
}

function shortTime() {
    return formatDateTime(new Date(),
        '{Hours}:{Minutes}:{Seconds}.{Milliseconds}');
}

exports.uriToFilename = uriToFilename;
exports.uriToRelativeFilename = uriToRelativeFilename;
exports.filenameToBaseUri = filenameToBaseUri;
exports.uriAbs = uriAbs;
exports.uriRelative = uriRelative;
exports.uriBase = uriBase;
exports.getResourceLink = getResourceLink;
exports.formatDateTime = formatDateTime;
exports.timestamp = timestamp;
exports.shortTime = shortTime;