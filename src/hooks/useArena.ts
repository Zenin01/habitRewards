import { useCallback, useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { CHAIN_ID } from '@/lib/stake'

const STORAGE_KEY = `stake-sweat:arena:${CHAIN_ID}`

function readQuery(): Address | null {
  const value = new URLSearchParams(window.location.search).get('arena')
  return value && isAddress(value) ? (value) : null
}

function readEnv(): Address | null {
  const value = import.meta.env.VITE_STAKE_SWEAT_ADDRESS as string | undefined
  return value && isAddress(value) ? (value) : null
}

function readStored(): Address | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value && isAddress(value) ? (value) : null
  } catch {
    return null
  }
}

/**
 * Resolves which StakeAndSweat contract the app talks to.
 * Priority: invite link (?arena=) > pinned VITE_STAKE_SWEAT_ADDRESS > this browser's saved arena.
 */
export function useArena() {
  const [address, setAddressState] = useState<Address | null>(() => readQuery() ?? readEnv() ?? readStored())
  const pinned = readEnv()

  useEffect(() => {
    const fromQuery = readQuery()
    if (fromQuery) {
      try {
        localStorage.setItem(STORAGE_KEY, fromQuery)
      } catch {
        // storage unavailable: the query param still works for this session
      }
    }
  }, [])

  const setAddress = useCallback((next: Address | null) => {
    setAddressState(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore storage errors
    }
  }, [])

  return { address, setAddress, isPinned: pinned !== null && pinned === address }
}
