import { useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useReadContracts } from 'wagmi'
import { toast } from 'sonner'
import { STAKE_SWEAT_ABI } from '@/contract/stakeSweat'
import { useTx } from '@/hooks/useTx'
import { proofErrorText, useProofs } from '@/hooks/useProofs'
import type { ProofRecord } from '@/lib/proofAuth'
import { CHAIN_ID, PHASE_LABEL, fmtDate, fmtDuration, fmtUsdc, phaseOf, shortAddr, type Challenge, type Entry } from '@/lib/stake'
import { ProofText } from './ProofText'
import { Pill, TxButton } from './ui'

interface Props {
  challenge: Challenge
  contract: Address
  me: Address
  now: number
}

export function AdminChallenge({ challenge: c, contract, me, now }: Props) {
  const { run, status } = useTx()
  const phase = phaseOf(c, now)
  const pool = c.stake * BigInt(c.participantCount)
  const [recipient, setRecipient] = useState<string>(me)

  const send = (functionName: string, args: readonly unknown[], msg: string) =>
    run({ address: contract, abi: STAKE_SWEAT_ABI, functionName, args }, msg)

  const canRecover = phase === 'settled' && c.completedCount === 0 && c.participantCount > 0 && !c.fundsRecovered
  const recipientOk = /^0x[0-9a-fA-F]{40}$/.test(recipient)

  return (
    <article className="glass-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display text-balance text-lg font-bold leading-tight">{c.title}</h3>
          <p className="mt-1 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            #{c.id} · {c.participantCount} players · {fmtUsdc(pool)} USDC pool
          </p>
        </div>
        <Pill tone={phase === 'cancelled' ? 'bad' : phase === 'verifying' || phase === 'settle' ? 'warn' : 'neutral'}>
          {PHASE_LABEL[phase]}
        </Pill>
      </div>

      {phase === 'open' || phase === 'live' ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Verification opens in {fmtDuration(c.endTime - now)}. You can cancel until then and everyone gets refunded.
          </p>
          <TxButton variant="danger" status={status} onClick={() => send('cancelChallenge', [BigInt(c.id)], 'Challenge cancelled')}>
            Cancel and refund everyone
          </TxButton>
        </div>
      ) : null}

      {phase === 'verifying' ? (
        <div className="mt-4 space-y-3">
          <Verifier challenge={c} contract={contract} />
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Verification closes in {fmtDuration(c.verifyDeadline - now)}. Settle when you are done.
          </p>
          <TxButton variant="ghost" status={status} onClick={() => send('finalize', [BigInt(c.id)], 'Challenge settled')}>
            Settle now ({c.completedCount} of {c.participantCount} verified)
          </TxButton>
        </div>
      ) : null}

      {phase === 'settle' ? (
        <div className="mt-4">
          <TxButton variant="ghost" status={status} onClick={() => send('finalize', [BigInt(c.id)], 'Challenge settled')}>
            Settle ({c.completedCount} of {c.participantCount} verified)
          </TxButton>
        </div>
      ) : null}

      {phase === 'settled' && !canRecover ? (
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          {c.completedCount > 0
            ? `${c.claimedCount} of ${c.completedCount} finishers have claimed.`
            : c.fundsRecovered
              ? 'Pool recovered.'
              : 'Nothing to pay out.'}
        </p>
      ) : null}

      {canRecover ? (
        <div className="mt-4 space-y-2">
          <p className="text-pretty text-xs" style={{ color: 'var(--muted)' }}>
            Nobody finished, so you can recover the {fmtUsdc(pool)} USDC pool.
          </p>
          <label className="glass-inner field block rounded-2xl px-3.5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Send to
            </span>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              className="mono mt-1 w-full bg-transparent text-xs outline-none"
              spellCheck={false}
            />
          </label>
          <TxButton
            status={status}
            disabled={!recipientOk}
            onClick={() => send('recoverFunds', [BigInt(c.id), recipient], 'Funds recovered')}
          >
            Recover {fmtUsdc(pool)} USDC
          </TxButton>
        </div>
      ) : null}

      {phase === 'cancelled' ? (
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          Cancelled. Players can refund their stake themselves.
        </p>
      ) : null}
    </article>
  )
}

