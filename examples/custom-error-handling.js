var solid = require('../')
var path = require('path')

solid
  .createServer({
    webid: true,
    sslCert: path.resolve('../test/keys/cert.pem'),
    sslKey: path.resolve('../test/keys/key.pem'),
    errorHandler: function (err, req, res, next) {
      if (err.status !== 200) {
        console.log('Oh no! There is an error:' + err.message)
        res.status(err.status)

        // Now you can send the error how you want
        // Maybe you want to render an error page
        // res.render('errorPage.ejs', {
        //   title: err.status + ": This is an error!",
        //   message: err.message
        // })
        // Or you want to respond in JSON?

        res.json({
          title: err.status + ': This is an error!',
          message: err.message
        })
      }
    }
  })
  .listen(3456, function () {
    console.log('started ldp with webid on port ' + 3456)
  })
