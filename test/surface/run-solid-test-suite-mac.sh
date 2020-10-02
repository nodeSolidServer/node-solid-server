#!/bin/bash
set -e

docker network create testnet
docker build -t node-solid-server https://github.com/solid/test-suite.git#master:/servers/node-solid-server
docker build -t webid-provider https://github.com/solid/test-suite.git#master:/testers/webid-provider
# docker build -t solid-crud https://github.com/michielbdejong/test-suite.git#add-testers:/testers/solid-crud
# docker build -t web-access-control https://github.com/michielbdejong/test-suite.git#add-testers:/testers/web-access-control
docker run --rm -d --name server --network=testnet -v `pwd`:/travis -w /travis node-solid-server ./bin/solid-test start --config-file /node-solid-server/config.json
wget -O /tmp/env-vars-for-test-image.list https://raw.githubusercontent.com/solid/test-suite/master/servers/node-solid-server/env.list
sleep 10
docker ps -a
docker logs server
docker run --rm --network=testnet --env-file /tmp/env-vars-for-test-image.list webid-provider
# docker run --rm --network=testnet --env-file /tmp/env-vars-for-test-image.list solid-crud
# docker run --rm --network=testnet --env-file /tmp/env-vars-for-test-image.list web-access-control
rm /tmp/env-vars-for-test-image.list
docker stop server
docker network remove testnet