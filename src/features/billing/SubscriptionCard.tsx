import { Link } from 'one'
import { memo, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { activeSubscription } from '~/data/queries/subscription'
import { useAuth } from '~/features/auth/client/authClient'
import { Button } from '~/interface/buttons/Button'
import { useQuery } from '~/zero/client'

import { billingMessage, goToGateway, PORTAL_MESSAGES, startPortal } from './client/billingApi'
import { planPriceLabel } from './formatPrice'

/** Data em pt-BR, sem hora: vencimento não precisa de minuto. */
const asDate = (value?: string | number | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('pt-BR')
}

/**
 * Rótulo e tom de cada status.
 *
 * 🔴 **`past_due` já corta o acesso.** `ACTIVE_SUBSCRIPTION_STATUSES` é só `active` e
 * `trialing`, então a primeira fatura recusada fecha o conteúdo enquanto o gateway ainda
 * tenta recobrar. É o único estado em que o usuário precisa **agir**, e por isso é o único
 * que ganha destaque vermelho.
 */
const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' }> = {
  active: { label: 'Ativa', tone: 'ok' },
  trialing: { label: 'Em teste', tone: 'ok' },
  past_due: { label: 'Pagamento pendente', tone: 'warn' },
  canceled: { label: 'Cancelada', tone: 'warn' },
  expired: { label: 'Expirada', tone: 'warn' },
}

/**
 * O estado da assinatura em Ajustes.
 *
 * Cancelar e trocar cartão **não viram tela**: abrem o portal hospedado do gateway. O que
 * é feito lá volta pelo webhook, sem escrita especial daqui.
 */
export const SubscriptionCard = memo(() => {
  const { user } = useAuth()
  const userId = user?.id || ''

  const [subscription] = useQuery(
    activeSubscription,
    { userId, creatorId: MASTER_USER_ID },
    { enabled: Boolean(userId && MASTER_USER_ID) },
  )

  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const row = subscription as any

  const openPortal = async () => {
    if (opening) return
    setOpening(true)
    setError(null)
    try {
      goToGateway(await startPortal())
    } catch (err) {
      setError(billingMessage(err, PORTAL_MESSAGES))
    } finally {
      setOpening(false)
    }
  }

  // sem assinatura: o convite, não um card vazio
  if (!row) {
    return (
      <YStack gap="$2" mx="$4" p="$4" rounded="$7" bg="$accent2" borderWidth={1} borderColor="$accent6">
        <SizableText size="$5" fontWeight="700">
          Você ainda não assina
        </SizableText>
        <SizableText size="$3" color="$color11">
          Assine para abrir os posts e cursos de assinante.
        </SizableText>
        <Link href="/assinar" style={{ width: '100%' }} asChild>
          <Button mt="$2" variant="accent" size="$3" width="100%">
            Ver planos
          </Button>
        </Link>
      </YStack>
    )
  }

  const status = STATUS[row.status] ?? { label: row.status, tone: 'warn' as const }
  const until = asDate(row.currentPeriodEnd)

  return (
    <YStack gap="$2" mx="$4" p="$4" rounded="$7" bg="$color1" borderWidth={1} borderColor="$borderColor">
      <XStack items="center" justify="space-between" gap="$2">
        <SizableText size="$5" fontWeight="700">
          {row.plan?.name ?? 'Assinatura'}
        </SizableText>
        <SizableText
          size="$2"
          fontWeight="700"
          color={status.tone === 'ok' ? '$accent11' : '$red11'}
        >
          {status.label}
        </SizableText>
      </XStack>

      {row.plan ? (
        <SizableText size="$3" color="$color11">
          {planPriceLabel(row.plan)}
        </SizableText>
      ) : null}

      {/* 🔴 Compra avulsa **não renova**: dizer "próxima cobrança" nela é mentira sobre
          dinheiro — o usuário passa a esperar uma cobrança que não vem, e o acesso some
          na data que ele leu como "vou ser cobrado". */}
      {until ? (
        <SizableText size="$2" color="$color10">
          {row.cancelAtPeriodEnd
            ? `Cancelada — o acesso vai até ${until}`
            : row.plan?.interval === 'once'
              ? `Acesso até ${until}`
              : `Próxima cobrança em ${until}`}
        </SizableText>
      ) : null}

      {status.tone === 'warn' && row.status === 'past_due' ? (
        <SizableText size="$2" color="$red11">
          Atualize o cartão para recuperar o acesso.
        </SizableText>
      ) : null}

      <Button mt="$2" variant="outlined" size="$3" disabled={opening} onPress={openPortal}>
        {opening ? <Spinner size="small" /> : 'Gerenciar assinatura'}
      </Button>

      {error ? (
        <SizableText size="$2" color="$red11">
          {error}
        </SizableText>
      ) : null}
    </YStack>
  )
})
