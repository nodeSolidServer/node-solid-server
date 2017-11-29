FROM node:6.11.1-onbuild
EXPOSE 8443
RUN cp config.json-default config.json
RUN openssl req \
    -new \
    -newkey rsa:4096 \
    -days 365 \
    -nodes \
    -x509 \
    -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=www.example.com" \
    -keyout cert.key \
    -out cert.pem
CMD npm run solid start
