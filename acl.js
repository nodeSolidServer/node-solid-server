/*jslint node: true*/
"use strict";

var acl = require('acl');
var fs = require('fs');
var path = require('path');

var file = require('./fileStore.js');
var options = require('./options.js');

var permissionExtension = '.permissions';
var aclEnabled = false;

module.exports.readPermissions = function() {
    var permissionFile = options.fileBase + permissionExtension;
    fs.readFile(permissionFile, readPermissionsCallback);

    function readPermissionsCallback(err, rawPermissions) {
        if (err) {
            return;
        } else {
            var jsonPermissions;
            try {
                jsonPermissions = JSON.parse(rawPermissions);
            } catch (parseErr) {
                return;
            }
            if ('roles' in jsonPermissions && 'users' in jsonPermissions) {
                try {
                    acl = new acl(new acl.memoryBackend());
                    for (var rIndex = 0; rIndex < jsonPermissions.roles.length; rIndex++) {
                        acl.allow(jsonPermissions.roles[rIndex][0],
                            jsonPermissions.roles[rIndex][1],
                            jsonPermissions.roles[rIndex][2]);
                    }
                    for (var uIndex = 0; uIndex < jsonPermissions.users.length; uIndex++) {
                        acl.addUserRoles(jsonPermissions.users[uIndex][0],
                            jsonPermissions.users[uIndex][1]);
                    }
                    aclEnabled = true;
                    return;
                } catch (permissionErr) {
                    return;
                }
            } else {
                return;
            }
        }
    }
};

module.exports.isAllowed = function(userId, resource, permissions, callback) {
    if (aclEnabled) {
        acl.isAllowed(userId, resource, permissions, callback);
    } else {
        callback(undefined, true);
    }
};

module.exports.aclHandler = function(req, res, next) {
    //TODO authentication
    var filename = file.uriToFilename(req.path);
    var resource = path.relative(options.fileBase, filename);

    //TODO complete this line
    // acl.isAllowed(userId, resource, req.method);
    next();

    function aclCallback(err, allowed) {
        if (err) {
            return res.sendStatus(500);
        } else {
            if (allowed) {
                next();
            } else {
                return res.sendStatus(403);
            }
        }

    }
};
