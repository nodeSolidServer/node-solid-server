/*jslint node: true*/
"use strict";

var $rdf = require('rdflib');
var redis = require('redis');
var debug = require('./debug').subscription;
var utils = require('./utils.js');
var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');

exports.subscribeToChanges_SSE = function(req, res) {
    var ldp = req.app.locals.ldp;

    var messageCount;
    debug("Server Side Events subscription");
    var targetPath = req.originalUrl.slice(0, - ldp.suffixChanges.length); // lop off ',events'
    if (ldp.SSEsubscriptions[targetPath] === undefined) {
        ldp.SSEsubscriptions[targetPath] = redis.createClient();
    }
    var subscriber = ldp.SSEsubscriptions[targetPath];
    debug("Server Side Events subscription: " + targetPath);

    subscriber.subscribe('updates');

    // In case we encounter an error...print it out to the console
    subscriber.on('error', function(err) {
        debug("Redis Error: " + err);
    });

    // When we receive a message from the redis connection
    subscriber.on('message', function(channel, message) {
        messageCount += 1; // Increment our message count

        res.write('id: ' + messageCount + '\n');
        res.write("data: " + message + '\n\n'); // Note the extra newline
    });

    //send headers for event-stream connection
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write('\n');

    // The 'close' event is fired when a user closes their browser window.
    // In that situation we want to make sure our redis channel subscription
    // is properly shut down to prevent memory leaks.

    req.on("close", function() {
        subscriber.unsubscribe();
        subscriber.quit();
    });

};

exports.publishDelta_SSE = function (req, res, patchKB, targetURI){
    // @@ TODO
    var ldp = req.app.locals.ldp;
    var targetPath = req.originalUrl.slice(0, - ldp.suffixChanges.length); // lop off ',changes'
    var publisherClient = ldp.SSEsubscriptions[targetPath];
    publisherClient.publish( 'updates', ('"' + targetPath + '" data changed visited') );
};

///////////////// Long poll

var DelayedResponse = require('http-delayed-response');
// try this.  https://www.npmjs.org/package/http-delayed-response


exports.subscribeToChangesLongPoll = function(req, res) {
    var ldp = req.app.locals.ldp;
    var targetPath = req.originalUrl.slice(0, - ldp.suffixChanges.length); // lop off ',changes'
    if (ldp.subscriptions[targetPath] === undefined) {
        ldp.subscriptions[targetPath] = [];
    }

    var delayed = new DelayedResponse(req, res);

    var subscription = { 'targetPath': targetPath,
            'request': req, 'response': res, 'delayed': delayed,
            'timestamp': utils.timestamp() };
    ldp.subscriptions[targetPath].push(subscription);

    var unsubscribe = function() {
        for (var i=0; i < ldp.subscriptions[targetPath].length; i++) {
            if (ldp.subscriptions[targetPath][i] === ldp.subscription) {
                ldp.subscriptions[targetPath] = ldp.subscriptions[targetPath].splice(i, 1);
                debug("UNSUBSCRIBED " + targetPath + " now " + ldp.subscriptions[targetPath].length);
                return;
            }
        }
        debug("ERROR - COULD NOT FIND SUB of " + subscription.timestamp +
            " for " + targetPath + " now " + ldp.subscriptions[targetPath].length);

    };

    delayed.on('error', function(e) {
        debug("DeleyaedResponse error " + e);
        unsubscribe();
    });
    delayed.on('done', function(e) {
        debug("DeleyaedResponse done " + e);
        unsubscribe();
    });
    delayed.on('abort', function(e) {// eg the other end disconnected
        debug("DeleyaedResponse abort " + e);
        unsubscribe();
    });
    delayed.on('cancel', function(e) {
        debug("DeleyaedResponse cancel " + e);
        unsubscribe();
    });
    delayed.wait();
    //slowFunction(delayed.wait());
    res.set('content-type', 'text/n3');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    // was: res.setTimeout
    req.socket.setTimeout(0); // Disable timeout (does this work??)

    debug("LONG POLL : Now " + ldp.subscriptions[targetPath].length +  " subscriptions for " +  targetPath);

};

// Find the patch operation itself withing a patch graph
exports.patchOperation = function(patchKB) {
    // debug("PatchKb = " + patchKB.statements.map(function(st){return st.toNT()}))
    var sts = patchKB.statementsMatching(undefined, PATCH('insert'), undefined, undefined)
        .concat(patchKB.statementsMatching(undefined, PATCH('delete'), undefined, undefined));
    return sts.length ? sts[0].subject : null;
};

exports.publishDelta = function (req, res, patchKB, targetURI){

    var operation = this.patchOperation(patchKB);
    if (!operation) {
        debug("Dummy patch, no opreration. Publish aborted.");
        return;
    }
    patchKB.add(operation, PATCH('logged'), new Date()); // @@ also add user
    var patchData = $rdf.serialize(undefined, patchKB, targetURI, 'text/n3');

    debug("Distributing change to " + req.originalUrl + ", patch is: " );
    debug("[[[" + patchData + "]]]\n");

    this.publishDelta_LongPoll(req, res, patchData, targetURI);

};

exports.publishDelta_LongPoll = function (req, res, patchData, targetURI){
    var ldp = req.app.locals.ldp;
    debug("    Long poll change subscription count " + (ldp.subscriptions[req.originalUrl] || []).length);
    if (! ldp.subscriptions[req.originalUrl]) return;
    ldp.subscriptions[req.originalUrl].map(function(subscription){
        debug("    Long poll change to " + req.originalUrl);
        if (ldp.leavePatchConnectionOpen) {
            subscription.response.write(patchData);
        } else {
            // debug("    --- headersSent 2  " + res.headersSent);
            subscription.response.write(patchData);
            subscription.response.end();
        }
    });

    ldp.subscriptions[req.originalUrl] = []; // one-off polll
    debug("LONG POLL : Now NO subscriptions for " +  targetURI);
};
