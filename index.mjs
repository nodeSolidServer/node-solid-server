import createServer from './lib/create-server.mjs'
import ldnode from './lib/create-app.mjs'
import startCli from './bin/lib/cli.mjs'

// Preserve the CommonJS-style shape where the default export has
// `createServer` and `startCli` attached as properties so existing
// tests that call `ldnode.createServer()` continue to work.
let exported
const canAttach = (ldnode && (typeof ldnode === 'object' || typeof ldnode === 'function'))
if (canAttach) {
	try {
		if (!ldnode.createServer) ldnode.createServer = createServer
		if (!ldnode.startCli) ldnode.startCli = startCli
		exported = ldnode
	} catch (e) {
		exported = { default: ldnode, createServer, startCli }
	}
} else {
	exported = { default: ldnode, createServer, startCli }
}

export default exported
export { createServer, startCli }
