# ldnode

[![Build Status](https://travis-ci.org/linkeddata/ldnode.svg?branch=master)](https://travis-ci.org/linkeddata/ldnode)
[![NPM Version](https://img.shields.io/npm/v/ldnode.svg?style=flat)](https://npm.im/ldnode)
[![Gitter chat](https://img.shields.io/badge/gitter-join%20chat%20%E2%86%92-brightgreen.svg?style=flat)](http://gitter.im/linkeddata/ldnode)

Linked Data Platform server based on [rdflib.js](https://github.com/linkeddata/rdflib.js) and [node.js](https://nodejs.org/). This is all you need to run distributed linked data apps on top of the file system.

## Features

- [x] GET, PUT and PATCH support
- [x] Proxy for cross-site data access
- [x] Access control using RDF ACLs
- [x] WebID Authentication
- [x] Real-time live updates (using websokets)
- [x] Mount as express' router


## Install

```
npm install
```

## Usage

### Library
#### Simple

```javascript
var ldnode = require('ldnode')

var ldp = ldnode.createServer({
  uri: "http://example.com/test/",
  base: __dirname + '/test/'
})
ldp.listen(1234, function() {
  // Started Linked Data Platform
})
```

#### Advanced

You can integrate it with your existing express app

```javascript
var ldnode = require('ldnode')
var app = require('express')()
app.use('/test', ldnode(opts))
...
```

##### Logging

If you are running your own app

```bash
$ DEBUG="ldnode:*" node app.js
```

or simply

```bash
$ ldnode -v
```

### Command line tool

    npm install -g ldnode

The command line tool has the following options

```
Usage: ldnode [options]

Options:
   -v, --verbose           Print the logs to console
   --version               Print current ldnode version
   -u, --uri               Default address of the server (e.g. http[s]://host:port/path)
   -b, --base              Base location to serve resources
   -p, --port              Port to use
   -c, --cache             Set cache time (in seconds), 0 for no cache
   -K, --key               Path to the ssl key
   -C, --cert              Path to the ssl cert
   --webid                 Enable WebID+TLS authentication
   -s, --secret            HTTP Session secret key (e.g. "your secret phrase")
   -s, --no-live           Disable live support through WebSockets
   -sA, --suffix-acl       Suffix for acl files (default: '.acl')
   -sC, --suffix-changes   Suffix for acl files (default: '.changes')
   -sE, --suffix-sse       Suffix for SSE files (default: '.events')
```

## Tests

The tests assume that there is a running ldnode.

```bash
$ npm test
# running the tests with logs
$ DEBUG="ldnode:*" npm test
```

## License

MIT
