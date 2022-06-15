FROM node:latest
ARG BRANCH=main
RUN echo Testing branch ${BRANCH} of NSS
RUN git clone https://github.com/nodeSolidServer/node-solid-server
WORKDIR node-solid-server
RUN git checkout ${BRANCH}
RUN git status
RUN npm install
RUN openssl req -new -x509 -days 365 -nodes \
  -out ./server.cert \
  -keyout ./server.key \
  -subj "/C=RO/ST=Bucharest/L=Bucharest/O=IT/CN=www.example.ro"
EXPOSE 443
ADD config.json .
ADD config ./config
ADD data ./data
ADD .db ./.db
CMD ./bin/solid-test start
