import http from 'node:http'
import { handleRequest } from './lib/http.js'

const port = Number(process.env.PORT || 8787)
http.createServer(handleRequest).listen(port, () => {
  console.log(`vidup-stream-solver http://127.0.0.1:${port}`)
})
