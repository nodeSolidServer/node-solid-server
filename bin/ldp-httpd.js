var ldp = require('../');
var express = require('express');

var argv = require('optimist').boolean('cors').boolean('v').argv;
if (argv.h || argv.help || argv['?']) {
    console.log([
        "usage: ldp-httpd [path] [options]",
        "",
        "options:",
        "  -p                 Port to use [3000]",
        "  -a                 Address to use [0.0.0.0]",
    //    "  -d                 Show directory listings [true]",
    //    "  -i                 Display autoIndex [true]",
    //    "  -e --ext           Default file extension if none supplied [none]",
        "  -v               log messages to console",
        "  --cors             Enable CORS via the 'Access-Control-Allow-Origin' header",
    //    "  -o                 Open browser window after starting the server",
        "  -c                 Set cache time (in seconds). e.g. -c10 for 10 seconds.",
        "                     To disable caching, use -c-1.",
        "  --changesSuffix sss Change the URI suffix used for the URI of a change stream",
        "",
        "  -S --ssl           Enable https.",
        "  -C --cert          Path to ssl cert file (default: cert.pem).",
        "  -K --key           Path to ssl key file (default: key.pem).",
        "",
        "  -h --help          Print this list and exit."
    ].join('\n'));
    process.exit();
}

// Windows support
if (process.platform !== 'win32') {
    process.on('SIGINT', function () {
        console.log('http-server stopped.');
        process.exit();
    });
}

var app = express();
app.use('/test', ldp(argv));
var server = app.listen(argv.port || process.env.PORT || 3000, function() {
    console.log('Listening on port %d', server.address().port);
});
