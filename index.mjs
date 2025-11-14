import createApp from './lib/create-app.mjs'
import createServer from './lib/create-server.mjs'
import startCli from './bin/lib/cli.js'

// Create a default export that has createServer as a property (for API compatibility)
const solid = createApp
solid.createServer = createServer
solid.startCli = startCli

export default solid
export { createServer, startCli }
