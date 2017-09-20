FROM node:5.11-wheezy

RUN cd /opt \
 && mkdir -p ldnode/certs && cd ldnode/certs \
 && openssl genrsa 2048 > ssl-key.pem \
 && openssl req -new -x509 -nodes -sha256 -days 3650 -key ssl-key.pem -subj '/CN=*.localhost' > ssl-cert.pem

COPY . /src
RUN cd /src && mkdir data \
 && npm install

ENTRYPOINT ["node", "/src/bin/ldnode.js"]
CMD ["--port=8443", "--ssl-key=/opt/ldnode/certs/ssl-key.pem", "--ssl-cert=/opt/ldnode/certs/ssl-cert.pem", "--root=/src/data"]