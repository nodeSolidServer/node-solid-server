var fs = require('fs');
var rimraf = require('rimraf');

var file = require('../fileStore.js');
var logging = require('../logging.js');
var metadata = require('../metadata.js');

module.exports.handler = function(req, res) {
    logging.log('DELETE -- ' + req.path);
    //    res.header('MS-Author-Via' , 'SPARQL' );
    var filename = file.uriToFilename(req.path);
    fs.stat(filename, function(err, stats) {
        if (err) {
            logging.log("  ### DELETE unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err);
        } else if (stats.isDirectory()) {
            if (filename.charAt(filename.length - 1) !== '/')
                filename += '/';
            metadata.deleteContainerMetadata(filename, containerCallback);
        } else {
            fs.unlink(filename, fileCallback);
        }
    });

    function fileCallback(err) {
        if (err) {
            logging.log("   ### DELETE unlink() error: " + err);
            return res.status(404).send("Can't delete file: " + err); // @@ best
        } else {
            //TODO remove file from container
            metadata.deleteMetadata(filename, function(err) {});
            logging.log(" -- delete Ok " + req.text.length);
            res.sendStatus(200);
        }
    }

    function containerCallback(err) {
        if (err) {
            logging.log("DELETE unlink() error: " + err);
            return res.status(404).send("Can't delete container: " + err);
        } else {
            metadata.deleteMetadata(filename, function(err) {});
            logging.log(" -- delete Ok " + req.text.length);
            res.sendStatus(200);
        }
    }
};
