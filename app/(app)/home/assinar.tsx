import { router } from 'one'
import { memo, useState } from 'react'
import { ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { activePlans, activeSubscription } from '~/data/queries/subscription'
import { useAuth } from '~/features/auth/client/authClient'
import {
  billingMessage,
  CHECKOUT_MESSAGES,
  goToGateway,
  startCheckout,
} from '~/features/billing/client/billingApi'
import { planPriceLabel, renewalNote } from '~/features/billing/formatPrice'
import { Button } from '~/interface/buttons/Button'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'
import { PageLayout } from '~/interface/pages/PageLayout'
import { useQuery } from '~/zero/client'

type PlanRow = {
  id: string
  name: string
  priceCents: number
  currency?: string | null
  interval: 'month' | 'year' | 'once'
  accessDays?: number | null
}

/**
 * A tela de assinar.
 *
 * Fica **fora de `(tabs)`** de propósito: é um caminho de conversão, não uma seção do app.
 * Sem a barra de abas embaixo, a única saída é voltar ou pagar.
 *
 * ⚠️ Também não fica na raiz de `(app)`: "assinar" vem antes de "admin" em ordem
 * alfabética, e a primeira rota do grupo é o destino do escorregão descrito na
 * invariante 10. Não vale mexer nisso por causa de uma tela.
 */
export const SubscribePage = memo(() => {
  const { user } = useAuth()
  const userId = user?.id || ''

  const [plans, status] = useQuery(activePlans, { enabled: Boolean(userId) })
  const [current] = useQuery(
    activeSubscription,
    { userId, creatorId: MASTER_USER_ID },
    { enabled: Boolean(userId && MASTER_USER_ID) },
  )

  // qual plano está abrindo o gateway — o botão precisa saber sozinho, senão os dois
  // giram juntos
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = (plans ?? []) as PlanRow[]
  const loading = status?.type !== 'complete' && rows.length === 0

  const subscribe = async (planId: string) => {
    if (pending) return
    setPending(planId)
    setError(null)
    try {
      goToGateway(await startCheckout(planId))
      // na web o `goToGateway` troca a página, então o `finally` abaixo pode nem rodar —
      // e é por isso que o estado de erro é limpo antes, não depois
    } catch (err) {
      setError(billingMessage(err, CHECKOUT_MESSAGES))
    } finally {
      setPending(null)
    }
  }

  return (
    <PageLayout useImage>
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack width="100%" maxW={620} mx="auto" px="$4" pt="$4" pb="$10" gap="$5">
          <XStack items="center" gap="$2">
            <Button
              variant="outlined"
              size="$2"
              circular
              onPress={() => router.back()}
              aria-label="Voltar"
            >
              <CaretLeftIcon size={16} color="$color11" />
            </Button>
            <SizableText size="$8" fontWeight="800">
              Assinar
            </SizableText>
          </XStack>

          <SizableText size="$4" color="$color11" lineHeight={23}>
            Acesso ao conteúdo de assinante: posts, cursos e o que vier depois.
          </SizableText>

          {/* quem já assina não vê preço, vê o que tem — evita a compra duplicada e a
              dúvida de "será que já paguei?" */}
          {current ? (
            <AlreadySubscribed planName={(current as any).plan?.name} />
          ) : loading ? (
            <YStack py="$10" items="center">
              <Spinner size="small" color="$accent9" />
            </YStack>
          ) : rows.length === 0 ? (
            <Empty />
          ) : (
            <YStack gap="$3">
              {rows.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  busy={pending === plan.id}
                  disabled={Boolean(pending)}
                  onPress={() => subscribe(plan.id)}
                />
              ))}
            </YStack>
          )}

          {error ? (
            <YStack
              p="$3"
              rounded="$6"
              bg="$red2"
              borderWidth={1}
              borderColor="$red7"
              gap="$1"
            >
              <SizableText size="$3" color="$red11" fontWeight="600">
                {error}
              </SizableText>
            </YStack>
          ) : null}

          <SizableText size="$2" color="$color9" text="center">
            O pagamento acontece numa página segura do gateway. O Bubble não guarda os
            dados do seu cartão.
          </SizableText>
        </YStack>
      </ScrollView>
    </PageLayout>
  )
})

const PlanCard = ({
  plan,
  busy,
  disabled,
  onPress,
}: {
  plan: PlanRow
  busy: boolean
  disabled: boolean
  onPress: () => void
}) => (
  <YStack
    gap="$2"
    p="$4"
    rounded="$7"
    bg="$color1"
    borderWidth={1}
    borderColor="$borderColor"
  >
    <SizableText size="$6" fontWeight="700">
      {plan.name}
    </SizableText>

    {/* `$accent11`, nunca hex: a cor da marca é token (invariante 6) */}
    <SizableText size="$8" fontWeight="800" color="$accent11">
      {planPriceLabel(plan)}
    </SizableText>

    <SizableText size="$2" color="$color10">
      {renewalNote(plan.interval)}
    </SizableText>

    <Button
      mt="$2"
      size="$4"
      variant="accent"
      disabled={disabled}
      opacity={disabled && !busy ? 0.5 : 1}
      onPress={onPress}
      testID={`assinar-${plan.id}`}
    >
      {busy ? <Spinner size="small" color="$accentColor" /> : 'Assinar'}
    </Button>
  </YStack>
)

const AlreadySubscribed = ({ planName }: { planName?: string }) => (
  <YStack gap="$3" p="$4" rounded="$7" bg="$color2" borderWidth={1} borderColor="$borderColor">
    <SizableText size="$5" fontWeight="700">
      Você já assina{planName ? ` o ${planName}` : ''}
    </SizableText>
    <SizableText size="$3" color="$color11">
      Para trocar de plano, cancelar ou atualizar o cartão, vá em Ajustes.
    </SizableText>
    <Button variant="outlined" size="$3" onPress={() => router.push('/home/settings')}>
      Ir para Ajustes
    </Button>
  </YStack>
)

const Empty = () => (
  <YStack py="$8" gap="$2" items="center">
    <SizableText size="$5" fontWeight="700">
      Nenhum plano à venda
    </SizableText>
    <SizableText size="$3" color="$color10" text="center">
      O criador ainda não abriu as assinaturas.
    </SizableText>
  </YStack>
)
