#!/bin/bash
set -e

docker network create testnet
docker build -t server test/surface/docker/server
docker build -t cookie test/surface/docker/cookie

docker build -t webid-provider test/surface/docker/webid-provider
docker build -t solid-crud test/surface/docker/solid-crud
docker build -t web-access-control test/surface/docker/web-access-control

docker run -d --env-file test/surface/server-env.list --name server --network=testnet -v `pwd`:/travis -w /node-solid-server server /travis/bin/solid-test start --config-file /node-solid-server/config.json
docker run -d --env-file test/surface/thirdparty-env.list --name thirdparty --network=testnet -v `pwd`/test/surface:/surface server /node-solid-server/bin/solid-test start --config-file /surface/thirdparty-config.json

until docker run --rm --network=testnet webid-provider curl -kI https://server 2> /dev/null > /dev/null
do
  echo Waiting for server to start, this can take up to a minute ...
  docker ps -a
  docker logs server
  sleep 1
done

until docker run --rm --network=testnet webid-provider curl -kI https://thirdparty 2> /dev/null > /dev/null
do
  echo Server started, waiting for thirdparty to start too ...
  docker ps -a
  docker logs thirdparty
  sleep 1
done

docker ps -a
docker logs server

export COOKIE_ALICE="`docker run --rm -e SERVER_ROOT="https://server" --network=testnet cookie`"
export COOKIE_BOB="`docker run --rm -e SERVER_ROOT="https://thirdparty" --network=testnet cookie`"

docker run --rm --network=testnet --env COOKIE="$COOKIE_ALICE" --env-file test/surface/webid-provider-tests-env.list webid-provider
# docker run --rm --network=testnet --env COOKIE="$COOKIE_ALICE" --env-file test/surface/solid-crud-tests-env.list solid-crud
docker run --rm --network=testnet --env COOKIE_ALICE="$COOKIE_ALICE" --env COOKIE_BOB="$COOKIE_BOB" --env-file test/surface/web-access-control-tests-env.list web-access-control

docker stop server
docker rm server
docker stop thirdparty
docker rm thirdparty
docker network remove testnet
