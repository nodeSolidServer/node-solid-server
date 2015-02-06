/*jslint node: true*/
"use strict";

module.exports.formatDateTime = function(date, format) {
    return format.split('{').map(function(s){
        var k = s.split('}')[0];
        var width = {'Milliseconds':3, 'FullYear':4};
        var d = {'Month': 1};
        return s?  ( '000' + (date['get' + k]() + (d[k]|| 0))).slice(-(width[k]||2)) + s.split('}')[1] : '';
    }).join('');
};

module.exports.timestamp = function() {
    return this.formatDateTime(new Date(),
        '{FullYear}-{Month}-{Date}T{Hours}:{Minutes}:{Seconds}.{Milliseconds}');
};

module.exports.shortTime = function() {
    return this.formatDateTime(new Date(),
        '{Hours}:{Minutes}:{Seconds}.{Milliseconds}');
};