function Verifier({ challenge: c, contract }: { challenge: Challenge; contract: Address }) {
  const { run, status } = useTx()
  const proofs = useProofs(contract, c.id)
  const [selected, setSelected] = useState<Set<Address>>(new Set())

  const page = useReadContracts({
    contracts: [
      {
        address: contract,
        abi: STAKE_SWEAT_ABI,
        chainId: CHAIN_ID,
        functionName: 'getParticipants',
        args: [BigInt(c.id), 0n, 500n],
      },
    ],
    query: { refetchInterval: 10_000 },
  })
  const players = useMemo(
    () => (page.data?.[0]?.status === 'success' ? [...(page.data[0].result)] : []),
    [page.data],
  )

  const entries = useReadContracts({
    contracts: players.map(
      (p) =>
        ({ address: contract, abi: STAKE_SWEAT_ABI, chainId: CHAIN_ID, functionName: 'getEntry', args: [BigInt(c.id), p] }) as const,
    ),
    query: { enabled: players.length > 0, refetchInterval: 10_000 },
  })

  const statusOf = (i: number): Entry | undefined =>
    entries.data?.[i]?.status === 'success' ? (entries.data[i].result) : undefined

  const toggle = (p: Address) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  const apply = async (completed: boolean) => {
    const list = [...selected].slice(0, 100)
    const ok = await run(
      { address: contract, abi: STAKE_SWEAT_ABI, functionName: 'setCompletions', args: [BigInt(c.id), list, completed] },
      completed ? 'Marked as completed' : 'Marked as not completed',
    )
    if (ok) setSelected(new Set())
  }

  if (players.length === 0) {
    return (
      <p className="glass-inner rounded-2xl px-3.5 py-3 text-xs" style={{ color: 'var(--muted)' }}>
        {page.isLoading ? 'Loading players...' : 'Nobody joined this challenge.'}
      </p>
    )
  }

  const proofsByPlayer = new Map<string, ProofRecord[]>()
  for (const proof of proofs.data?.proofs ?? []) {
    const list = proofsByPlayer.get(proof.player) ?? []
    list.push(proof)
    proofsByPlayer.set(proof.player, list)
  }
  const withProof = players.filter((p) => proofsByPlayer.has(p.toLowerCase()))

  const loadProofs = async () => {
    try {
      await proofs.load()
    } catch (error) {
      toast.error(proofErrorText(error))
    }
  }

  return (
    <div className="space-y-2">
      {proofs.data ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {withProof.length} of {players.length} sent proof
          </span>
          <button
            type="button"
            onClick={() => void loadProofs()}
            disabled={proofs.loading}
            className="min-h-9 text-xs font-semibold underline disabled:opacity-45"
            style={{ color: 'var(--muted)' }}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={withProof.length === 0}
            onClick={() => setSelected(new Set(withProof))}
            className="glass-pill min-h-9 rounded-full px-3 text-xs font-semibold disabled:opacity-45"
            style={{ color: 'var(--ink-2)' }}
          >
            Select all with proof
          </button>
        </div>
      ) : (
        <TxButton variant="ghost" status={proofs.loading ? 'signing' : 'idle'} onClick={loadProofs}>
          Load player proofs (free signature)
        </TxButton>
      )}
      <ul className="glass-inner divide-y divide-black/5 rounded-2xl">
        {players.map((p, i) => {
          const done = statusOf(i)?.completed
          const playerProofs = proofsByPlayer.get(p.toLowerCase())
          return (
            <li key={p}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  onChange={() => toggle(p)}
                  className="size-4 accent-[#122d45]"
                />
                <span className="mono flex-1 text-xs" style={{ color: 'var(--ink-2)' }}>
                  {shortAddr(p)}
                </span>
                <Pill tone={done ? 'good' : 'neutral'}>{done ? 'Completed' : 'Not verified'}</Pill>
              </label>
              {proofs.data ? (
                <div className="space-y-1 px-3.5 pb-2.5 pl-10">
                  {playerProofs ? (
                    playerProofs.map((proof) => (
                      <div key={`${proof.at}-${proof.text}`}>
                        <span className="mr-1.5 text-[10px]" style={{ color: 'var(--subtle)' }}>
                          {fmtDate(proof.at)}
                        </span>
                        <ProofText text={proof.text} />
                      </div>
                    ))
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>
                      No proof sent
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <TxButton status={status} disabled={selected.size === 0} onClick={() => apply(true)}>
          Mark completed
        </TxButton>
        <TxButton variant="ghost" status={status} disabled={selected.size === 0} onClick={() => apply(false)}>
          Clear
        </TxButton>
      </div>
    </div>
  )
}
