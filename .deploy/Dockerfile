FROM node:10-alpine

RUN apk add --no-cache openssl

ARG SOLID_SERVER_VERSION=latest
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install -g
COPY . .
COPY .deploy/entrypoint.sh ./entrypoint.sh

# image configuration
ENV SOLID_HOME=/opt/solid
ENV PROCESS_USER=node
ENV TEMPORARY_CERT_NAME=solid-temporary

RUN chown --recursive ${PROCESS_USER}:${PROCESS_USER} ${SOLID_HOME}

USER ${PROCESS_USER}

# solid configuration
ENV SOLID_ROOT=${SOLID_HOME}/data
ENV SOLID_SSL_KEY=${SOLID_HOME}/${TEMPORARY_CERT_NAME}.key
ENV SOLID_SSL_CERT=${SOLID_HOME}/${TEMPORARY_CERT_NAME}.crt
ENV SOLID_PORT=8443
ENV SOLID_CORS_PROXY=/xss
ENV DEBUG=solid:*

VOLUME $SOLID_HOME

ENTRYPOINT ["./entrypoint.sh"]

CMD ["start"]
