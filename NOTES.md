## Debugging

See [http://stackoverflow.com/questions/1911015/how-to-debug-node-js-applications](http://stackoverflow.com/questions/1911015/how-to-debug-node-js-applications)

```
var agent = require('webkit-devtools-agent')
agent.start()
```

Install to your application, `npm install webkit-devtools-agent`
Include in your application, `agent = require('webkit-devtools-agent')`
Activate the agent: `kill -SIGUSR2 <your node process id>`
Access the agent via the appropriate link