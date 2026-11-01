import { useCallback } from 'react'
import { numberToHex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useConfig, useSwitchChain } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import type { Connector } from 'wagmi'
import { CHAIN_ID } from '@/lib/stake'
import { ChainSwitchError } from '@/lib/errors'
import { requireChain } from '@/onchain-facts'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitForChain(connector: Connector, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if ((await connector.getChainId()) === CHAIN_ID) return true
    await sleep(250)
  }
  return false
}

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

/** Asks the wallet to add Arc Testnet (many wallets then offer to switch to it). */
async function addArcToWallet(connector: Connector): Promise<void> {
  const provider = (await connector.getProvider()) as Eip1193 | undefined
  if (!provider?.request) return
  const fact = requireChain(CHAIN_ID)
  const hexId = numberToHex(CHAIN_ID)
  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexId,
          chainName: arcTestnet.name,
          nativeCurrency: arcTestnet.nativeCurrency,
          rpcUrls: fact.rpcUrls,
          blockExplorerUrls: [fact.explorerBase],
        },
      ],
    })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
  } catch {
    // The user may reject the prompt; the caller reports a clear message.
  }
}

/**
 * Makes sure the wallet itself (not just wagmi's cached state) is on Arc Testnet.
 * Wallets confirm a chain switch asynchronously and some accept the request without switching,
 * so this verifies the wallet's reported chain and falls back to adding the network.
 */
export function useEnsureChain() {
  const config = useConfig()
  const { switchChainAsync } = useSwitchChain()

  return useCallback(async () => {
    const { connector } = getAccount(config)
    if (!connector) throw new ChainSwitchError('Connect your wallet first.')
    if ((await connector.getChainId()) === CHAIN_ID) return

    try {
      await switchChainAsync({ chainId: CHAIN_ID })
    } catch {
      // fall through to the add-network path below
    }
    if (await waitForChain(connector, 12)) return

    await addArcToWallet(connector)
    if (await waitForChain(connector, 24)) return

    throw new ChainSwitchError(
      'Your wallet is still on another network. In Phantom, turn on Testnet Mode (Settings, Developer Settings) and make sure Arc is active, then try again.',
    )
  }, [config, switchChainAsync])
}
