/*jslint node: true*/
"use strict";

var acl = require('acl');
var fs = require('fs');
var path = require('path');
var file = require('./fileStore.js');
var logging = require('./logging.js');
var options = require('./options.js');

var permissionExtension = '.permissions';
var aclEnabled = false;

module.exports.initializePermissions = function() {
    logging.log("ACL -- Initializing permissions.");
    var permissionFile = options.fileBase + permissionExtension;
    fs.readFile(permissionFile, readPermissionsCallback);

    function readPermissionsCallback(err, rawPermissions) {
        if (err) {
            logging.log("ACL -- Error reading permission file: " + err);
            process.exit(1);
        } else {
            var jsonPermissions;
            try {
                jsonPermissions = JSON.parse(rawPermissions);
            } catch (parseErr) {
                logging.log("ACL -- Error parsing permission file: " + err);
                process.exit(1);
            }
            if ('roles' in jsonPermissions && 'users' in jsonPermissions) {
                try {
                    acl = new acl(new acl.memoryBackend());
                    for (var rIndex = 0;
                        rIndex < jsonPermissions.roles.length; rIndex++) {
                        acl.allow(jsonPermissions.roles[rIndex][0],
                            jsonPermissions.roles[rIndex][1],
                            jsonPermissions.roles[rIndex][2],
                            setPermissionCallback);
                    }
                    for (var uIndex = 0;
                        uIndex < jsonPermissions.users.length; uIndex++) {
                        acl.addUserRoles(jsonPermissions.users[uIndex][0],
                            jsonPermissions.users[uIndex][1],
                            setPermissionCallback);
                    }
                    aclEnabled = true;
                    return;
                } catch (permissionErr) {
                    logging.log("ACL -- Erorr parsing permission file: " + err);
                    process.exit(1);
                }
            } else {
                logging.log("ACL -- Invalid permission file.");
                process.exit(1);
            }
        }
    }

    function setPermissionCallback(err) {
        if (err) {
            logging.log("ACL -- Error setting permissions:" + err);
            process.exit(1);
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
    var filename = file.uriToFilename(req.path);
    var resource = path.relative(options.fileBase, filename);
    var userId = req.session.profile;

    module.exports.isAllowed(userId, resource, req.method, aclCallback);

    function aclCallback(err, allowed) {
        if (err) {
            return res.sendStatus(403);
        } else {
            if (allowed) {
                next();
            } else {
                return res.sendStatus(403);
            }
        }
    }
};
