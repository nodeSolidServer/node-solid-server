/*jslint node: true*/
"use strict";

var fs = require('fs');
var path = require('path');
var S = require('string');
var debug = require('./logging');

var file = require('./fileStore.js');
var header = require('./header.js');
var ldpVocab = require('./vocab/ldp.js');

var metadataExtension = ".meta";

function Metadata() {
    this.filename = "";
    this.isResource = false;
    this.isSourceResource = false;
    this.isContainer = false;
    this.isBasicContainer = false;
    this.isDirectContainer = false;
}

exports.Metadata = Metadata;
