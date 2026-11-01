import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { TxStatus } from '@/hooks/useTx'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('glass-card rounded-3xl p-5', className)}>{children}</section>
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
      {children}
    </span>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="glass-inner rounded-2xl px-3.5 py-3">
      <Label>{label}</Label>
      <div className="display mt-1 text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      {sub ? (
        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
          {sub}
        </div>
      ) : null}
    </div>
  )
}

interface TxButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: () => unknown
  status?: TxStatus
  variant?: 'primary' | 'ghost' | 'danger'
  children: ReactNode
}

export function TxButton({ status = 'idle', variant = 'primary', className, children, disabled, onClick, ...rest }: TxButtonProps) {
  const busy = status !== 'idle'
  const style =
    variant === 'primary'
      ? undefined
      : variant === 'danger'
        ? { color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.35)' }
        : { color: 'var(--ink)', border: '1px solid var(--border)' }
  return (
    <button
      {...rest}
      type="button"
      onClick={() => {
        void onClick?.()
      }}
      disabled={disabled || busy}
      style={style}
      className={cx(
        'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-all',
        'active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'btn-primary',
        variant !== 'primary' && 'glass-pill hover:bg-white/80',
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {status === 'signing' ? 'Confirm in wallet...' : status === 'confirming' ? 'Confirming...' : children}
    </button>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const color =
    tone === 'good' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)'
  return (
    <span
      className="glass-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color }}
    >
      {children}
    </span>
  )
}
