import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { handleApi } from './api'
import { sendResponse, toRequest } from './node'

/** Serves the proofs API from the Vite dev server, so one `bun run dev` runs everything. */
export function proofsApi(): Plugin {
  return {
    name: 'stake-sweat-proofs-api',
    configureServer(server) {
      // Make provisioned RPC proxy variables available to the handler.
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('RPC_PROXY_') && process.env[key] === undefined) process.env[key] = value
      }
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/proofs/')) return next()
        void (async () => {
          const response = await handleApi(await toRequest(req))
          if (!response) return next()
          await sendResponse(res, response)
        })().catch(() => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Something went wrong on the server' }))
        })
      })
    },
  }
}
