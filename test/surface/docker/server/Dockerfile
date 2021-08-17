FROM node:latest
ARG BRANCH=main
RUN echo Testing branch ${BRANCH} of NSS
RUN git clone https://github.com/solid/node-solid-server
WORKDIR node-solid-server
RUN git checkout ${BRANCH}
RUN git status

