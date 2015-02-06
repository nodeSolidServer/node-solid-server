var li = require('li');

var logging = require('./logging.js');
var metadata = require('./metadata.js');
var ldpVocab = require('./vocab/ldp.js');

module.exports.addLink = function(res, value, rel) {
    var oldLink = res.get('Link');
    if (oldLink === undefined)
        res.set('Link', '<' + value + '>; rel=\'' + rel + '\'');
    else
        res.set('Link', oldLink + ', ' + '<' + value +
            '>; rel=\'' + rel + '\'');
};

module.exports.addLinks = function(res, fileMetadata) {
    if (fileMetadata.isResource)
        module.exports.addLink(res, ldpVocab.Resource, 'type');
    if (fileMetadata.isSourceResource)
        module.exports.addLink(res, ldpVocab.RDFSource, 'type');
    if (fileMetadata.isContainer)
        module.exports.addLink(res, ldpVocab.Container, 'type');
    if (fileMetadata.isBasicContainer)
        module.exports.addLink(res, ldpVocab.BasicContainer, 'type');
    if (fileMetadata.isDirectContainer)
        module.exports.addLink(res, ldpVocab.DirectContainer, 'type');
};

module.exports.parseMetadataFromHeader = function(linkHeader) {
    var fileMetadata = new metadata.Metadata();
    if (linkHeader === undefined)
        return fileMetadata;
    var links = linkHeader.split(',');
    for (var linkIndex in links) {
        var link = links[linkIndex];
        var parsedLinks = li.parse(link);
        console.log(parsedLinks, link);
        for (var rel in parsedLinks) {
            if (rel === 'type') {
                if (parsedLinks[rel] === ldpVocab.Resource)
                    fileMetadata.isResource = true;
                else if (parsedLinks[rel] === ldpVocab.RDFSource)
                    fileMetadata.isSourceResource = true;
                else if (parsedLinks[rel] === ldpVocab.Container)
                    fileMetadata.isContainer = true;
                else if (parsedLinks[rel] === ldpVocab.BasicContainer)
                    fileMetadata.isBasicContainer = true;
                else if (parsedLinks[rel] === ldpVocab.DirectContainer)
                    fileMetadata.isDirectContainer = true;
            }
        }
    }
    return fileMetadata;
};
