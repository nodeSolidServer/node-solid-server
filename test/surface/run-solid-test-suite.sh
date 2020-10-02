#!/bin/bash
set -e

docker network create testnet
docker build -t webid-provider https://github.com/solid/test-suite.git#:/testers/webid-provider
docker build -t node-solid-server https://github.com/solid/test-suite.git#:/servers/node-solid-server
docker run --rm -d --name=server --network=testnet -v `pwd`:/travis -w /travis node-solid-server ./bin/solid-test start --config-file /node-solid-server/config.json
wget -O /tmp/env-vars-for-test-image.list https://raw.githubusercontent.com/solid/test-suite/master/servers/node-solid-server/env.list
docker run --rm --network=testnet --name tester --env-file /tmp/env-vars-for-test-image.list webid-provider
rm /tmp/env-vars-for-test-image.list
docker stop server
docker network remove testnet
