import { createPublicClient, http, isAddress, recoverMessageAddress, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { STAKE_SWEAT_ABI } from '../src/contract/stakeSweat'
import { getChain } from '../src/onchain-facts'
import {
  MAX_PROOF_LEN,
  SESSION_TTL_SEC,
  SUBMIT_SKEW_SEC,
  sessionMessage,
  submitMessage,
} from '../src/lib/proofAuth'
import { addProof, listProofs } from './store'

const CHAIN_ID = arcTestnet.id
const RPC_CHAIN_KEY = 'Arc_Testnet'

function rpcUrl(): string {
  const base = process.env.RPC_PROXY_BASE_URL
  const token = process.env.RPC_PROXY_TOKEN
  const chains = (process.env.RPC_PROXY_CHAINS || '').split(',')
  if (base && token && chains.indexOf(RPC_CHAIN_KEY) !== -1) {
    return `${base}/api/rpc/${RPC_CHAIN_KEY}?_rpc_token=${token}`
  }
  const fact = getChain(CHAIN_ID)
  if (!fact) throw new Error('Arc Testnet is missing from the chain registry')
  return fact.rpcUrls[0]
}

let client: ReturnType<typeof createPublicClient> | null = null
function chainClient() {
  client ??= createPublicClient({ chain: arcTestnet, transport: http(rpcUrl()) })
  return client
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const hits = new Map<string, number[]>()
function rateLimit(key: string, max = 10, windowSec = 60) {
  const now = Date.now() / 1000
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowSec)
  if (recent.length >= max) throw new HttpError(429, 'Too many requests. Slow down and try again.')
  recent.push(now)
  hits.set(key, recent)
}

function reqAddress(value: unknown, name: string): Address {
  if (typeof value !== 'string' || !isAddress(value)) throw new HttpError(400, `${name} must be an address`)
  return value.toLowerCase() as Address
}

function reqInt(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, `${name} must be a whole number`)
  }
  return value
}

function reqSignature(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{130,}$/.test(value)) throw new HttpError(400, 'Invalid signature')
  return value as Hex
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > 8_000) throw new HttpError(413, 'Request too large')
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'Body must be JSON')
  }
}

const nowSec = () => Math.floor(Date.now() / 1000)

async function submit(body: Record<string, unknown>) {
  const arena = reqAddress(body.arena, 'arena')
  const player = reqAddress(body.player, 'player')
  const challengeId = reqInt(body.challengeId, 'challengeId')
  const timestamp = reqInt(body.timestamp, 'timestamp')
  const signature = reqSignature(body.signature)
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length === 0 || text.length > MAX_PROOF_LEN) {
    throw new HttpError(400, `Proof must be 1 to ${MAX_PROOF_LEN} characters`)
  }
  if (Math.abs(nowSec() - timestamp) > SUBMIT_SKEW_SEC) {
    throw new HttpError(400, 'Your device clock is off. Fix it and try again.')
  }
  rateLimit(`submit:${player}`)

  const signer = await recoverMessageAddress({
    message: submitMessage({ arena, challengeId, player, text, timestamp }),
    signature,
  }).catch(() => null)
  if (!signer || signer.toLowerCase() !== player) throw new HttpError(401, 'Signature does not match your wallet')

  const c = chainClient()
  let challenge: { status: number; verifyDeadline: bigint }
  let entry: { joined: boolean }
  try {
    ;[challenge, entry] = await Promise.all([
      c.readContract({ address: arena, abi: STAKE_SWEAT_ABI, functionName: 'getChallenge', args: [BigInt(challengeId)] }),
      c.readContract({ address: arena, abi: STAKE_SWEAT_ABI, functionName: 'getEntry', args: [BigInt(challengeId), player] }),
    ])
  } catch {
    throw new HttpError(400, 'Challenge not found in that arena')
  }
  if (!entry.joined) throw new HttpError(403, 'Only players who joined can submit proof')
  if (challenge.status !== 0) throw new HttpError(409, 'This challenge is no longer accepting proof')
  if (nowSec() > Number(challenge.verifyDeadline)) throw new HttpError(409, 'The verification window has closed')

  const mine = await addProof(arena, challengeId, { player, text, at: nowSec() })
  return { proofs: mine }
}

async function list(body: Record<string, unknown>) {
  const arena = reqAddress(body.arena, 'arena')
  const viewer = reqAddress(body.viewer, 'viewer')
  const challengeId = reqInt(body.challengeId, 'challengeId')
  const timestamp = reqInt(body.timestamp, 'timestamp')
  const signature = reqSignature(body.signature)
  const age = nowSec() - timestamp
  if (age < -SUBMIT_SKEW_SEC || age > SESSION_TTL_SEC + SUBMIT_SKEW_SEC) {
    throw new HttpError(401, 'Session expired. Sign again to view proofs.')
  }
  rateLimit(`list:${viewer}`, 60)

  const signer = await recoverMessageAddress({
    message: sessionMessage({ arena, viewer, timestamp }),
    signature,
  }).catch(() => null)
  if (!signer || signer.toLowerCase() !== viewer) throw new HttpError(401, 'Signature does not match your wallet')

  let owner: Address
  try {
    owner = await chainClient().readContract({ address: arena, abi: STAKE_SWEAT_ABI, functionName: 'owner' })
  } catch {
    throw new HttpError(400, 'Arena not found')
  }
  const isAdmin = owner.toLowerCase() === viewer
  const proofs = await listProofs(arena, challengeId, isAdmin ? undefined : viewer)
  return { role: isAdmin ? 'admin' : 'player', proofs }
}

/** Framework-agnostic request handler for /api/proofs/*. Returns null for paths it does not own. */
export async function handleApi(req: Request): Promise<Response | null> {
  const { pathname } = new URL(req.url)
  if (!pathname.startsWith('/api/proofs/')) return null
  if (req.method !== 'POST') return json(405, { error: 'Use POST' })
  try {
    const body = await readBody(req)
    if (pathname === '/api/proofs/submit') return json(200, await submit(body))
    if (pathname === '/api/proofs/list') return json(200, await list(body))
    return json(404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message })
    console.error('[proofs api]', error)
    return json(500, { error: 'Something went wrong on the server' })
  }
}
