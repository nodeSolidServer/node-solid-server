#!/bin/bash
set -e

docker network create testnet
docker build -t node-solid-server https://github.com/solid/test-suite.git#master:/servers/node-solid-server
docker build -t webid-provider https://github.com/solid/test-suite.git#master:/testers/webid-provider
# docker build -t solid-crud https://github.com/michielbdejong/test-suite.git#add-testers:/testers/solid-crud
# docker build -t web-access-control https://github.com/michielbdejong/test-suite.git#add-testers:/testers/web-access-control
docker run -d --name server --network=testnet -v `pwd`:/travis -w /node-solid-server node-solid-server /travis/bin/solid-test start --config-file /node-solid-server/config.json
wget -O /tmp/env-vars-for-test-image.list https://raw.githubusercontent.com/solid/test-suite/master/servers/node-solid-server/env.list
until docker run --rm --network=testnet webid-provider curl -kI https://server 2> /dev/null > /dev/null
do
  echo Waiting for server to start, this can take up to a minute ...
  docker ps -a
  docker logs server || true
  sleep 1
done

docker ps -a
docker logs server
docker run --rm --network=testnet --env-file /tmp/env-vars-for-test-image.list webid-provider
# docker run --rm --network=testnet --env-file /tmp/env-vars-for-test-image.list solid-crud
# docker run --rm --network=testnet --env-file /tmp/env-vars-for-test-image.list web-access-control
rm /tmp/env-vars-for-test-image.list
docker stop server
docker rm server
docker network remove testnet