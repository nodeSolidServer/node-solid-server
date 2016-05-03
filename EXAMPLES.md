Examples
========

solid binary
-------------

solid can be started on its own by using the solid binary. Below are some examples with common configurations.

* Starting solid as an HTTP server.

 `$ solid --root /var/www`

* Starting solid as an HTTPS server with WebID+TLS authentication. This parameter requires that the user specifies the location of the key and the certificate used to start the HTTPS server with the help of the appropriate parameters.
 
 `$ solid --root /var/www --webid --cert ./cert.pem --key ./key.pem`

* Start HTTPS with custom error pages. solid will look for a file in the specified directory of the form <error-code>.html. If it's not found it will default to node's error page.

 `$ solid --root /var/www/ --webid --cert ./cert.pem --key ./key.pem --error-pages ./errors/`

* solid makes use of special files used for things such as access control, metadata management, subscription to changes, etc. These files are recognized by solid because of their suffix, which can be customized with the command line options that start with 'suffix'.

 `$ solid --root /var/www/ --suffixMeta .altMeta --suffixAcl .altAcl`

Starting solid from a Node script
-------------------------------------

solid can be started from an existing node application. There are two options available: creating the solid server on its own or creating a router that can be attached to an existing Express app.

For the first case, the createServer is a wrapper around the solid method which can be used as follows:

```
var solid = require('solid-server');  
var options = {  
        root: /var/www/  
    } //an object specifying solid options (equivalent to the options provided by the command line interface).  
var server;  
var app = solid.createServer(options);  
app.listen(8080);  
```

In the second case, the solid method is used directly and the returned express app can be combined with an existing application.

```
var existingApp; //Some existing Express app independent of solid.  
// ... Existing app initialization ...  
var app = solid(options);  
exisingApp.use('/mount-point', app);  
```





