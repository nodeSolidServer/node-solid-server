# ldnode

[![Build Status](https://travis-ci.org/linkeddata/ldnode.svg?branch=master)](https://travis-ci.org/linkeddata/ldnode)

Linked Data Platform server based on [rdflib.js](https://github.com/linkeddata/rdflib.js) and [node.js](https://nodejs.org/). This is all you need to run distributed linked data apps on top of the file system.

## Features

- [x] GET, PUT and PATCH support
- [x] Proxy for cross-site data access
- [x] Access control using RDF ACLs
- [x] WebID Authentication
- [x] Real-time live updates (using websokets)
- [ ] Mount as express' router


## Install

```
npm install
```

## Command line tool

    npm install -g ldnode

The command line tool has the following options

    usage: ldnode [path] [options]
    
    options:
      --uriBase          Address, port, and default path of the server. (Example: http://localhost:3000/test/)
      --fileBase         Base location to serve resources. Requests whose paths do not have fileBase as a prefix will be ignored
      --live            Offer and support live updates
      -p                 Port to use
      -v                 Log messages to console
      --changesSuffix    The suffix that will be used to identify the requests that will subscribe to changes to the object requested. Defaults to ,changes
      --cors             Enable CORS via the 'Access-Control-Allow-Origin' header
      -c                 Set cache time (in seconds). e.g. -c10 for 10 seconds.
                     To disable caching, use -c-1.
      --changesSuffix sss Change the URI suffix used for the URI of a change stream
      --SSESuffix sss   Change the URI suffix used for the URI of a SSE stream
    
      -S --ssl           Enable https.
      -C --cert          Path to ssl cert file (default: cert.pem).
      -K --key           Path to ssl key file (default: key.pem).
    
      --webid            Enable WebID authentication
      --privateKey       Path to the private key used to enable webid authentication
      --cert             Path to the private key used to enable webid authentication
      -h --help          Print this list and exit.

## Tests

The tests assume that there is a running ldnode.

```bash
# on a terminal
make
# on another terminal
npm test
```
