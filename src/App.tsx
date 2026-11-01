import { useState } from 'react'
import type { Address } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Dumbbell, Shield, Trophy } from 'lucide-react'
import { useArena } from '@/hooks/useArena'
import { useArenaData } from '@/hooks/useArenaData'
import { useNow } from '@/hooks/useNow'
import { phaseOf } from '@/lib/stake'
import { AdminChallenge } from '@/components/AdminChallenge'
import { ArenaFooter } from '@/components/ArenaFooter'
import { ChallengeCard } from '@/components/ChallengeCard'
import { CreateChallengeForm } from '@/components/CreateChallengeForm'
import { Hero } from '@/components/Hero'
import { NetworkBanner } from '@/components/NetworkBanner'
import { SetupCard } from '@/components/SetupCard'
import { Card, cx } from '@/components/ui'

type Tab = 'challenges' | 'admin'

export default function App() {
  const arena = useArena()

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '5%',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            right: '8%',
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,205,131,0.2) 0%, transparent 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-24 pt-6">
        <Header />
        <NetworkBanner />
        <main className="mt-6">
          {arena.address ? (
            <Arena contract={arena.address} isPinned={arena.isPinned} onSwitch={() => arena.setAddress(null)} />
          ) : (
            <SetupCard onReady={(a) => arena.setAddress(a)} />
          )}
        </main>
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
          <Dumbbell className="size-4 text-white" />
        </div>
        <span className="display text-lg font-bold">Stake &amp; Sweat</span>
      </div>
      <ConnectKitButton.Custom>
        {({ isConnected, show, truncatedAddress }) => (
          <button
            type="button"
            onClick={show}
            className={cx(
              'min-h-11 rounded-full px-4 text-xs font-semibold',
              isConnected ? 'glass-pill' : 'btn-primary',
            )}
            style={isConnected ? { color: 'var(--ink)' } : undefined}
          >
            {isConnected ? truncatedAddress : 'Connect'}
          </button>
        )}
      </ConnectKitButton.Custom>
    </header>
  )
}

function Arena({ contract, isPinned, onSwitch }: { contract: Address; isPinned: boolean; onSwitch: () => void }) {
  const now = useNow()
  const data = useArenaData(contract)
  const [tab, setTab] = useState<Tab>('challenges')
  const connected = Boolean(data.me)
  const activeTab: Tab = data.isAdmin ? tab : 'challenges'

  if (data.contractMissing) {
    return (
      <Card>
        <h2 className="display text-xl font-bold">No arena found here</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
          There is no Stake &amp; Sweat contract at this address on Arc Testnet.
        </p>
        <button type="button" onClick={onSwitch} className="btn-primary mt-4 min-h-11 w-full rounded-2xl px-4 text-sm font-semibold">
          Choose a different arena
        </button>
      </Card>
    )
  }

  const open = data.challenges.filter((c) => phaseOf(c, now) === 'open').length

  return (
    <div className="space-y-3">
      <Hero connected={connected} challenges={data.challenges} players={data.players} balance={data.balance} />

      {data.isAdmin ? (
        <div className="glass-pill grid grid-cols-2 rounded-full p-1">
          <TabButton active={activeTab === 'challenges'} onClick={() => setTab('challenges')} icon={<Trophy className="size-3.5" />}>
            Challenges
          </TabButton>
          <TabButton active={activeTab === 'admin'} onClick={() => setTab('admin')} icon={<Shield className="size-3.5" />}>
            Admin
          </TabButton>
        </div>
      ) : null}

      {activeTab === 'challenges' ? (
        <>
          {data.loading ? (
            <Card>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Loading challenges...
              </p>
            </Card>
          ) : data.challenges.length === 0 ? (
            <Card>
              <h2 className="display text-lg font-bold">No challenges yet</h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                {data.isAdmin
                  ? 'Create the first challenge from the Admin tab.'
                  : 'The admin has not opened a challenge yet. Check back soon.'}
              </p>
            </Card>
          ) : (
            <>
              <p className="px-1 text-xs" style={{ color: 'var(--muted)' }}>
                {open} open to join · {data.challenges.length} total
              </p>
              {data.challenges.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  player={data.players.get(c.id)}
                  contract={contract}
                  connected={connected}
                  isAdmin={data.isAdmin}
                  allowance={data.allowance}
                  balance={data.balance}
                  now={now}
                />
              ))}
            </>
          )}
        </>
      ) : data.me ? (
        <>
          <CreateChallengeForm contract={contract} />
          {data.challenges.map((c) => (
            <AdminChallenge key={c.id} challenge={c} contract={contract} me={data.me!} now={now} />
          ))}
        </>
      ) : null}

      <ArenaFooter contract={contract} isPinned={isPinned} isAdmin={data.isAdmin} onSwitch={onSwitch} />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-colors"
      style={active ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--ink-2)' }}
    >
      {icon}
      {children}
    </button>
  )
}
