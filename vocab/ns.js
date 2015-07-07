/*jslint node: true*/
"use strict";

var $rdf = require('rdflib');

exports.ns = {
    rdf:  $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#"),
    rdfs: $rdf.Namespace("http://www.w3.org/2000/01/rdf-schema#"),
    acl:  $rdf.Namespace("http://www.w3.org/ns/auth/acl#"),
    cert: $rdf.Namespace("http://www.w3.org/ns/auth/cert#"),
    foaf: $rdf.Namespace("http://xmlns.com/foaf/0.1/"),
    stat: $rdf.Namespace("http://www.w3.org/ns/posix/stat#"),
    dct:  $rdf.Namespace("http://purl.org/dc/terms/")
};
