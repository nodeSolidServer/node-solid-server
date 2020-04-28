# solid-server in Node

[![](https://img.shields.io/badge/project-Solid-7C4DFF.svg?style=flat-square)](https://github.com/solid/solid)
[![Build Status](https://travis-ci.org/solid/node-solid-server.svg?branch=master&style=flat-square)](https://travis-ci.org/solid/node-solid-server)
[![NPM Version](https://img.shields.io/npm/v/solid-server.svg?style=flat-square)](https://npm.im/solid-server)
[![Gitter chat](https://img.shields.io/badge/gitter-join%20chat%20%E2%86%92-brightgreen.svg?style=flat-square)](http://gitter.im/solid/node-solid-server)

> [Solid](https://github.com/solid) server in [NodeJS](https://nodejs.org/)

`solid-server` lets you run a Solid server on top of the file-system. You can use it as a [command-line tool](https://github.com/solid/node-solid-server/blob/master/README.md#command-line-usage) (easy) or as a [library](https://github.com/solid/node-solid-server/blob/master/README.md#library-usage) (advanced).

## Solid Features supported
- [x] [Linked Data Platform](http://www.w3.org/TR/ldp/)
- [x] [Web Access Control](http://www.w3.org/wiki/WebAccessControl)
- [x] [WebID+TLS Authentication](https://www.w3.org/2005/Incubator/webid/spec/tls/)
- [x] [Real-time live updates](https://github.com/solid/solid-spec#subscribing) (using WebSockets)
- [x] Identity provider for WebID
- [x] CORS proxy for cross-site data access
- [x] Group members in ACL
- [x] Email account recovery

## Command Line Usage

### Install

You can install and run the server either using Node.js directly or using
[Docker](https://www.docker.com/).  This and the following sections describe the
first approach, for the second approach see the section [use Docker](#use-docker)
Section below.

To install, first install [Node](https://nodejs.org/en/) and then run the following

```bash
$ npm install -g solid-server
```

### Run a single-user server (beginner)

The easiest way to setup `solid-server` is by running the wizard. This will create a `config.json` in your current folder

```bash
$ solid init
```
**Note**: If prompted for an SSL key and certificate, follow the instructions below.

To run your server, simply run `solid start`:

```bash
$ solid start
# Solid server (solid v0.2.24) running on https://localhost:8443/
```

If you prefer to use flags instead, the following would be the equivalent

```bash
$ solid start --port 8443 --ssl-key path/to/ssl-key.pem --ssl-cert path/to/ssl-cert.pem
# Solid server (solid v0.2.24) running on https://localhost:8443/
```

If you want to run `solid` on a particular folder (different from the one you are in, e.g. `path/to/folder`):

```bash
$ solid start --root path/to/folder --port 8443 --ssl-key path/to/ssl-key.pem --ssl-cert path/to/ssl-cert.pem
# Solid server (solid v0.2.24) running on https://localhost:8443/
```

### Running in development environments

Solid requires SSL certificates to be valid, so you cannot use self-signed certificates. To switch off this security feature in development environments, you can use the `bin/solid-test` executable, which unsets the `NODE_TLS_REJECT_UNAUTHORIZED` flag and sets the `rejectUnauthorized` option.

If you want to run in multi-user mode on localhost, do the following:
* configure the server as such with `bin/solid-test init`
* start the server with `bin/solid-test start`
* visit https://localhost:8443 and register a user, for instance 'myusername'.
* Edit your hosts file and add a line `127.0.0.1 myusername.localhost`
* Now you can visit https://myusername.localhost:8443.

##### How do I get an SSL key and certificate?
You need an SSL certificate from a _certificate authority_, such as your domain provider or [Let's Encrypt!](https://letsencrypt.org/getting-started/).

For testing purposes, you can use `bin/solid-test` with a _self-signed_ certificate, generated as follows:

```
$ openssl req -outform PEM -keyform PEM -new -x509 -sha256 -newkey rsa:2048 -nodes -keyout ../privkey.pem -days 365 -out ../fullchain.pem

```

Note that this example creates the `fullchain.pem` and `privkey.pem` files
in a directory one level higher from the current, so that you don't
accidentally commit your certificates to `solid` while you're developing.

If you would like to get rid of the browser warnings, import your fullchain.pem certificate into your 'Trusted Root Certificate' store.

### Run multi-user server (intermediate)

You can run `solid` so that new users can sign up, in other words, get their WebIDs _username.yourdomain.com_.

Pre-requisites:
- Get a [Wildcard Certificate](https://en.wikipedia.org/wiki/Wildcard_certificate)
- Add a Wildcard DNS record in your DNS zone (e.g.`*.yourdomain.com`)
- (If you are running locally) Add the line `127.0.0.1 *.localhost` to `/etc/hosts`

```bash
$ solid init
..
? Allow users to register their WebID (y/N) # write `y` here
..
$ solid start
```

Otherwise, if you want to use flags, this would be the equivalent

```bash
$ solid start --multiuser --port 8443 --ssl-cert /path/to/cert --ssl-key /path/to/key --root ./data
```

Your users will have a dedicated folder under `./data` at `./data/<username>.<yourdomain.tld>`. Also, your root domain's website will be in `./data/<yourdomain.tld>`. New users can create accounts on `/api/accounts/new` and create new certificates on `/api/accounts/cert`. An easy-to-use sign-up tool is found on `/api/accounts`.

### Running Solid behind a reverse proxy (such as NGINX)
See [Running Solid behind a reverse proxy](https://github.com/solid/node-solid-server/wiki/Running-Solid-behind-a-reverse-proxy).

##### How can I send emails to my users with my Gmail?

> To use Gmail you may need to configure ["Allow Less Secure Apps"](https://www.google.com/settings/security/lesssecureapps) in your Gmail account unless you are using 2FA in which case you would have to create an [Application Specific](https://security.google.com/settings/security/apppasswords) password. You also may need to unlock your account with ["Allow access to your Google account"](https://accounts.google.com/DisplayUnlockCaptcha) to use SMTP.

also add to `config.json`
``` 
  "useEmail": true,
  "emailHost": "smtp.gmail.com",
  "emailPort": "465",
  "emailAuthUser": "xxxx@gmail.com",
  "emailAuthPass": "gmailPass"
```

### Upgrading from version 4
To upgrade from version 4 to the current version 5, you need to run a migration script, as explained in the [v5 upgrade notes](https://github.com/solid/node-solid-server/blob/master/CHANGELOG.md#500-upgrade-notes).

Also, be aware that starting from version 5, third-party apps are untrusted by default. To trust a third-party app, before you can log in to it, you first need to go to your profile at https://example.com/profile/card#me (important to include the '#me' there), and then hover over the 'card' header to reveal the context menu. From there, select the 'A' symbol to go to your trusted applications pane, where you can whitelist third-party apps before using them. See also https://github.com/solid/node-solid-server/issues/1142 about streamlining this UX flow.

### Extra flags (expert)
The command line tool has the following options

```
$ solid

  Usage: solid [options] [command]

  Commands:
    init [options]    create solid server configurations
    start [options]   run the Solid server

  Options:
    -h, --help     output usage information
    -V, --version  output the version number


$ solid init --help

  Usage: init [options]
  Create solid server configurations

  Options:
    -h, --help  output usage information
    --advanced  Ask for all the settings


$ solid start --help

  Usage: start [options]

  run the Solid server


  Options:

    --root [value]                Root folder to serve (default: './data')
    --port [value]                SSL port to use
    --server-uri [value]          Solid server uri (default: 'https://localhost:8443')
    --webid                       Enable WebID authentication and access control (uses HTTPS)
    --mount [value]               Serve on a specific URL path (default: '/')
    --config-path [value]
    --config-file [value]
    --db-path [value]
    --auth [value]                Pick an authentication strategy for WebID: `tls` or `oidc`
    --owner [value]               Set the owner of the storage (overwrites the root ACL file)
    --ssl-key [value]             Path to the SSL private key in PEM format
    --ssl-cert [value]            Path to the SSL certificate key in PEM format
    --no-reject-unauthorized      Accept self-signed certificates
    --multiuser                   Enable multi-user mode
    --idp [value]                 Obsolete; use --multiuser
    --no-live                     Disable live support through WebSockets
    --proxy [value]               Obsolete; use --corsProxy
    --cors-proxy [value]          Serve the CORS proxy on this path
    --suppress-data-browser       Suppress provision of a data browser
    --data-browser-path [value]   An HTML file which is sent to allow users to browse the data (eg using mashlib.js)
    --suffix-acl [value]          Suffix for acl files (default: '.acl')
    --suffix-meta [value]         Suffix for metadata files (default: '.meta')
    --secret [value]              Secret used to sign the session ID cookie (e.g. "your secret phrase")
    --error-pages [value]         Folder from which to look for custom error pages files (files must be named <error-code>.html -- eg. 500.html)
    --force-user [value]          Force a WebID to always be logged in (useful when offline)
    --strict-origin               Enforce same origin policy in the ACL
    --use-email                   Do you want to set up an email service?
    --email-host [value]          Host of your email service
    --email-port [value]          Port of your email service
    --email-auth-user [value]     User of your email service
    --email-auth-pass [value]     Password of your email service
    --use-api-apps                Do you want to load your default apps on /api/apps?
    --api-apps [value]            Path to the folder to mount on /api/apps
    --redirect-http-from [value]  HTTP port or ','-separated ports to redirect to the solid server port (e.g. "80,8080").
    --server-name [value]         A name for your server (not required, but will be presented on your server's frontpage)
    --server-description [value]  A description of your server (not required)
    --server-logo [value]         A logo that represents you, your brand, or your server (not required)
    --enforce-toc                 Do you want to enforce Terms & Conditions for your service?
    --toc-uri [value]             URI to your Terms & Conditions
    --support-email [value]       The support email you provide for your users (not required)
    -q, --quiet                   Do not print the logs to console
    -h, --help                    output usage information
 ```

Instead of using flags, these same options can also be configured via environment variables taking the form of `SOLID_` followed by the `SNAKE_CASE` of the flag. For example `--api-apps` can be set via the `SOLID_API_APPS`environment variable, and `--serverUri` can be set with `SOLID_SERVER_URI`.

CLI flags take precedence over Environment variables, which take precedence over entries in the config file.

Configuring Solid via the config file can be a concise and convenient method and is the generally recommended approach. CLI flags can be useful when you would like to override a single configuration parameter, and using environment variables can be helpful in situations where you wish to deploy a single generic Docker image to multiple environments.

## Use Docker

Pull with:

```bash
docker pull nodesolidserver/node-solid-server
```

Run with:
```bash
docker run -p 8443:8443 --name solid nodesolidserver/node-solid-server
```

This will enable you to login to solid on https://localhost:8443 and then create a new account
but not yet use that account. After a new account is made you will need to create an entry for 
it in your local (/etc/)hosts file in line with the account and subdomain, i.e. --
```pre
127.0.0.1	newsoliduser.localhost
```
Then you'll be able to use solid as intended.

You can modify the config within the docker container as follows:

 - Copy the config to the current directory with: 
   ```
   docker cp solid:/usr/src/app/config.json .
   ```
 - Edit the `config.json` file
 - Copy the file back with 
   ```
   docker cp config.json solid:/usr/src/app/
   ```
 - Restart the server with 
   ```
   docker restart solid
   ```

If you want to help improve the Docker image, then you can build it locally with:
```bash
git clone https://github.com/solid/node-solid-server
cd node-solid-server
docker build .
```
We have automatic builds set up, so commits to master will trigger a build of https://hub.docker.com/r/nodesolidserver/node-solid-server.

## Library Usage

### Install Dependencies

```
npm install
```

### Library Usage

The library provides two APIs:

- `solid.createServer(settings)`: starts a ready to use
    [Express](http://expressjs.com) app.
- `lnode(settings)`: creates an [Express](http://expressjs.com) that you can
    mount in your existing express app.

In case the `settings` is not passed, then it will start with the following
default settings.

```javascript
{
  cache:        0,           // Set cache time (in seconds), 0 for no cache
  live:         true,        // Enable live support through WebSockets
  root:         './',        // Root location on the filesystem to serve resources
  secret:       'node-ldp',  // Express Session secret key
  cert:         false,       // Path to the ssl cert
  key:          false,       // Path to the ssl key
  mount:        '/',         // Where to mount Linked Data Platform
  webid:        false,       // Enable WebID+TLS authentication
  suffixAcl:    '.acl',      // Suffix for acl files
  corsProxy:    false,       // Where to mount the CORS proxy
  errorHandler: false,       // function(err, req, res, next) to have a custom error handler
  errorPages:   false        // specify a path where the error pages are
}
```

Have a look at the following examples or in the
[`examples/`](https://github.com/solid/node-solid-server/tree/master/examples) folder
for more complex ones

##### Simple Example

You can create a `solid` server ready to use using `solid.createServer(opts)`

```javascript
var solid = require('solid-server')
var ldp = solid.createServer({
    key: '/path/to/sslKey.pem',
    cert: '/path/to/sslCert.pem',
    webid: true
})
ldp.listen(3000, function() {
  // Started Linked Data Platform
})
```

##### Advanced Example

You can integrate `solid` in your existing [Express](https://expressjs.org)
app, by mounting the `solid` app on a specific path using `lnode(opts)`.

```javascript
var solid = require('solid-server')
var app = require('express')()
app.use('/test', solid(yourSettings))
app.listen(3000, function() {
  // Started Express app with ldp on '/test'
})
...
```

##### Logging

Run your app with the `DEBUG` variable set:

```bash
$ DEBUG="solid:*" node app.js
```

## Testing `solid` Locally

#### Pre-Requisites

In order to really get a feel for the Solid platform, and to test out `solid`,
you will need the following:

1. A WebID profile and browser certificate from one of the Solid-compliant
    identity providers, such as [solid.community](https://solid.community).

2. A server-side SSL certificate for `solid` to use (see the section below
    on creating a self-signed certificate for testing).

While these steps are technically optional (since you could launch it in
HTTP/LDP-only mode), you will not be able to use any actual Solid features
without them.

#### Creating a certificate for local testing

When deploying `solid` in production, we recommend that you go the
usual Certificate Authority route to generate your SSL certificate (as you
would with any website that supports HTTPS). However, for testing it locally,
you can easily [generate a self-signed certificate for whatever domain you're
Working with](https://github.com/solid/node-solid-server#how-do-i-get-an-ssl-key-and-certificate).

#### Accessing your server

If you started your `solid` server locally on port 8443 as in the example
above, you would then be able to visit `https://localhost:8443` in the browser
(ignoring the Untrusted Connection browser warnings as usual), where your
`solid` server would redirect you to the default data viewer app.

#### Editing your local `/etc/hosts`

To test certificates and account creation on subdomains, `solid`'s test suite
uses the following localhost domains: `nic.localhost`, `tim.localhost`, and
`nicola.localhost`. You will need to create host file entries for these, in
order for the tests to pass.

Edit your `/etc/hosts` file, and append:

```
# Used for unit testing solid
127.0.0.1 nic.localhost
127.0.0.1 tim.localhost
127.0.0.1 nicola.localhost
```

#### Running the Unit Tests

```bash
$ npm test
# running the tests with logs
$ DEBUG="solid:*" npm test
```

In order to test a single component, you can run

```javascript
npm run test-(acl|formats|params|patch)
```

## Blacklisted usernames

By default Solid will not allow [certain usernames as they might cause
confusion or allow vulnerabilies for social engineering](https://github.com/marteinn/The-Big-Username-Blacklist).
This list is configurable via `config/usernames-blacklist.json`. Solid does not
blacklist profanities by default.

## Quota

By default, a file `serverSide.ttl.inactive` will be installed to new
PODs. If you rename it to `serverSide.ttl`, it will currently set a
quota for disk usage.  This file is not writeable to users, only
server administrators who are authorized on the backend can modify
it. It is currently adviceable to remove it or set it inactive rather
than set a large quota, because the current implementation will impair
write performance if there is a lot of data.

## Get help and contribute

Solid is only possible because of a large community of [contributors](https://github.com/solid/node-solid-server/blob/master/CONTRIBUTORS.md).
A heartfelt thank you to everyone for all of your efforts!

You can receive or provide help too:

- [Join us in Gitter](https://gitter.im/solid/chat) to chat about Solid or to hang out with us :)
- [NSS Gitter channel](https://gitter.im/solid/node-solid-server) for specific (installation) advice about this code base
- [Create a new issue](https://github.com/solid/node-solid-server/issues/new) to report bugs
- [Fix an issue](https://github.com/solid/node-solid-server/issues)
- Reach out to Jackson at jacksonm@inrupt.com to become more involved in maintaining Node Solid Server

Have a look at [CONTRIBUTING.md](https://github.com/solid/node-solid-server/blob/master/CONTRIBUTING.md).

## License

[The MIT License](https://github.com/solid/node-solid-server/blob/master/LICENSE.md)
