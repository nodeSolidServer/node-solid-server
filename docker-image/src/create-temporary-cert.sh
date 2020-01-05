#!/bin/sh
set -e

NAME=$1

if [ -z $NAME ]; then
	echo "Usage: ./create-temporary-cert.sh some-name"
	exit 1
fi

openssl req -nodes -x509 -days 3 -newkey rsa:2048 \
	-keyout ./$NAME.key \
	-out ./$NAME.crt \
	-subj "/O=$NAME/OU=$NAME/CN=$NAME"
