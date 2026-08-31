import { memo, useCallback, useEffect, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { AdminEmpty, AdminSection } from '~/features/admin/AdminShell'
import { mediaApi, MediaApiError } from '~/features/media/mediaApi'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'

type SubscriptionRow = {
  id: string
  creatorId: string
  planId: string
  planName: string | null
  status: string
}

type Person = {
  id: string
  email: string | null
  name: string | null
  role: string
  subscriptions: SubscriptionRow[]
  paidCents: number
  paymentCount: number
}

type PlanRow = { id: string; name: string; active: boolean }

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Pessoas: usuários, assinaturas e faturamento.
 *
 * Não usa Zero de propósito — `payment` é tabela privada e listar assinatura de
 * terceiro exige admin lido do banco, não da claim do JWT (que dura 3 anos). Tudo passa
 * por `/api/admin/people`.
 */
export const AdminPeoplePage = memo(() => {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await mediaApi<{ people: Person[]; plans: PlanRow[] }>('/admin/people')
      setPeople(data.people)
      setPlans(data.plans.filter((p) => p.active))
    } catch (err) {
      setPeople([])
      setError(
        err instanceof MediaApiError
          ? err.code === 'forbidden'
            ? 'Só quem tem role = admin no banco vê esta tela. O criador administra conteúdo, não pessoas.'
            : err.message
          : 'Falha ao carregar.',
      )
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setNote(null)
    try {
      const res = await mediaApi<{ note?: string }>('/admin/people', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.note) setNote(res.note)
      await load()
    } catch (err) {
      setError(err instanceof MediaApiError ? err.message : 'Falha na operação.')
    } finally {
      setBusy(null)
    }
  }

  if (people === null) {
    return (
      <YStack py="$10" items="center">
        <Spinner size="small" color="$accent9" />
      </YStack>
    )
  }

  const totalPaid = people.reduce((sum, person) => sum + person.paidCents, 0)
  const activeSubs = people.filter((person) =>
    person.subscriptions.some((s) => s.status === 'active' || s.status === 'trialing'),
  ).length

  return (
    <AdminSection
      title="Pessoas"
      detail={`${people.length} contas · ${activeSubs} com assinatura ativa · ${money(totalPaid)} recebidos`}
    >
      <YStack gap="$3">
        {error ? (
          <SizableText size="$3" color="$red10">
            {error}
          </SizableText>
        ) : null}

        {note ? (
          <SizableText size="$2" color="$accent11">
            {note}
          </SizableText>
        ) : null}

        {people.length === 0 && !error ? (
          <AdminEmpty>Nenhuma conta ainda.</AdminEmpty>
        ) : null}

        {people.map((person) => {
          const active = person.subscriptions.find(
            (s) => s.status === 'active' || s.status === 'trialing',
          )

          return (
            <YStack
              key={person.id}
              gap="$2"
              p="$3"
              rounded="$6"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <XStack items="center" justify="space-between" gap="$3" flexWrap="wrap">
                <YStack gap="$0.5" flex={1} minW={200}>
                  <XStack gap="$2" items="center">
                    <SizableText size="$4" fontWeight="600">
                      {person.name || '(sem nome)'}
                    </SizableText>
                    {person.role === 'admin' ? (
                      <XStack
                        px="$2"
                        py="$0.5"
                        rounded="$12"
                        borderWidth={1}
                        borderColor="$accent7"
                      >
                        <SizableText size="$1" fontWeight="600" color="$accent11">
                          admin
                        </SizableText>
                      </XStack>
                    ) : null}
                  </XStack>
                  <SizableText size="$1" color="$color10">
                    {person.email} · {money(person.paidCents)} em {person.paymentCount}{' '}
                    pagamento(s)
                  </SizableText>
                </YStack>

                <Pressable
                  onPress={() =>
                    act(`role-${person.id}`, {
                      action: 'setRole',
                      userId: person.id,
                      role: person.role === 'admin' ? 'user' : 'admin',
                    })
                  }
                  role="button"
                >
                  <SizableText size="$1" fontWeight="600" color="$color10">
                    {person.role === 'admin' ? 'rebaixar' : 'tornar admin'}
                  </SizableText>
                </Pressable>
              </XStack>

              {active ? (
                <XStack gap="$2" items="center" flexWrap="wrap">
                  <SizableText size="$2" color="$green10" fontWeight="600">
                    {active.planName || active.planId} · {active.status}
                  </SizableText>
                  <Button
                    size="$1"
                    variant="outlined"
                    disabled={busy === `revoke-${person.id}`}
                    onPress={() =>
                      act(`revoke-${person.id}`, {
                        action: 'revoke',
                        subscriptionId: active.id,
                      })
                    }
                  >
                    Revogar
                  </Button>
                </XStack>
              ) : (
                <XStack gap="$2" items="center" flexWrap="wrap">
                  <SizableText size="$2" color="$color10">
                    Sem assinatura ativa — conceder:
                  </SizableText>
                  {plans.map((planRow) => (
                    <Button
                      key={planRow.id}
                      size="$1"
                      variant="outlined"
                      disabled={busy === `grant-${person.id}`}
                      onPress={() =>
                        act(`grant-${person.id}`, {
                          action: 'grant',
                          userId: person.id,
                          planId: planRow.id,
                          creatorId: MASTER_USER_ID,
                        })
                      }
                    >
                      {planRow.name}
                    </Button>
                  ))}
                </XStack>
              )}
            </YStack>
          )
        })}
      </YStack>
    </AdminSection>
  )
})
