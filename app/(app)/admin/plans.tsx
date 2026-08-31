import { memo, useMemo, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { adminPlans } from '~/data/queries/admin'
import { AdminEmpty, AdminSection } from '~/features/admin/AdminShell'
import { OptionRow, TextField } from '~/features/admin/fields'
import {
  formatPriceInput,
  planLabel,
  slugify,
  validatePlan,
} from '~/features/admin/planForm'
import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { Button } from '~/interface/buttons/Button'
import { useQuery, zero } from '~/zero/client'

import type { PlanDraft } from '~/features/admin/planForm'

const INTERVALS = [
  { id: 'month' as const, label: 'Mensal' },
  { id: 'year' as const, label: 'Anual' },
]

const STATES = [
  { id: 'true' as const, label: 'À venda' },
  { id: 'false' as const, label: 'Fora de venda' },
]

const emptyDraft = (order: number): PlanDraft => ({
  id: newId(),
  name: '',
  slug: '',
  price: '',
  interval: 'month',
  active: true,
  order,
})

/**
 * Planos: o que o assinante compra.
 *
 * Usa Zero direto, não rota de API — `plan` é tabela pública e `models/plan.ts` já
 * fecha a escrita em `serverWhere(() => false)`, que `defaultAllowAdminRole: 'all'`
 * destrava só para admin. Não havia nada a acrescentar do lado do servidor.
 *
 * **Plano nunca é apagado, só sai de venda.** Ele é o `requiredPlanId` de posts antigos
 * e o `planId` de assinaturas já vendidas: apagar quebraria as duas coisas.
 */
export const AdminPlansPage = memo(() => {
  const { user } = useAuth()
  const userId = user?.id || ''
  const [plans, status] = useQuery(adminPlans, { enabled: Boolean(userId) })

  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const all = useMemo(() => (plans ?? []) as any[], [plans])
  const loading = !plans && status?.type !== 'complete'

  const startNew = () => {
    setError(null)
    setDraft(emptyDraft(all.length))
  }

  const startEdit = (plan: any) => {
    setError(null)
    setDraft({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      price: formatPriceInput(plan.priceCents ?? 0),
      interval: plan.interval,
      active: plan.active,
      order: plan.order ?? 0,
    })
  }

  const save = async () => {
    if (!draft) return
    const result = validatePlan(draft, all)
    if (!result.ok) {
      setError(result.message)
      return
    }

    const exists = all.some((p) => p.id === draft.id)
    try {
      if (exists) {
        await zero.mutate.plan.update(result.values)
      } else {
        await zero.mutate.plan.insert(result.values)
      }
      setDraft(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar o plano.')
    }
  }

  const toggleActive = async (plan: any) => {
    try {
      await zero.mutate.plan.update({ id: plan.id, active: !plan.active })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui mudar o plano.')
    }
  }

  if (loading) {
    return (
      <YStack py="$10" items="center">
        <Spinner size="small" color="$accent9" />
      </YStack>
    )
  }

  return (
    <YStack gap="$4">
      <AdminSection
        title="Planos"
        detail="Cada plano é um nível de acesso. Posts e cursos apontam para um deles em Exige plano."
        action={
          draft ? null : (
            <Button onPress={startNew} data-testid="new-plan">
              Novo plano
            </Button>
          )
        }
      >
        {error ? (
          <SizableText size="$2" color="$red10">
            {error}
          </SizableText>
        ) : null}

        {draft ? (
          <YStack
            gap="$3"
            p="$4"
            rounded="$6"
            borderWidth={1}
            borderColor="$accent7"
            bg="$color1"
          >
            <TextField
              label="Nome"
              value={draft.name}
              onChange={(name) =>
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        name,
                        // o slug segue o nome enquanto ninguém o editou à mão
                        slug:
                          d.slug && d.slug !== slugify(d.name) ? d.slug : slugify(name),
                      }
                    : d,
                )
              }
              placeholder="Assinatura mensal"
              testID="plan-name"
              size="lg"
            />

            <XStack gap="$3" flexWrap="wrap">
              <YStack flex={1} minW={180}>
                <TextField
                  label="Preço"
                  value={draft.price}
                  onChange={(price) => setDraft((d) => (d ? { ...d, price } : d))}
                  placeholder="29,90"
                  hint="Em reais. Pode usar vírgula."
                  testID="plan-price"
                />
              </YStack>
              <YStack flex={1} minW={180}>
                <TextField
                  label="Slug"
                  value={draft.slug}
                  onChange={(slug) => setDraft((d) => (d ? { ...d, slug } : d))}
                  placeholder="mensal"
                  hint="Identificador único. Vai para a URL."
                  testID="plan-slug"
                />
              </YStack>
            </XStack>

            <OptionRow
              label="Cobrança"
              options={INTERVALS}
              value={draft.interval}
              onChange={(interval) => setDraft((d) => (d ? { ...d, interval } : d))}
            />

            <OptionRow
              label="Situação"
              hint="Fora de venda some da tabela de preços, mas continua valendo para quem já assinou."
              options={STATES}
              value={draft.active ? 'true' : 'false'}
              onChange={(v) => setDraft((d) => (d ? { ...d, active: v === 'true' } : d))}
            />

            <XStack gap="$2">
              <Button onPress={save} data-testid="save-plan">
                Salvar
              </Button>
              <Button
                chromeless
                onPress={() => {
                  setDraft(null)
                  setError(null)
                }}
              >
                Cancelar
              </Button>
            </XStack>
          </YStack>
        ) : null}

        {all.length === 0 && !draft ? (
          <AdminEmpty>
            Nenhum plano ainda. Sem plano, Assinantes não tem o que liberar.
          </AdminEmpty>
        ) : null}

        <YStack gap="$2">
          {all.map((plan) => (
            <XStack
              key={plan.id}
              items="center"
              justify="space-between"
              gap="$3"
              p="$3"
              rounded="$6"
              borderWidth={1}
              borderColor="$borderColor"
              bg="$color1"
              flexWrap="wrap"
            >
              <YStack gap="$0.5" flex={1} minW={200}>
                <XStack items="center" gap="$2">
                  <SizableText size="$4" fontWeight="600">
                    {plan.name}
                  </SizableText>
                  {plan.active ? null : (
                    <SizableText size="$1" color="$color10">
                      fora de venda
                    </SizableText>
                  )}
                </XStack>
                <SizableText size="$2" color="$color10">
                  {planLabel(plan)} · {plan.slug}
                </SizableText>
              </YStack>

              <XStack gap="$2">
                <Button size="$2" chromeless onPress={() => startEdit(plan)}>
                  Editar
                </Button>
                <Button size="$2" chromeless onPress={() => toggleActive(plan)}>
                  {plan.active ? 'Tirar de venda' : 'Pôr à venda'}
                </Button>
              </XStack>
            </XStack>
          ))}
        </YStack>
      </AdminSection>
    </YStack>
  )
})
