import { ConnectKitButton } from 'connectkit'
import { Lock, Dumbbell, Coins } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { fmtUsdc, type Challenge } from '@/lib/stake'
import type { PlayerState } from '@/hooks/useArenaData'
import { Card, Label, Stat } from './ui'

interface Props {
  connected: boolean
  challenges: Challenge[]
  players: Map<number, PlayerState>
  balance?: bigint
}

export function Hero({ connected, challenges, players, balance }: Props) {
  if (!connected) {
    return (
      <Card>
        <h1 className="display text-balance text-3xl font-bold leading-[1.05]">Put your USDC where your mouth is.</h1>
        <p className="mt-3 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          Lock USDC on a habit. Finish it and you get your stake back plus a cut of everyone who quit.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Step icon={<Lock className="size-4" />} title="Lock" body="Stake USDC" />
          <Step icon={<Dumbbell className="size-4" />} title="Sweat" body="Do the habit" />
          <Step icon={<Coins className="size-4" />} title="Split" body="Finishers win" />
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button type="button" onClick={show} className="btn-primary mt-5 min-h-11 w-full rounded-2xl px-4 text-sm font-semibold">
              Connect wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </Card>
    )
  }

  let onTheLine = 0n
  let claimable = 0n
  for (const c of challenges) {
    const p = players.get(c.id)
    if (!p?.entry.joined) continue
    if (c.status === 0) onTheLine += c.stake
    if (c.status === 1) claimable += p.payout
  }

  return (
    <Card>
      <Label>On the line</Label>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="display text-5xl font-bold tabular-nums">{fmtUsdc(onTheLine)}</span>
        <span className="flex items-center gap-1 text-lg font-medium" style={{ color: 'var(--subtle)' }}>
          <TokenUSDC variant="branded" size={18} /> USDC
        </span>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        Staked in challenges that have not settled yet.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Ready to claim" value={`${fmtUsdc(claimable)}`} sub="USDC" />
        <Stat label="Wallet" value={balance === undefined ? '...' : fmtUsdc(balance)} sub="USDC" />
      </div>
    </Card>
  )
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass-inner rounded-2xl px-3 py-3">
      <div style={{ color: 'var(--accent-hover)' }}>{icon}</div>
      <div className="display mt-2 text-sm font-bold">{title}</div>
      <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
        {body}
      </div>
    </div>
  )
}
