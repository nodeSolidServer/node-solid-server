#!/bin/bash
set -e

function setup {
  docker network create testnet
  docker build -t server test/surface/docker/server
  docker build -t cookie test/surface/docker/cookie
  docker pull solidtestsuite/webid-provider-tests:v1.2.0
  docker pull solidtestsuite/solid-crud-tests:nss-skips
  docker pull solidtestsuite/web-access-control-tests:latest
}
function teardown {
  docker stop `docker ps --filter network=testnet -q`
  docker rm `docker ps --filter network=testnet -qa`
  docker network remove testnet
}

function startNss {
  docker run -d --env-file test/surface/$1-env.list --name $1 --network=testnet -v `pwd`:/travis -w /node-solid-server server /travis/bin/solid-test start --config-file /node-solid-server/config.json
  until docker run --rm --network=testnet solidtestsuite/webid-provider-tests curl -kI https://$1 2> /dev/null > /dev/null
  do
    echo Waiting for $1 to start, this can take up to a minute ...
    docker ps -a
    docker logs $1
    sleep 1
  done

  docker logs $1
  echo Getting cookie for $1...
  export COOKIE_$1="`docker run --cap-add=SYS_ADMIN --network=testnet --env-file ./env-vars-$1.list cookie`"
}

function runTests {
  echo "Running $1 tests against server with cookie $COOKIE_server"
  docker run --rm --network=testnet \
    --env COOKIE="$COOKIE_server" \
    --env COOKIE_ALICE="$COOKIE_server" \
    --env COOKIE_BOB="$COOKIE_thirdparty" \
    --env-file test/surface/$1-tests-env.list solidtestsuite/$1-tests
}

# ...
teardown || true
setup
startNss server
runTests webid-provider
# runTests solid-crud
# startNss thirdparty
# runTests web-access-control
teardown
