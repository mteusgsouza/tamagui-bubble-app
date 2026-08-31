// Quais gateways existem e qual está ativo.
//
// Server-only: os providers falam com o banco. Acrescentar um gateway é escrever
// `providers/<nome>.ts` e uma linha aqui — nada além disto muda.

import { genericProvider } from './providers/generic'
import { manualProvider } from './providers/manual'
import { BILLING_PROVIDER } from '~/server/env-server'

import type { BillingProvider } from './types'

const PROVIDERS: Record<string, BillingProvider> = {
  [manualProvider.id]: manualProvider,
  [genericProvider.id]: genericProvider,
}

/** O provider configurado em `BILLING_PROVIDER`. Cai no manual quando não há gateway. */
export function activeProvider(): BillingProvider {
  return PROVIDERS[BILLING_PROVIDER] ?? manualProvider
}

/** Um provider pelo nome — é assim que o webhook resolve `/webhook/[provider]`. */
export function providerById(id: string): BillingProvider | null {
  return PROVIDERS[id] ?? null
}

export const providerIds = () => Object.keys(PROVIDERS)
