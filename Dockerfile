FROM node:lts

# build
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package.json /usr/src/app/
COPY package-lock.json /usr/src/app/
RUN npm install
COPY . /usr/src/app

# start
EXPOSE 8443
COPY config.json-default config.json
RUN openssl req \
    -new \
    -newkey rsa:4096 \
    -days 365 \
    -nodes \
    -x509 \
    -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=www.example.com" \
    -keyout privkey.pem \
    -out fullchain.pem
CMD npm run solid start
