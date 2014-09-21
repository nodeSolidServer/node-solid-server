node-ldp-httpd
==============

Goal: All you need to run tabulator-style distributed apps on top of 
a bit of file system.  Typically used as a proxy, with Apache doing the ACLs and GETs, just to do the
fast real-time patch of data resources.

Linked Data Platform server based on rdflib.js and node.js

Using the rdflib.js library originally developed for the browser environment
and since ported to node.js, a linked data server supporting the POST and PATCH.
Minimum requirement is to suport the client side of the same library, which currently (2015/09)
uses a form of SPARQL-Patch via POST.
In future may provide ACL management etc.  


