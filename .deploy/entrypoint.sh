#!/bin/sh

set -e

./docker-image/src/create-temporary-cert.sh ${TEMPORARY_CERT_NAME}
./docker-image/src/checks.sh

npm run solid "$@"
