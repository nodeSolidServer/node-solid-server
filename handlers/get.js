var mime = require('mime');
var fs = require('fs');

var header = require('../header.js');
var metadata = require('../metadata.js');
var options = require('../options.js');
var logging = require('../logging.js');
var file = require('../fileStore.js');

module.exports.handler = function(req, res){
    get(req, res, true);
};

module.exports.headHandler = function(req, res) {
    logging.log("HEAD ssdss");
    get(req, res, false);
};

var get = function(req, res, includeBody) {
    // Add request to subscription service
    if (('' +req.path).slice(- options.changesSuffix.length) ===
            options.changesSuffix) {
        logging.log("Subscribed to ", req.path);
        return subscription.subscribeToChanges(req, res);
    }
    // Set headers
    res.header('MS-Author-Via' , 'SPARQL' );
    // Note not yet in
    // http://www.iana.org/assignments/link-relations/link-relations.xhtml
    header.addLink(res, req.path + options.changesSuffix, 'changes' );
    if (includeBody)
        logging.log('GET -- ' +req.path);
    else
        logging.log('HEAD -- ' +req.path);
    var filename = file.uriToFilename(req.path);
    fs.stat(filename, function(err, stats) {
        if (err) {
            logging.log(' -- read error ' + err);
            res.status(404).send("Can't read file: "+ err);
        } else if (stats.isDirectory()) {
            if (includeBody) {
                metadata.readContainerMetadata(filename, containerHandler);
            }
            else {
                res.status(200).send();
                res.end();
            }
        } else {
            if (includeBody)
                fs.readFile(filename, fileHandler);
            else {
                res.status(200).send();
                res.end();
            }
        }
    });

    var fileHandler = function(err, data) {
       if (err) {
            logging.log(' -- read error ' + err);
            res.status(404).send("Can't read file: "+ err);
        } else {
            logging.log(' -- read Ok ' + data.length);
            ct = mime.lookup(filename);
            res.set('content-type', ct);
            logging.log(' -- content-type ' + ct);
            res.send(data);
        }
    };

    var containerHandler = function(err, rawContainer) {
        if (err) {
            res.status(404).send("Not a container");
        } else {
            var containerGraph;
            try {
                // TODO: parse rawContainer to check is a valid graph
                res.status(200).send(rawContainer);
            } catch (parseErr) {
                res.status(404).send("Not a valid container");
            }
        }
    };
};
