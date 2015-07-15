# ldnode

[![Build Status](https://travis-ci.org/linkeddata/ldnode.svg?branch=master)](https://travis-ci.org/linkeddata/ldnode)
[![NPM Version](https://img.shields.io/npm/v/ldnode.svg?style=flat)](https://npm.im/ldnode)
[![Gitter chat](https://img.shields.io/badge/gitter-join%20chat%20%E2%86%92-brightgreen.svg?style=flat)](http://gitter.im/linkeddata/ldnode)

Linked Data Platform server based on [rdflib.js](https://github.com/linkeddata/rdflib.js) and [node.js](https://nodejs.org/). This is all you need to run distributed linked data apps on top of the file system.

## Features

- [x] GET, PUT, POST and PATCH support
- [x] Proxy for cross-site data access
- [x] Access control using RDF ACLs
- [x] WebID+TLS Authentication
- [x] Mount as express' router
- [x] Command line tool
- [ ] Real-time live updates (using websokets)


## Install

```
npm install
```

## Usage

The library provides two APIs:

- `ldnode.createServer(settings)`: starts a ready to use Express app.
- `lnode(settings)`: creates an Express routes that you can mount in your existing express app

In case the `settings` is not passed, then it will start with the following default settings.

```javascript
{
  cache: 0, // Set cache time (in seconds), 0 for no cache
  live: true, // Enable live support through WebSockets
  root: './', // Root location on the filesystem to serve resources
  secret: 'node-ldp', // Express Session secret key
  cert: false, // Path to the ssl cert
  key: false, // Path to the ssl key
  mount: '/', // Where to mount Linked Data Platform
  webid: false, // Enable WebID+TLS authentication
  suffixAcl: '.acl', // Suffix for acl files
  suffixChanges: '.changes', // Suffix for acl files
  suffixSSE: '.events' // Suffix for SSE files
}
```

### Examples

#### Simple

You can create an ldnode ready to use Express server using `ldnode.createServer(opts)`

```javascript
var ldnode = require('ldnode')

var ldp = ldnode.createServer()
ldp.listen(3000, function() {
  // Started Linked Data Platform
})
```

#### Advanced

You can integrate it with your existing express app just by using `lnode(opts)`

```javascript
var ldnode = require('ldnode')
var app = require('express')()
app.use('/test', ldnode({ root:'/path/to/root/container' }))
app.listen(3000, function() {
  // Started Express app with ldp on '/test'
})
...
```

### Command line tool

    npm install -g ldnode

The command line tool has the following options

```
Usage: ldnode [options]

Options:
   -v, --verbose           Print the logs to console
   --version               Print current ldnode version
   -m, --mount             Where to mount Linked Data Platform (default: '/')
   -r, --root              Root location on the filesystem to serve resources
   -p, --port              Port to use
   -c, --cache             Set cache time (in seconds), 0 for no cache
   -K, --key               Path to the ssl key
   -C, --cert              Path to the ssl cert
   --webid                 Enable WebID+TLS authentication
   -s, --secret            HTTP Session secret key (e.g. "your secret phrase")
   --no-live               Disable live support through WebSockets
   -sA, --suffix-acl       Suffix for acl files (default: '.acl')
   -sC, --suffix-changes   Suffix for acl files (default: '.changes')
   -sE, --suffix-sse       Suffix for SSE files (default: '.events')

```

### Logging

If you are running your own app

```bash
$ DEBUG="ldnode:*" node app.js
```

or simply

```bash
$ ldnode -v
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
