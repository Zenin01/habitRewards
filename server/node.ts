import type { IncomingMessage, ServerResponse } from 'node:http'

/** Converts a Node request into a web Request (bodies are capped; the API rejects oversized JSON). */
export async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > 16_000) break
    chunks.push(buf)
  }
  const host = req.headers.host ?? 'localhost'
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(`http://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
    body: hasBody ? Buffer.concat(chunks) : undefined,
  })
}

export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  res.setHeader('content-type', response.headers.get('content-type') ?? 'application/json')
  res.end(await response.text())
}
