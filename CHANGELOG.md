# History

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
