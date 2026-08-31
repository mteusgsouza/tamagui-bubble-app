// Provider manual: o admin concede e revoga na mão.
//
// **É o suficiente para o MVP** e destrava testar o paywall inteiro sem gateway
// nenhum — foi a decisão 4 do `STATE`. O `createCheckout` não redireciona para lugar
// algum: ele resolve na hora, o que é exatamente o que "concessão manual" significa.

import { grantSubscription } from '../server/subscriptionActions'

import type { BillingProvider } from '../types'

export const manualProvider: BillingProvider = {
  id: 'manual',
  label: 'Concessão manual',

  async createCheckout({ userId, creatorId, planId }) {
    const result = await grantSubscription({
      userId,
      creatorId,
      planId,
      provider: 'manual',
      status: 'active',
      // sem prazo: concessão manual não expira sozinha (ver `expireOverdueSubscriptions`)
      currentPeriodEnd: null,
    })

    if (!result.ok) throw new Error(result.message)

    return { kind: 'done', subscriptionId: result.subscriptionId, status: 'active' }
  },

  async cancel() {
    // não há gateway do outro lado; quem marca `canceled` no banco é quem chamou
  },

  async parseWebhook() {
    // manual não tem webhook — aceitar um aqui seria uma porta aberta sem fechadura
    throw new Error('O provider `manual` não recebe webhook.')
  },
}
