import { useState } from 'react'
import type { Address } from 'viem'
import { Plus } from 'lucide-react'
import { STAKE_SWEAT_ABI } from '@/contract/stakeSweat'
import { useTx } from '@/hooks/useTx'
import { fmtUsdc, nowSec, parseStake } from '@/lib/stake'
import { Card, Label, TxButton } from './ui'

const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const
type Unit = keyof typeof UNITS

const PRESETS: Array<{ name: string; unit: Unit; join: string; run: string; verify: string }> = [
  { name: 'Quick demo', unit: 'minutes', join: '3', run: '5', verify: '30' },
  { name: 'One week', unit: 'days', join: '1', run: '7', verify: '3' },
  { name: '30 day habit', unit: 'days', join: '2', run: '30', verify: '5' },
]

export function CreateChallengeForm({ contract }: { contract: Address }) {
  const { run, status } = useTx()
  const [title, setTitle] = useState('')
  const [stake, setStake] = useState('5')
  const [unit, setUnit] = useState<Unit>('minutes')
  const [join, setJoin] = useState('3')
  const [length, setLength] = useState('5')
  const [verify, setVerify] = useState('30')

  const stakeRaw = parseStake(stake)
  const joinSec = Number(join) * UNITS[unit]
  const lengthSec = Number(length) * UNITS[unit]
  const verifySec = Number(verify) * UNITS[unit]
  const valid =
    title.trim().length > 0 &&
    new TextEncoder().encode(title.trim()).length <= 80 &&
    stakeRaw !== null &&
    joinSec >= 120 &&
    lengthSec > 0 &&
    verifySec > 0 &&
    Number.isFinite(joinSec + lengthSec + verifySec)

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setUnit(p.unit)
    setJoin(p.join)
    setLength(p.run)
    setVerify(p.verify)
  }

  const submit = async () => {
    if (!valid || stakeRaw === null) return
    const now = nowSec()
    const joinDeadline = BigInt(now + Math.round(joinSec))
    const endTime = joinDeadline + BigInt(Math.round(lengthSec))
    const verifyDeadline = endTime + BigInt(Math.round(verifySec))
    const ok = await run(
      {
        address: contract,
        abi: STAKE_SWEAT_ABI,
        functionName: 'createChallenge',
        args: [title.trim(), stakeRaw, joinDeadline, endTime, verifyDeadline],
      },
      'Challenge is live',
    )
    if (ok) setTitle('')
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Plus className="size-4" style={{ color: 'var(--accent-hover)' }} />
        <h2 className="display text-lg font-bold">New challenge</h2>
      </div>

      <div className="space-y-3">
        <Field label="Habit">
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Run 5km every day for a week"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </Field>

        <Field label="Stake per player (USDC)">
          <input
            inputMode="decimal"
            value={stake}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (/^\d*\.?\d*$/.test(v)) setStake(v)
            }}
            placeholder="5"
            className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-slate-300"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="glass-pill min-h-9 rounded-full px-3 text-xs font-semibold"
              style={{ color: 'var(--ink-2)' }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Join window">
            <NumberInput value={join} onChange={setJoin} />
          </Field>
          <Field label="Challenge">
            <NumberInput value={length} onChange={setLength} />
          </Field>
          <Field label="Verify window">
            <NumberInput value={verify} onChange={setVerify} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label>Time unit</Label>
          <div className="glass-pill flex rounded-full p-0.5">
            {(Object.keys(UNITS) as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className="min-h-9 rounded-full px-3 text-xs font-semibold capitalize"
                style={u === unit ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--ink-2)' }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <p className="text-pretty text-xs" style={{ color: 'var(--muted)' }}>
          Players have the join window to lock {stakeRaw ? fmtUsdc(stakeRaw) : '0.00'} USDC. After the challenge ends you
          verify who finished within the verify window. Joining needs at least 2 minutes.
        </p>

        <TxButton status={status} onClick={submit} disabled={!valid}>
          Create challenge
        </TxButton>
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="glass-inner field block rounded-2xl px-3.5 py-2.5">
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function NumberInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="numeric"
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, '')
        onChange(v)
      }}
      className="display w-full bg-transparent text-lg font-bold tabular-nums outline-none"
    />
  )
}
