# Running Solid behind a reverse proxy

A common way to deploy `solid-server` is behind a reverse proxy such as
NGINX, Apache or HAProxy. The proxy listens on the public ports (80 and 443),
and forwards requests to `solid-server`, which listens on a private port on
the same machine (or another machine on your network).

```
Browser ── https://example.com ──▶ reverse proxy (:443) ──▶ solid-server (localhost:8443)
```

This page explains how to configure `config.json` for this setup, and what
the proxy needs to pass through. For more proxy examples, see also the wiki
page [Running Solid behind a reverse proxy](https://github.com/nodeSolidServer/node-solid-server/wiki/Running-Solid-behind-a-reverse-proxy).

## `port` vs. `serverUri`

These two options are easy to confuse:

| Option      | Meaning                                                      | Example                 |
|-------------|--------------------------------------------------------------|-------------------------|
| `port`      | The port `solid-server` listens on. Only the proxy uses it.  | `"8443"`                |
| `serverUri` | The public URL of your server, exactly as users see it.      | `"https://example.com"` |

`serverUri` must **not** contain the internal port. `solid-server` uses
`serverUri` (its scheme, host and port) to build every URL it hands out:
WebIDs, pod URLs, login and redirect URLs, and so on. If you set it to
`https://example.com:8443`, all those URLs will point at a port that is not
reachable from the outside.

So, if your proxy serves `https://example.com` on port 443 and forwards to
`solid-server` on port 8443:

```json
{
  "port": "8443",
  "serverUri": "https://example.com"
}
```

Only include a port in `serverUri` if your users actually connect on a
non-standard port, for example `https://example.com:4443`.

## TLS between the proxy and `solid-server`

`solid-server` decides whether to serve HTTPS or plain HTTP based on whether
`sslKey` and `sslCert` are set.

### Option A: HTTPS all the way (recommended)

Keep `sslKey` and `sslCert` in `config.json`, and have the proxy forward to
`https://localhost:8443`. You can reuse the same certificate as the proxy.

```json
{
  "port": "8443",
  "serverUri": "https://example.com",
  "sslKey": "/etc/letsencrypt/live/example.com/privkey.pem",
  "sslCert": "/etc/letsencrypt/live/example.com/fullchain.pem"
}
```

This is how most public deployments run, and it keeps session cookies marked
`Secure`.

### Option B: TLS only at the proxy

If you leave out `sslKey` and `sslCert`, `solid-server` serves plain HTTP on
`port`, and the proxy forwards to `http://localhost:8443`. `serverUri` must
still be the public `https://` URL.

Note that `solid-server` only marks its session cookie as `Secure` when
`sslKey` is set, so in this mode the cookie is sent without the `Secure`
flag. Make sure `solid-server` is only reachable through the proxy (bind it
to localhost or firewall the port).

## What the proxy must forward

Whatever proxy you use, it needs to:

- **Preserve the `Host` header.** `solid-server` uses the request's host name
  to work out which pod a request is for, especially in multi-user mode,
  where each pod is a subdomain like `alice.example.com`. In NGINX use
  `proxy_set_header Host $http_host;`, and in Apache use `ProxyPreserveHost On`.
- **Support WebSocket upgrades.** Solid uses WebSockets for live update
  notifications. Pass the `Upgrade` and `Connection` headers through (see the
  example below), or start `solid-server` with `--no-live` if you don't need
  them.
- **Allow long requests.** Some requests, like large uploads, can take a
  while. Raise the proxy's read timeout if needed.

Don't use `redirectHttpFrom` behind a proxy. Let the proxy handle redirecting
port 80 to 443.

## Multi-user mode

With `"multiuser": true`, every account gets its own subdomain
(`https://alice.example.com/`). Behind a proxy you need:

- a wildcard DNS record for `*.example.com`, as well as `example.com`
- a TLS certificate that covers both `example.com` and `*.example.com`
- a proxy configuration that accepts both, for example
  `server_name example.com *.example.com;` in NGINX

`serverUri` stays the root domain, `https://example.com`.

## Example: NGINX

`config.json`:

```json
{
  "root": "/var/www/example.com/data",
  "port": "8443",
  "serverUri": "https://example.com",
  "webid": true,
  "multiuser": true,
  "sslKey": "/etc/letsencrypt/live/example.com/privkey.pem",
  "sslCert": "/etc/letsencrypt/live/example.com/fullchain.pem"
}
```

NGINX site configuration:

```nginx
# Redirect all HTTP traffic to HTTPS
server {
  listen 80;
  listen [::]:80;
  server_name example.com *.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name example.com *.example.com;
  server_tokens off;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  location / {
    # Use http:// here instead if you chose Option B above
    proxy_pass https://localhost:8443;
    proxy_http_version 1.1;
    proxy_redirect off;
    proxy_read_timeout 300;
    proxy_connect_timeout 300;

    proxy_set_header Host              $http_host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSockets (live updates)
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Start the server with:

```bash
solid start --config-file /var/www/example.com/config.json
```

## Example: Apache

With `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`, `mod_ssl` and
`mod_rewrite` enabled:

```apache
<VirtualHost *:443>
  ServerName example.com
  ServerAlias *.example.com

  SSLEngine on
  SSLCertificateFile    /etc/letsencrypt/live/example.com/fullchain.pem
  SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem

  # Needed when proxying to https://localhost
  SSLProxyEngine On
  SSLProxyCheckPeerName off

  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"

  # WebSockets (live updates)
  RewriteEngine On
  RewriteCond %{HTTP:Upgrade} =websocket [NC]
  RewriteRule ^/(.*) wss://localhost:8443/$1 [P,L]

  ProxyPass        / https://localhost:8443/
  ProxyPassReverse / https://localhost:8443/
</VirtualHost>
```

## WebID-TLS

If you use the WebID-TLS authentication method (`"auth": "tls"`), the client
certificate is sent during the TLS handshake. A proxy that terminates TLS
cannot pass it on, so WebID-TLS will not work behind a standard reverse
proxy. The default authentication method, `oidc`, works fine.
