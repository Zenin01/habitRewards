import { erc20Abi, type Abi, type Address } from 'viem'
import { Check, Clock, Trophy, Users } from 'lucide-react'
import { STAKE_SWEAT_ABI } from '@/contract/stakeSweat'
import { useTx } from '@/hooks/useTx'
import type { PlayerState } from '@/hooks/useArenaData'
import {
  PHASE_LABEL,
  USDC_ADDRESS,
  fmtDate,
  fmtDuration,
  fmtUsdc,
  nextMilestone,
  phaseOf,
  type Challenge,
  type Phase,
} from '@/lib/stake'
import { ProofBox } from './ProofBox'
import { Pill, TxButton } from './ui'

interface Props {
  challenge: Challenge
  player?: PlayerState
  contract: Address
  connected: boolean
  isAdmin: boolean
  allowance: bigint
  balance?: bigint
  now: number
}

const PHASE_TONE: Record<Phase, 'neutral' | 'good' | 'warn' | 'bad'> = {
  open: 'good',
  live: 'neutral',
  verifying: 'warn',
  settle: 'warn',
  settled: 'neutral',
  cancelled: 'bad',
}

export function ChallengeCard({ challenge: c, player, contract, connected, isAdmin, allowance, balance, now }: Props) {
  const { run, status } = useTx()
  const phase = phaseOf(c, now)
  const joined = player?.entry.joined ?? false
  const completed = player?.entry.completed ?? false
  const settled = player?.entry.settled ?? false
  const pool = c.stake * BigInt(c.participantCount)
  const milestone = nextMilestone(c, now)
  const needsApproval = allowance < c.stake
  const lowBalance = balance !== undefined && balance < c.stake

  const progress =
    phase === 'live'
      ? Math.min(100, Math.max(0, ((now - c.joinDeadline) / Math.max(1, c.endTime - c.joinDeadline)) * 100))
      : phase === 'open'
        ? 0
        : 100

  const call = (address: Address, abi: Abi, functionName: string, args: readonly unknown[], msg: string) =>
    run({ address, abi, functionName, args }, msg)

  const approve = () =>
    call(USDC_ADDRESS, erc20Abi, 'approve', [contract, c.stake], `Approved ${fmtUsdc(c.stake)} USDC`)
  const join = () => call(contract, STAKE_SWEAT_ABI, 'join', [BigInt(c.id)], 'You are in. Time to sweat.')
  const claim = () => call(contract, STAKE_SWEAT_ABI, 'claim', [BigInt(c.id)], 'Payout sent to your wallet')
  const refund = () => call(contract, STAKE_SWEAT_ABI, 'refund', [BigInt(c.id)], 'Stake refunded')
  const settle = () => call(contract, STAKE_SWEAT_ABI, 'finalize', [BigInt(c.id)], 'Challenge settled')

  return (
    <article className="glass-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="display text-balance text-xl font-bold leading-tight" style={{ color: 'var(--ink)' }}>
            {c.title}
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            #{c.id} · {fmtDate(c.endTime)} finish
          </p>
        </div>
        <Pill tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Pill>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Mini label="Stake" value={`${fmtUsdc(c.stake)}`} unit="USDC" />
        <Mini label="Pool" value={fmtUsdc(pool)} unit="USDC" />
        <Mini label="Players" value={String(c.participantCount)} icon={<Users className="size-3" />} />
      </div>

      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
          <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--muted)' }}>
          {milestone ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {milestone.label} in {fmtDuration(milestone.at - now)}
            </span>
          ) : (
            <span>{phase === 'settle' ? 'Verification window is over' : PHASE_LABEL[phase]}</span>
          )}
          {phase === 'settled' || phase === 'verifying' || phase === 'settle' ? (
            <span className="inline-flex items-center gap-1">
              <Check className="size-3" /> {c.completedCount}/{c.participantCount} verified
            </span>
          ) : null}
        </div>
      </div>

      {phase === 'settled' && c.completedCount > 0 ? (
        <p className="glass-inner mt-4 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs" style={{ color: 'var(--ink-2)' }}>
          <Trophy className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
          Each finisher gets their stake back plus {fmtUsdc(c.bonusPerWinner)} USDC from those who quit.
        </p>
      ) : null}
      {phase === 'settled' && c.completedCount === 0 && c.participantCount > 0 ? (
        <p className="glass-inner mt-4 rounded-2xl px-3.5 py-2.5 text-xs" style={{ color: 'var(--ink-2)' }}>
          Nobody was verified as finished, so the pool went back to the admin
          {c.fundsRecovered ? '.' : ' (recovery pending).'}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {!connected ? (
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            Connect a wallet to join or claim.
          </p>
        ) : isAdmin ? (
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            You are the admin. Manage this challenge from the Admin tab.
          </p>
        ) : (
          <>
            {phase === 'open' && !joined ? (
              needsApproval ? (
                <TxButton status={status} onClick={approve} disabled={lowBalance}>
                  {lowBalance ? 'Not enough USDC' : `Approve ${fmtUsdc(c.stake)} USDC`}
                </TxButton>
              ) : (
                <TxButton status={status} onClick={join} disabled={lowBalance}>
                  {lowBalance ? 'Not enough USDC' : `Lock in ${fmtUsdc(c.stake)} USDC`}
                </TxButton>
              )
            ) : null}
            {phase === 'open' && !joined && needsApproval && !lowBalance ? (
              <p className="text-center text-[11px]" style={{ color: 'var(--subtle)' }}>
                Step 1 of 2. Approve first, then lock in your stake.
              </p>
            ) : null}
            {phase === 'open' && joined ? <Note>You are in. Your stake is locked until the challenge settles.</Note> : null}
            {phase === 'live' && joined ? <Note>Keep sweating. The admin verifies completions after the finish.</Note> : null}
            {phase === 'live' && !joined ? <Note>Joining is closed for this one.</Note> : null}
            {(phase === 'live' || phase === 'verifying') && joined && !completed ? (
              <ProofBox contract={contract} challengeId={c.id} />
            ) : null}
            {phase === 'verifying' && joined ? (
              <Note tone={completed ? 'good' : undefined}>
                {completed ? 'Verified as completed. Claim after it settles.' : 'Waiting for the admin to verify you.'}
              </Note>
            ) : null}
            {phase === 'settle' ? (
              <TxButton status={status} variant="ghost" onClick={settle}>
                Settle challenge
              </TxButton>
            ) : null}
            {phase === 'settled' && joined && completed && !settled ? (
              <TxButton status={status} onClick={claim}>
                Claim {fmtUsdc(player?.payout ?? 0n)} USDC
              </TxButton>
            ) : null}
            {phase === 'settled' && joined && completed && settled ? <Note tone="good">Paid out. Nice work.</Note> : null}
            {phase === 'settled' && joined && !completed ? <Note tone="bad">You were not verified, so your stake went to the finishers.</Note> : null}
            {phase === 'cancelled' && joined && !settled ? (
              <TxButton status={status} onClick={refund}>
                Refund {fmtUsdc(c.stake)} USDC
              </TxButton>
            ) : null}
            {phase === 'cancelled' && joined && settled ? <Note tone="good">Refunded.</Note> : null}
          </>
        )}
      </div>
    </article>
  )
}

function Mini({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon?: React.ReactNode }) {
  return (
    <div className="glass-inner rounded-2xl px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
        {icon}
        {label}
      </div>
      <div className="display mt-0.5 flex items-baseline gap-1 tabular-nums">
        <span className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
          {value}
        </span>
        {unit ? (
          <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Note({ children, tone }: { children: React.ReactNode; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : 'var(--muted)'
  return (
    <p className="text-pretty text-center text-xs" style={{ color }}>
      {children}
    </p>
  )
}
