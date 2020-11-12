FROM node:latest
RUN git clone https://github.com/solid/node-solid-server
WORKDIR node-solid-server
RUN git checkout master
RUN npm install
RUN openssl req -new -x509 -days 365 -nodes \
  -out ./server.cert \
  -keyout ./server.key \
  -subj "/C=RO/ST=Bucharest/L=Bucharest/O=IT/CN=www.example.ro"
EXPOSE 443
ADD config.json .
ADD config-test ./config-test
ADD data-test ./data-test
ADD .db-test ./.db-test
CMD ./bin/solid-test start
