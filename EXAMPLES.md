Examples
========

ldnode binary
-------------

ldnode can be started on its own by using the ldnode binary. Below are some examples with common configurations.

* Starting ldnode as an HTTP server.  
  * ```
    $ ldnode --root /var/www
    ```

* Starting ldnode as an HTTPS server with WebID+TLS authentication. This parameter requires that the user specifies the location of the key and the certificate used to start the HTTPS server with the help of the appropriate parameters.
  * ```
    $ ldnode --root /var/www --webid --cert ./cert.pem --key ./key.pem
    ```

* Start HTTPS with custom error pages. ldnode will look for a file in the specified directory of the form <error-code>.html. If it's not found it will default to node's error page.
  * ```
    $ ldnode --root /var/www/ --webid --cert ./cert.pem --key ./key.pem --error-pages ./errors/
    ```

* ldnode makes use of special files used for things such as access control, metadata management, subscription to changes, etc. These files are recognized by ldnode because of their suffix, which can be customized with the command line options that start with 'suffix'
  * ```
    $ ldnode --root /var/www/ --suffixMeta .altMeta --suffixAcl .altAcl
    ```

Starting ldnode from a Node script
-------------------------------------

ldnode can be started from an existing node application. There are two options available: creating the ldnode server on its own or creating a router that can be attached to an existing Express app.

For the first case, the createServer is a wrapper around the ldnode method which can be used as follows:

```
var ldnode = require('ldnode');  
var options = {  
        root: /var/www/  
    } //an object specifying ldnode options (equivalent to the options provided by the command line interface).  
var server;  
var app = ldnode.createServer(options);  
app.listen(8080);  
```

In the second case, the ldnode method is used directly and the returned express app can be combined with an existing application.

```
var existingApp; //Some existing Express app independent of ldnode.  
// ... Existing app initialization ...  
var app = ldnode(options);  
exisingApp.use('/mount-point', app);  
```





