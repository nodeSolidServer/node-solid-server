var $rdf = require('rdflib')

module.exports.subscriptions = {}; // Map URI to array of watchers

module.exports.subscribeToChanges = function(req, res) {
    // lop off ',changes'
    var targetPath = req.path.slice(0, - options.changesSuffix.length);
    if (module.exports.subscriptions[targetPath] === undefined) {
        module.exports.subscriptions[targetPath] = [];
    }
    module.exports.subscriptions[targetPath].push({ 'request': req, 'response': res});
    res.set('content-type', 'text/n3');
    res.setTimeout(0); // Disable timeout (does this work??)
    consoleLog("\nGET CHANGES: Now " +
            module.exports.subscriptions[targetPath].length +
            " subscriptions for " +  targetPath);
}

module.exports.publishDelta = function (req, res, patchKB, targetURI) {
    if (! module.exports.subscriptions[req.path]) return;
    var target = $rdf.sym(targetURI); // @@ target below
    var data = $rdf.serialize(undefined, patchKB, targetURI, 'text/n3');
    consoleLog("-- Distributing change to " + req.path);
    consoleLog("                change is: <<<<<" + data + ">>>>>\n");
    module.exports.subscriptions[req.path].map(function(subscription) {
        subscription.response.write(data);
    });
}
