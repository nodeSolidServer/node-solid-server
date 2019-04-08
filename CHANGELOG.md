# History

## 5.0.0

- Node versions greater than 8 are supported.
- Changes to vocabulary use:
    - `solid:inbox` is deprecated in favour of `ldp:inbox`.
    - `acl:defaultForNew` is deprecated in favour of `acl:default`.
- Terms of Service may be added and enforced for new registrations,
  but is disabled by default.    	
- DELETE operations on a resource now require that the user has write permissions on
  the file's container
- Improved support for logout ensures users can use different
  identities.
- The profile container is now public readable by default.
- Access Control: 
    - The Access Control List system has undergone extensive
      changes. Security has been tightened, and some unsafe practices that
      where web apps was authorized access in the past are now not
      permitted. 
    - The browser-reported `Origin` header will now be checked by
      default, and the ACL system can be used to restrict access
      to applications for added security.
    - Users can add `trustedApp` entries to their profile using a new databrowser pane.
      You will see an 'A' icon added while you view a Person's profile URL
      with the data browser (might have to hit refresh in your browser and make sure you
      are viewing a WebId URL like https://localhost:8443/profile/card#me).
- Logging is now verbose by default so the `-v` option has been
  removed and a `--quiet` option has been added to mute the log.
- To be bug compliant with 4.x releases, if a rule for public readable
  root / does not exist, it will check in /index.html.acl (see issue #1063)
- Command line options are now kebab-cased rather than camelCased,
  config options may be both.
- Resource with no extension now have '$.ttl' appended in the filename (see upgrades notes below).
- Many smaller fixes.

#### 5.0.0 Upgrade Notes

- As of v5.0.0, all Turtle files need an extension. (**Intervention needed when updating from < 5.0.0!**)
    - **How to upgrade?**
        1. Stop the server.
        2. Update node-solid-server to 5.0.0.
        3. Make a backup of your `data/` and `config/` folders.
        4. Invoke `solid migrate-legacy-resources -v`.
           This makes the files in your `data/` and `config/` folders
           automatically compatible with the new system.
           You only need to do this once.
           Different data folders can be migrated as well with the `-p` option:
           `solid migrate-legacy-resources -p my/custom/data/folder -v`
        5. You can now start the server again as usual.
    - **Why?**
    Before version 5.0.0, `https://pod.example/profile/card`
    would map to `file:///solid/profile/card`, with the _assumption_
    that it uses content-type `text/turtle`.
    Now, this URL will map to `file:///solid/profile/card$.ttl` instead,
    which makes the content-type automatically detectable.
    This fixes many of the old Content-Type-related bugs.
    _More information: https://www.w3.org/DesignIssues/HTTPFilenameMapping.html_

## 4.4.0

- Introduce a quota system. Delete the /settings/serverSide.ttl in the
  user's POD to disable, or edit to fit your resource constraints.

#### Changelog is incomplete for much of the 4.x series

## 4.1.0

- Add support for Group Access Control Lists.
- Fix `Vary` header.
- Improve the registration page.
- Fix globbing.
- Fix the use of allow handler.
- Misc. cleanups and improvements.
- Add .well-known folder and set up with public access.

## 4.0.0
- OIDC is now supported as authentication method in addition to WebID-TLS.
- Both Node.js 6 and 8 are now supported.
- The server now accepts N3 patches.
- Responses now contain a WAC-Allow header, listing the access permissions
  for the current user and non-authenticated users.
- The `authProxy` configuration parameter has been added,
  enabling back-end servers to serve authenticated content.
  It accepts an object of path/server pairs
  (such as `/my/path": "http://localhost:2345/app"`).
  The Solid server acts as a reverse proxy for these paths, forwarding requests
  to the back-end server along with the authenticated user (`User` header)
  and the host through which Solid is being accessed (`Forwarded` header).
- The `acceptCertificateHeader` configuration parameter has been added.
  This allows WebID-TLS authentication behind a reverse proxy such as NGINX:
  the reverse proxy should be configured to pass the client certificate
  in a certain header, which is then read by a (non-public) Solid server.
- Self-signed certificates are no longer trusted in production.
  To allow self-signed certificates (for testing purposes), use `bin/solid-test`,
  which sets `NODE_TLS_REJECT_UNAUTHORIZED=0` and `--no-reject-unauthorized`.
- On POST requests, an extension will be appended to the file.
- Server logging is now more concise.
- Express server injection is now supported
- The root route (e.g. `/`) now displays a public home page.
- Several other bugfixes

#### 4.0.0 Upgrade Notes
- The `proxy` configuration parameter has been deprecated and
  renamed to `corsProxy` to better distinguish it from `authProxy`.
- The `idp` configuration parameter has been deprecated and
  renamed to `multiuser` to better identify its purpose.
- Cross-domain cookie-based authentication has been removed for security reasons.
  We instead recommend https://github.com/solid/solid-auth-client.
- Clients should not include an extension in the slug of POST requests
  (they never should have), as the server now adds an extension.

## 3.5.0

- Major refactoring of Account Creation classes (new account resources are now
  initialized from a customizable account directory template)
- Disable crashing `verifyDelegator()` code in `allow()` handler
- Add support for HTTP COPY of external resources
- Fix URI encoding in file listing and decoding to get file names
- Fix issue where requesting a different format (e.g. `text/turtle`) of a
  JSON-LD resource crashed the server

#### 3.5.0 Upgrade Notes

- New config parameter: `serverUri` - Solid server uri (with protocol,
  hostname and port), defaults to `https://localhost:8443`. In multi-user
  (`"idp": true`) mode, new account directories are now created based on this
  `serverUri` parameter. For example, if the `config.json` contains the entry
  `"serverUri": "https://example.com"`, a new account for `alice` will create
  a subdirectory `alice.example.com` in the directory specified by the `root`
  config parameter.
- New account template system. On first server startup, the contents of the
  `default-account-template` source folder get copied to `config/account-template`.
  When a new account is created, a copy is made of that new account template
  directory for the user. Server operators can customize the contents of this
  new account template for their server installation.
- Email template system. Similarly to the new account template, the Welcome
  email that gets sent out on new user registration is generated from the
  customizable local `config/email-templates/welcome.js` template file, which
  gets copied from `default-email-templates` source folder on first startup.

## 3.4.0

- Fix handling/url-encoding of container names
- Allow video skip with Accept-Ranges
- In a directory listing, add the media type class when we know it
- Add the trailing slash on the URI of a folder listed within a folder

## 3.3.0

- Refactor acl checker to use solid-permissions lib
- Various DataBrowser fixes, dataBrowserOption option to specify path of db file

## 3.2.0

- Refactor to use external solid-namespace library
- Move debrack() to utils.js, remove unused vocab/rdf.js functions
- Switch from node-mime to mime-types lib
- Refactor acl.js to prep for external solid-permissions lib
- Fix crash on PATCH request with no Content-Type

## 3.1.0

- Misc fixes and features (see commit log)
- Implemented COPY verb

## 3.0.0
- feat Discover WebID from root account https://github.com/solid/node-solid-server/pull/371
- feat: Server capabilities https://github.com/solid/node-solid-server/pull/365
- feat: pass app in createServer https://github.com/solid/node-solid-server/pull/357
- breaking: Accounts API https://github.com/solid/node-solid-server/pull/339

## 2.3.0
- feat: added Capability discovery https://github.com/solid/node-solid-server/pull/347

## 2.2.0
- feat: added `--auth` https://github.com/solid/node-solid-server/pull/346

## 2.1.0
- patch: Proxy https://github.com/solid/node-solid-server/pull/343 https://github.com/solid/node-solid-server/pull/342
- feat: added Account Recovery
- feat: added Token Service
- feat: added ldp.graph

## 2.0.0

- feat: added Welcome Email
- feat: added Email Service
- other: `ldnode` turns into `solid-server`
