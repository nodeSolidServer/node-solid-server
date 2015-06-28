ldnode
==============

All you need to run distributed linked data apps on top of a bit of file system.  Typically used as a proxy, with Apache doing the ACLs and GETs, just to do the fast real-time patch of data resources.

Linked Data Platform server based on rdflib.js and node.js

Using the rdflib.js library originally developed for the browser environment
and since ported to node.js, a linked data server supporting the POST and PATCH.
Minimum requirement is to suport the client side of the same library, which currently (September 2014)
uses a form of SPARQL-Patch via POST.

Features

- handles GET, PUT and PATCH
- includes proxy for cross-site data access

Goals (see issues):

- provide Access control using RDF ACLs
- provide authentication using webid
- real-time live updates using websokets (etc)


Install
-------

    npm install

All dependencies are installed to the local node_modules directory and no other steps are necessary.


Command line tool
-----------------

You can run `ldnode` straight from your command line, by running `server.js` or installing `ldnode` globally.


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

Tests
------

To run the test suite run

    npm test

from the main directory. The test suite assumes the test server is already running. To start the server run

    make

from the main directory in another terminal.

There is another suite of tests in the test directory that covers the SPARQL-PATCH functionality. To run it run

    make

from the test directory. This suite also assumes the test server is already running. Eventually all tests in this second suite will be moved to the first one.
