/*jslint node: true*/
"use strict";

var $rdf = require('rdflib');
var redis = require('redis');

var logging = require('./logging.js');
var time = require('./time.js');

var subscriptions = {}; // Map URI to array of watchers
var SSEsubscriptions = {};

var PATCH = $rdf.Namespace('http://www.w3.org/ns/pim/patch#');

exports.subscribeToChanges_SSE = function(req, res) {
    var options = req.app.locals.ldp;

    var messageCount;
    console.log("Server Side Events subscription");
    var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',events'
    if (SSEsubscriptions[targetPath] === undefined) {
        SSEsubscriptions[targetPath] = redis.createClient();
    }
    var subscriber = SSEsubscriptions[targetPath];
    console.log("Server Side Events subscription: " + targetPath);

    subscriber.subscribe('updates');

    // In case we encounter an error...print it out to the console
    subscriber.on('error', function(err) {
        console.log("Redis Error: " + err);
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
    var options = req.app.locals.ldp;
    var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',changes'
    var publisherClient = SSEsubscriptions[targetPath];
    publisherClient.publish( 'updates', ('"' + targetPath + '" data changed visited') );
};

///////////////// Long poll

var DelayedResponse = require('http-delayed-response');
// try this.  https://www.npmjs.org/package/http-delayed-response


exports.subscribeToChangesLongPoll = function(req, res) {
    var options = req.app.locals.ldp;
    var targetPath = req.path.slice(0, - options.changesSuffix.length); // lop off ',changes'
    if (subscriptions[targetPath] === undefined) {
        subscriptions[targetPath] = [];
    }

    var delayed = new DelayedResponse(req, res);

    var subscription = { 'targetPath': targetPath,
            'request': req, 'response': res, 'delayed': delayed,
            'timestamp': time.timestamp() };
    subscriptions[targetPath].push(subscription);

    var unsubscribe = function() {
        for (var i=0; i < subscriptions[targetPath].length; i++) {
            if (subscriptions[targetPath][i] === subscription) {
                subscriptions[targetPath] = subscriptions[targetPath].splice(i, 1);
                logging.log("UNSUBSCRIBED " + targetPath + " now " + subscriptions[targetPath].length);
                return;
            }
        }
        logging.log("ERROR - COULD NOT FIND SUB of " + subscription.timestamp +
            " for " + targetPath + " now " + subscriptions[targetPath].length);

    };

    delayed.on('error', function(e) {
        logging.log("DeleyaedResponse error " + e);
        unsubscribe();
    });
    delayed.on('done', function(e) {
        logging.log("DeleyaedResponse done " + e);
        unsubscribe();
    });
    delayed.on('abort', function(e) {// eg the other end disconnected
        logging.log("DeleyaedResponse abort " + e);
        unsubscribe();
    });
    delayed.on('cancel', function(e) {
        logging.log("DeleyaedResponse cancel " + e);
        unsubscribe();
    });
    delayed.wait();
    //slowFunction(delayed.wait());
    res.set('content-type', 'text/n3');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    // was: res.setTimeout
    req.socket.setTimeout(0); // Disable timeout (does this work??)

    logging.log("LONG POLL : Now " + subscriptions[targetPath].length +  " subscriptions for " +  targetPath);

};

// Find the patch operation itself withing a patch graph
exports.patchOperation = function(patchKB) {
    // logging.log("PatchKb = " + patchKB.statements.map(function(st){return st.toNT()}))
    var sts = patchKB.statementsMatching(undefined, PATCH('insert'), undefined, undefined)
        .concat(patchKB.statementsMatching(undefined, PATCH('delete'), undefined, undefined));
    return sts.length ? sts[0].subject : null;
};

exports.publishDelta = function (req, res, patchKB, targetURI){

    var operation = this.patchOperation(patchKB);
    if (!operation) {
        logging.log("Dummy patch, no opreration. Publish aborted.");
        return;
    }
    patchKB.add(operation, PATCH('logged'), new Date()); // @@ also add user
    var patchData = $rdf.serialize(undefined, patchKB, targetURI, 'text/n3');

    logging.log("Distributing change to " + req.path + ", patch is: " );
    logging.log("[[[" + patchData + "]]]\n");

    this.publishDelta_LongPoll(req, res, patchData, targetURI);

};

exports.publishDelta_LongPoll = function (req, res, patchData, targetURI){
    var options = req.app.locals.ldp;
    logging.log("    Long poll change subscription count " + (subscriptions[req.path] || []).length);
    if (! subscriptions[req.path]) return;
    subscriptions[req.path].map(function(subscription){
        logging.log("    Long poll change to " + req.path);
        if (options.leavePatchConnectionOpen) {
            subscription.response.write(patchData);
        } else {
            // logging.log("    --- headersSent 2  " + res.headersSent);
            subscription.response.write(patchData);
            subscription.response.end();
        }
    });

    subscriptions[req.path] = []; // one-off polll
    logging.log("LONG POLL : Now NO subscriptions for " +  targetURI);
};

