import { useEffect, useState } from 'react'

/** Wall-clock seconds, refreshed on an interval so phases and countdowns stay live. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
