import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MAX_PROOFS_PER_PLAYER, type ProofRecord } from '../src/lib/proofAuth'

type Data = Record<string, ProofRecord[]>

const DIR = path.resolve(process.cwd(), 'data')
const FILE = path.join(DIR, 'proofs.json')

let cache: Data | null = null
let queue: Promise<unknown> = Promise.resolve()

async function load(): Promise<Data> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(FILE, 'utf8')) as Data
  } catch (error) {
    // A missing file is a fresh start. Any other failure (including corrupt JSON) must surface, not be wiped.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    cache = {}
  }
  return cache
}

async function persist(data: Data): Promise<void> {
  await mkdir(DIR, { recursive: true })
  const tmp = `${FILE}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data), 'utf8')
  await rename(tmp, FILE)
}

/** Serializes every read-modify-write so concurrent requests cannot lose updates. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

const keyOf = (arena: string, challengeId: number) => `${arena.toLowerCase()}:${challengeId}`

export function addProof(arena: string, challengeId: number, record: ProofRecord): Promise<ProofRecord[]> {
  return locked(async () => {
    const data = await load()
    const key = keyOf(arena, challengeId)
    const all = data[key] ?? []
    const mine = all.filter((p) => p.player === record.player)
    const others = all.filter((p) => p.player !== record.player)
    const nextMine = [...mine, record].slice(-MAX_PROOFS_PER_PLAYER)
    data[key] = [...others, ...nextMine]
    await persist(data)
    return nextMine
  })
}

export function listProofs(arena: string, challengeId: number, onlyPlayer?: string): Promise<ProofRecord[]> {
  return locked(async () => {
    const data = await load()
    const all = data[keyOf(arena, challengeId)] ?? []
    return onlyPlayer ? all.filter((p) => p.player === onlyPlayer.toLowerCase()) : all
  })
}
