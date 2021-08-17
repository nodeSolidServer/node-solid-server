#!/bin/bash
set -e


function setup {
  echo Branch name: $1
  docker network create testnet
  docker build -t server --build-arg BRANCH=$1 test/surface/docker/server
}
setup $1
