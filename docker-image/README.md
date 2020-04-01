# NSS Docker image

Containerized version of node-solid-server

## How to use

For quickly trying out this image or solid-server in general you can run:
```bash
docker run -p 8443:8443 nodesolidserver/node-solid-server
```

You will be able to access the server via `https://localhost:8443` then. It will use auto-generated self-signed certificates and is **not suited for production use**. For a production server you will have to create some real certificates and configure environment variables, like SOLID_SERVER_URI, SOLID_SSL_KEY and SOLID_SSL_CERT. Take a look at the examples folder [at GitHub](https://github.com/angelo-v/docker-solid-server/tree/master/examples) for details.

### Environment variables

All solid configuration flags can be set by an equivalent environment variable.
The official solid-server documentation
[explains them in detail](https://github.com/solid/node-solid-server#extra-flags-expert).

### Docker compose

For a productive setup you may want to use docker-compose. Example setups can be found
in the [examples folder](https://github.com/angelo-v/docker-solid-server/tree/master/examples). Here is an overview of what is in there:

#### Simple setup without proxy

`./examples/docker-compose.simple.yml`

Run solid-server directly on HTTPS port 443 without a proxy in between.
You will need to have your certificates ready and mount them into the container.

#### Running solid behind nginx proxy

`./examples/docker-compose.nginx.yml`

Run solid-server on port 8443 behind a nginx proxy on 443. You will need to setup an nginx container with letsencrypt companion [as described here](https://github.com/JrCs/docker-letsencrypt-nginx-proxy-companion).

When using nginx to proxy HTTPS connections to Solid you will need to specify HTTPS in the local service URI:

`proxy_pass https://127.0.0.1:8443;`

This approach is useful if you do not wish to grant Solid access to your HTTPS certificates, as nginx does not validate
the self-signed certificates that Solid generates for its proxy_pass connection.

#### Other setups

The setup you need is not presented here? Feel free to ask, or provide a Pull Request
with your solution.

## Feedback & Discussion

There is a [topic in the Solid Forum](https://forum.solidproject.org/t/official-solid-docker-image/748/5),
you are welcome to join in.

## Contributing

If you would like to contribute to the development of this image,
see [CONTRIBUTING.md](./CONTRIBUTING.md)
