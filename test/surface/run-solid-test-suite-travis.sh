#!/bin/bash
set -e

docker build -t node-solid-server https://github.com/solid/test-suite.git#master:/servers/node-solid-server
docker build -t webid-provider https://github.com/solid/test-suite.git#master:/testers/webid-provider
docker run --rm -d --name server --network=host -v `pwd`:/travis -w /travis node-solid-server ./bin/solid-test start --config-file /node-solid-server/config.json
sleep 10
docker ps -a
docker logs server
docker run --rm --network=host -e ALICE_WEBID=https://localhost/profile/card#me -e SERVER_ROOT=https://localhost -e USERNAME=alice -e PASSWORD=123 webid-provider
docker stop server

