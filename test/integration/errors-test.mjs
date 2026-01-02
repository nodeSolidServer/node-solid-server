import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { read, setupSupertestServer } from '../utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Error pages', function () {
  // LDP with error pages
  const errorServer = setupSupertestServer({
    root: join(__dirname, '../resources'),
    errorPages: join(__dirname, '../resources/errorPages'),
    webid: false
  })

  // LDP with no error pages
  const noErrorServer = setupSupertestServer({
    root: join(__dirname, '../resources'),
    noErrorPages: true,
    webid: false
  })

  function defaultErrorPage (filepath, expected) {
    const handler = function (res) {
      const errorFile = read(filepath)
      if (res.text === errorFile && !expected) {
        console.log('Not default text')
      }
    }
    return handler
  }

  describe('noErrorPages', function () {
    const file404 = 'errorPages/404.html'
    it('Should return 404 express default page', function (done) {
      noErrorServer.get('/non-existent-file.html')
        .expect(defaultErrorPage(file404, false))
        .expect(404, done)
    })
  })

  describe('errorPages set', function () {
    const file404 = 'errorPages/404.html'
    it('Should return 404 custom page if exists', function (done) {
      errorServer.get('/non-existent-file.html')
        .expect(defaultErrorPage(file404, true))
        .expect(404, done)
    })
  })
})
