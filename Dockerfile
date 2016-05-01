FROM node:5.11-wheezy

ARG admin_user

WORKDIR /opt/ldnode/certs
RUN openssl genrsa 2048 > ssl-key.pem
RUN openssl req -new -x509 -nodes -sha256 -days 3650 -key ssl-key.pem -subj '/CN=*.localhost' > ssl-cert.pem

COPY . /src
RUN cd /src; npm install

WORKDIR /src/data
RUN echo $'@prefix n0: <http://www.w3.org/ns/auth/acl#>. \n\
@prefix n2: <http://xmlns.com/foaf/0.1/>.\n\
\n\
<#owner>\n\
    a                 n0:Authorization;\n\
    n0:accessTo       <./>;\n\
    n0:agent          ' + $admin_user + '\n\
    n0:defaultForNew  <./>;\n\
    n0:mode           n0:Control, n0:Read, n0:Write.\n\
<#everyone>\n\
    a                 n0:Authorization;\n\
    n0:               n2:Agent;\n\
    n0:accessTo       <./>;\n\
    n0:defaultForNew  <./>;\n\
    n0:mode           n0:Read.' > .acl

EXPOSE 8443

CMD ["node", "/src/bin/ldnode.js", "--port=8443", "--ssl-key=/opt/ldnode/certs/ssl-key.pem", "--ssl-cert=/opt/ldnode/certs/ssl-cert.pem"]

