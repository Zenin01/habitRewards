// Standalone proofs API (for hosting without the Vite dev server): bun run server
import { createServer } from 'node:http'
import { handleApi } from './api'
import { sendResponse, toRequest } from './node'

const port = Number(process.env.PORT ?? 3001)

createServer((req, res) => {
  void (async () => {
    const response = (await handleApi(await toRequest(req))) ?? new Response('Not found', { status: 404 })
    await sendResponse(res, response)
  })().catch(() => {
    res.statusCode = 500
    res.end('Server error')
  })
}).listen(port, () => {
  console.log(`Stake & Sweat proofs API listening on :${port}`)
})
