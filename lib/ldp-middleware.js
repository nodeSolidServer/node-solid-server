module.exports = LdpMiddleware

var express = require('express');
var getRawBody = require('raw-body');
var responseTime = require('response-time');

var header = require('./header');
var parse = require('./parse');
var acl = require('./acl');
var login = require('./login');

// Request handlers
var getHandler = require('./handlers/get.js');
var postHandler = require('./handlers/post.js');
var putHandler = require('./handlers/put.js');
var deleteHandler = require('./handlers/delete.js');
var patchHandler = require('./handlers/patch.js');

// Error page handler
var errorHandler = require('./handlers/error.js');


function LdpMiddleware (corsSettings) {
    var router = express.Router('/');

    // Add Link headers
    router.use(header.linksHandler);
    if (corsSettings) router.use(corsSettings)
    router.use('/*', function(req, res, next) {
        getRawBody(req,
                   {
                       length: req.headers['content-length'],
                       encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
                   },
                   function(err, string) {
                       if (err) {
                           return next(err);
                       }
                       req.text = string;
                       next();
                   });
    });

    router.use('/*', login.loginHandler);

    //ACL handlers
    router.get("/*", acl.allowReadHandler);
    router.head("/*", acl.allowReadHandler);
    router.post("/*", acl.allowAppendThenWriteHandler);
    router.patch("/*", acl.allowAppendThenWriteHandler);
    router.put("/*", acl.allowAppendThenWriteHandler);
    router.delete("/*", acl.allowWriteHandler);

    // Convert json-ld and nquads to turtle
    router.use('/*', parse.parseHandler);

    // Add response time
    router.use(responseTime());

    // HTTP methods handlers
    router.get('/*', getHandler.handler);
    router.head('/*', getHandler.headHandler);
    router.put('/*', putHandler.handler);
    router.delete('/*', deleteHandler.handler);
    router.post('/*', postHandler.handler);
    router.patch('/*', patchHandler.handler);

    //Error handling
    router.use(errorHandler.handler);
    return router;
}
