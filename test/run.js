var ldnode = require('../index');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var ns = require('../vocab/ns.js').ns;
var address = 'https://localhost:3456/test/';

var ldp = ldnode.createServer({
    mount: '/test',
    root: __dirname + '/resources',
    key: __dirname + '/keys/key.pem',
    cert: __dirname + '/keys/cert.pem',
    webid: true
});
ldp.listen(3457);
