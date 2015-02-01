var fs = require('fs');
var $rdf = require('rdflib');
var path = require('path');
var uuid = require('node-uuid');

var logging = require('./logging.js');
var metadata = require('./metadata.js');
var options = require('./options.js');

var rdfVocab = require('./vocab/rdf.js');
var ldpVocab = require('./vocab/ldp.js');

var addUriTriple = function(kb, s, o, p) {
    kb.add(kb.sym(s), kb.sym(o), kb.sym(p));
};

var usedURIs = {};

module.exports.createRootContainer = function() {
    if (!metadata.hasMetadata(options.fileBase)) {
        logging.log("Creating root metadata");
        var rootMetadata = new metadata.Metadata();
        rootMetadata.filename = options.fileBase;
        rootMetadata.isResource = true;
        rootMetadata.isContainer = true;
        rootMetadata.isSourceResource = true;
        rootMetadata.isBasicContainer = true;
        metadata.writeMetadata(options.fileBase, rootMetadata,
            writeCallback);
    }
    //TODO handle case when .container file does not exist

    function writeCallback(err) {
        logging.log(options.pathStart);
        if (err) {
            process.exit(1);
        } else if (!metadata.hasContainerMetadata(options.fileBase)) {
            var rootContainer = $rdf.graph();
            addUriTriple(rootContainer, options.pathStart, rdfVocab.type,
                ldpVocab.Resource);
            addUriTriple(rootContainer, options.pathStart, rdfVocab.type,
                ldpVocab.RDFSource);
            addUriTriple(rootContainer, options.pathStart, rdfVocab.type,
                ldpVocab.Container);
            addUriTriple(rootContainer, options.pathStart, rdfVocab.type,
                ldpVocab.BasicContainer);
            rootContainer.add(rootContainer.sym(options.pathStart),
                rootContainer.sym('http://purl.org/dc/terms/title'),
                '"Root Container"');
            var serializedContainer = $rdf.serialize(undefined, rootContainer,
                options.pathStart, 'text/turtle');
            logging.log("Root container: ", serializedContainer);
            metadata.writeContainerMetadata(options.fileBase,
                serializedContainer, function(err) {
                    if (err) {
                        //TODO handle error
                        logging.log("Could not write root container");
                    } else {
                        logging.log("Wrote root container");
                    }
                });
        }
    }
};

module.exports.createNewContainer = function(container, type, callback) {
    fs.mkdir(container, function(err) {
        if (err) {
            this.releaseResourceUri(container);
            callback(err);
        } else {
            var containerMetadata = new metadata.Metadata();
            containerMetadata.filename = container;
            containerMetadata.isResource = true;
            containerMetadata.isContainer = true;
            containerMetadata.isSourceResource = true;
            if (type === ldpVocab.BasicContainer)
                containerMetadata.isBasicContainer = true;
            if (type === ldpVocab.DirectContainer)
                containerMetadata.isDirectContainer = true;
            metadata.writeMetadata(options.fileBase, rootMetadata, writeCallback);
        }
    });

    function writeCallback(err) {
        if (err) {
            this.releaseResourceUri(container);
            callback(err);
        } else {
            var newContainer = $rdf.graph();
            addUriTriple(newContainer, options.pathStart, rdfVocab.type,
                ldpVocab.Resource);
            addUriTriple(newContainer, options.pathStart, rdfVocab.type,
                ldpVocab.RDFSource);
            addUriTriple(newContainer, options.pathStart, rdfVocab.type,
                ldpVocab.Container);
            if (type === ldpVocab.BasicContainer)
                addUriTriple(newContainer, options.pathStart, rdfVocab.type,
                    ldpVocab.BasicContainer);
            else if (type === ldpVocab.DirectContainer)
                addUriTriple(newContainer, options.pathStart, rdfVocab.type,
                    ldpVocab.DirectContainer);

            newContainer.add(newContainer.sym(options.pathStart),
                newContainer.sym('http://purl.org/dc/terms/title'),
                container);
            var serializedContainer = $rdf.serialize(undefined, newContainer,
                container, 'text/turtle');
            metadata.writeContainerMetadata(container, serializedContainer,
                function(err) {
                    this.releaseResourceUri(container);
                    if (err) {
                        callback(err);
                    } else {
                        logging.log("Wrote new container");
                        callback(err);
                    }
                });
        }
    }

};

module.exports.createResourceUri = function(containerURI, slug) {
    var newPath;
    if (slug) {
        newPath = path.join(containerURI, slug);
    } else {
        newPath = path.join(containerURI, uuid.v1());
    }
    if (!(fs.existsSync(newPath) || containerURI in usedURIs)) {
        usedURIs[newPath] = true;
    } else {
        return null;
    }
    return newPath;
};

module.exports.releaseResourceUri = function(uri) {
    delete usedURIs[uri];
};

module.exports.verify = function(containerGraph, type) {
    //TODO work on this method
    var results = containerGraph.each(undefined, "a", type);
    if (results.length === 1) {
        return true;
    } else {
        return false;
    }
};

module.exports.verifyDirectContainer = function(containerGraph) {

};

module.exports.createNewResource = function(containerPath, containerGraph,
    resourcePath, resourceGraph, resourceMetadata, callback) {
    var containerURI = path.relative(options.fileBase, containerPath);
    var resourceURI = path.relative(options.fileBase, resourcePath);
    //TODO replace url with resource url
    var rawResource = $rdf.serialize(undefined,
        resourceGraph, options.baseUri + resourceURI, 'text/turtle');
    logging.log("Writing new resource to ", resourcePath);
    logging.log(rawResource);
    fs.writeFile(resourcePath, rawResource, writeResourceCallback);

    function writeResourceCallback(err) {
        if (err) {
            container.releaseResourceUri(resoucePath);
            callback(err);
        } else {
            addUriTriple(containerGraph, containerURI, ldpVocab.contains,
                resourceURI);
            var rawContainer = $rdf.serialize(undefined, containerGraph,
                options.uriBase, 'text/turtle');
            metadata.writeContainerMetadata(containerPath, rawContainer,
                writeContainerCallback);
        }
    }

    function writeContainerCallback(err) {
        if (err) {
            module.exports.releaseResourceUri(resourcePath);
            return callback(err);
        } else {
            metadata.writeMetadata(resourcePath, resourceMetadata,
                writeMetadataCallback);
        }
    }

    function writeMetadataCallback(err) {
        module.exports.releaseResourceUri(resourcePath);
        return callback(err);
    }
};

module.exports.createNewContainer = function(containerPath, containerGraph,
    containerMetadata, callback) {
    fs.mkdir(containerPath, mkdirCallback);

    function mkdirCallback(err) {
        if (err) {
            module.exports.releaseResourceUri(containerPath);
            return callback(err);
        } else {
            var rawContainer = $rdf.serialize(undefined, containerGraph,
                options.uriBase, 'text/turtle');
            metadata.writeContainerMetadata(containerPath, rawContainer,
                writeContainerCallback);
        }
    }

    function writeContainerCallback(err) {
        if (err) {
            module.exports.releaseResourceUri(containerPath);
            return callback(err);
        } else {
            metadata.writeMetadata(containerPath, containerMetadata,
                writeMetadataCallback);
        }
    }

    function writeMetadataCallback(err) {
        module.exports.releaseResourceUri(containerPath);
        return callback(err);
    }
};
