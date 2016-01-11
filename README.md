# ldnode

[![Build Status](https://travis-ci.org/linkeddata/ldnode.svg?branch=master)](https://travis-ci.org/linkeddata/ldnode)
[![NPM Version](https://img.shields.io/npm/v/ldnode.svg?style=flat)](https://npm.im/ldnode)
[![Gitter chat](https://img.shields.io/badge/gitter-join%20chat%20%E2%86%92-brightgreen.svg?style=flat)](http://gitter.im/linkeddata/ldnode)

Ldnode implements the [Linked Data Platform](http://www.w3.org/TR/ldp/) and
[Solid](https://github.com/solid) in [NodeJS](https://nodejs.org/). This is all
you need to run distributed Linked Data apps on top of the file system.

You can run `ldnode` as a [command-line tool](https://github.com/linkeddata/ldnode/blob/master/README.md#command-line-tool) or as a [library](https://github.com/linkeddata/ldnode/blob/master/README.md#library) for your [Express](https://expressjs.com) app.

## Features

- [x] Linked Data Platform compliant HEAD, OPTIONS, GET, PUT, POST, PATCH, DELETE
- [x] Proxy for cross-site data access
- [x] Access control using [Web Access Control](http://www.w3.org/wiki/WebAccessControl)
- [x] WebID+TLS Authentication
- [x] Real-time live updates (using WebSockets)
- [ ] Identity provider for WebID+TLS

## Command Line Usage

    npm install -g ldnode

The command line tool has the following options

```
Usage: ldnode [options]

Options:
   -v, --verbose               Print the logs to console
   --version                   Print current ldnode version
   -m, --mount                 Where to mount Linked Data Platform (default: '/')
   -r, --root                  Root location on the filesystem to serve resources
   -p, --port                  Port to use
   -K, --key                   Path to the ssl key
   -C, --cert                  Path to the ssl cert
   --webid                     Enable WebID+TLS authentication
   -s, --secret                HTTP Session secret key (e.g. "your secret phrase")
   -fU, --force-user           Force a WebID to always be logged in (usefull when offline)
   -P, --proxy                 Use a proxy on example.tld/proxyPath
   --no-live                   Disable live support through WebSockets
   -sA, --suffix-acl           Suffix for acl files (default: '.acl')
   -sM, --suffix-meta          Suffix for metadata files (default: '.meta')
   -sE, --suffix-sse           Suffix for SSE files (default: '.events')
   --no-error-pages            Disable custom error pages (use Node.js default pages instead)
   --error-pages               Folder from which to look for custom error pages files (files must be named <error-code>.html -- eg. 500.html)
   --skin                      URI to a skin to load (default: https://linkeddata.github.io/warp/#/list/)

```

### Running the server

#### Pre-Requisites

In order to really get a feel for the Solid platform, and to test out `ldnode`,
you will need the following:

1. A WebID profile and browser certificate from one of the Solid-compliant
    identity providers, such as [databox.me](https://databox.me).

2. A server-side SSL certificate for `ldnode` to use (see the section below
    on creating a self-signed certificate for testing).

While these steps are technically optional (since you could launch it in
HTTP/LDP-only mode), you will not be able to use any actual Solid features
without them.

#### Solid server mode (HTTPS / WebID enabled)

To start `ldnode` in Solid server mode, you will need to enable the `--webid`
flag, and also pass in a valid SSL key and certificate files:

```bash
ldnode --webid --port 8443 --cert /path/to/cert --key /path/to/key
```

#### Creating a self-signed certificate

When deploying `ldnode` in production, we recommend that you go the
usual Certificate Authority route to generate your SSL certificate (as you
would with any website that supports HTTPS). However, for testing it locally,
you can easily generate a self-signed certificate for whatever domain you're
working with.

For example, here is how to generate a self-signed certificate for `localhost`
using the `openssl` library:

```bash
openssl genrsa 2048 > ../localhost.key
openssl req -new -x509 -nodes -sha1 -days 3650 -key ../localhost.key -subj '/CN=*.localhost' > ../localhost.cert

ldnode --webid --port 8443 --cert ../localhost.cert --key ../localhost.key -v
```

Note that this example creates the `localhost.cert` and `localhost.key` files
in a directory one level higher from the current, so that you don't
accidentally commit your certificates to `ldnode` while you're developing.

#### Accessing your server

If you started your `ldnode` server locally on port 8443 as in the example
above, you would then be able to visit `https://localhost:8443` in the browser
(ignoring the Untrusted Connection browser warnings as usual), where your
`ldnode` server would redirect you to the default viewer app (see the  `--skin`
server config parameter), which is usually the
[github.io/warp](https://linkeddata.github.io/warp/#/list/) file browser.

Accessing most Solid apps (such as Warp) will prompt you to select your browser
side certificate which contains a WebID from a Solid storage provider (see
the [pre-requisites](#pre-requisites) discussion above).

#### LDP-only server mode (HTTP, no WebID)

You can also use `ldnode` as a Linked Data Platform server in HTTP mode (note
that this will not support WebID authentication, and so will not be able to use
any Solid apps such as the default [Warp](https://github.com/linkeddata/warp)
app).

```bash
ldnode --port 8080
```

## Library

### Install Dependencies

```
npm install
```

### Library Usage

The library provides two APIs:

- `ldnode.createServer(settings)`: starts a ready to use
    [Express](http://expressjs.com) app.
- `lnode(settings)`: creates an [Express](http://expressjs.com) that you can
    mount in your existing express app.

In case the `settings` is not passed, then it will start with the following
default settings.

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
  suffixSSE: '.events', // Suffix for SSE files
  proxy: false, // Where to mount the proxy
  errorHandler: false, // function(err, req, res, next) to have a custom error handler
  errorPages: false // specify a path where the error pages are
}
```

Have a look at the following examples or in the
[`examples/`](https://github.com/linkeddata/ldnode/tree/master/examples) folder
for more complex ones

##### Simple Example

You can create an `ldnode` server ready to use using `ldnode.createServer(opts)`

```javascript
var ldnode = require('ldnode')
var ldp = ldnode.createServer({
    key: '/path/to/sslKey.pem',
    cert: '/path/to/sslCert.pem',
    webid: true
})
ldp.listen(3000, function() {
  // Started Linked Data Platform
})
```

##### Advanced Example

You can integrate `ldnode` in your existing [Express](https://expressjs.org)
app, by mounting the `ldnode` app on a specific path using `lnode(opts)`.

```javascript
var ldnode = require('ldnode')
var app = require('express')()
app.use('/test', ldnode(yourSettings))
app.listen(3000, function() {
  // Started Express app with ldp on '/test'
})
...
```

##### Logging

Run your app with the `DEBUG` variable set:

```bash
$ DEBUG="ldnode:*" node app.js
```

## Testing

```bash
$ npm test
# running the tests with logs
$ DEBUG="ldnode:*" npm test
```

In order to test a single component, you can run

```javascript
npm run test-(acl|formats|params|patch)
```

## Contributing

`ldnode` is only possible due to the excellent work of the following contributors:

<table>
  <tbody>
    <tr>
      <th align="left">Tim Berners-Lee</th>
      <td><a href="https://github.com/timbl">GitHub/timbl</a></td>
      <td><a href="http://twitter.com/timberners_lee">Twitter/@timberners_lee</a></td>
      <td><a href="https://www.w3.org/People/Berners-Lee/card#i">webid</a></td>
    </tr>
    <tr>
      <th align="left">Nicola Greco</th>
      <td><a href="https://github.com/nicola">GitHub/nicola</a></td>
      <td><a href="http://twitter.com/nicolagreco">Twitter/@nicolagreco</a></td>
      <td><a href="https://nicola.databox.me/profile/card#me">webid</a></td>
    </tr>
    <tr>
      <th align="left">Martin Martinez Rivera</th>
      <td><a href="https://github.com/martinmr">GitHub/martinmr</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <th align="left">Andrei Sambra</th>
      <td><a href="https://github.com/deiu">GitHub/deiu</a></td>
      <td><a href="http://twitter.com/deiu">Twitter/@deiu</a></td>
      <td><a href="https://deiu.me/profile#me">webid</a></td>
    </tr>
  </tbody>
</table>

#### Do you want to contribute?

- [Join us in Gitter](https://gitter.im/linkeddata/chat) to help with development or to hang out with us :)
- [Create a new issue](https://github.com/linkeddata/ldnode/issues/new) to report bugs
- [Fix an issue](https://github.com/linkeddata/ldnode/issues)

Have a look at [CONTRIBUTING.md](https://github.com/linkeddata/ldnode/blob/master/CONTRIBUTING.md).

## License

MIT
