# History

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
