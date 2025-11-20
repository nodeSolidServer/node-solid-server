import createApp from './lib/create-app.mjs'
import createServer from './lib/create-server.mjs'
// import startCli from './bin/lib/cli.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const startCli = require('./bin/lib/cli.js')

export default createApp
export { createServer, startCli } 
