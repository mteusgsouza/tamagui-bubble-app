import { useParams, useRouter, createRoute } from 'one'
import { memo, useEffect, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { AdminSection } from '~/features/admin/AdminShell'
import { CourseCurriculumEditor } from '~/features/admin/CourseCurriculumEditor'
import { CourseEnrollments } from '~/features/admin/CourseEnrollments'
import { OptionRow, TextField } from '~/features/admin/fields'
import { formatPriceInput, parsePriceInput } from '~/features/admin/planForm'
import { LessonMediaField } from '~/features/admin/LessonMediaField'
import { adminCourses as adminCoursesApi } from '~/data/client/api'
import { useAdminCourse, usePlans } from '~/data/client/hooks'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { useAuth } from '~/features/auth/client/authClient'
import { Button } from '~/interface/buttons/Button'

import type { Visibility } from '~/data/enums'

const route = createRoute<'/(app)/admin/courses/[courseId]'>()

const VISIBILITIES: { id: Visibility; label: string }[] = [
  { id: 'subscribers', label: 'Assinantes' },
  { id: 'public', label: 'Aberto a todos' },
]

type SubscriberAccess = 'included' | 'since-subscription' | 'none'

const SUBSCRIBER_ACCESS: { id: SubscriberAccess; label: string }[] = [
  { id: 'included', label: 'Incluído' },
  { id: 'since-subscription', label: 'Só o que sair depois' },
  { id: 'none', label: 'Venda avulsa' },
]

const SUBSCRIBER_ACCESS_HINT: Record<SubscriberAccess, string> = {
  included: 'Todo assinante ativo pode começar este curso.',
  'since-subscription':
    'Só quem assinou antes da publicação do curso. Quem assinou depois compra à parte.',
  none: 'A assinatura não abre este curso: só a compra avulsa, pelo preço abaixo.',
}

/** "Aquisição sem Anúncio!" vira "aquisicao-sem-anuncio". */
const toSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export const AdminCourseEditPage = memo(() => {
  const router = useRouter()
  const { courseId, novo } = useParams<{ courseId?: string; novo?: string }>()
  const { user } = useAuth()
  const userId = user?.id || ''

  const isNew = novo === '1'

  const courseQuery = useAdminCourse(courseId || '', !isNew)
  const course = courseQuery.data?.course
  const plans = usePlans().data?.plans
  const invalidate = useInvalidateAfterAdminWrite()

  const [draft, setDraft] = useState({
    title: '',
    slug: '',
    description: '',
    visibility: 'subscribers' as Visibility,
    requiredPlanId: null as string | null,
    subscriberAccess: 'included' as SubscriberAccess,
    // texto do campo, "97,00"; vazio = não vende avulso
    price: '',
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  // slug só segue o título enquanto ninguém o editou à mão
  const [slugTouched, setSlugTouched] = useState(false)

  useEffect(() => {
    if (loaded || isNew || !course) return
    const row = course as any
    setDraft({
      title: row.title || '',
      slug: row.slug || '',
      description: row.description || '',
      visibility: row.visibility,
      requiredPlanId: row.requiredPlanId ?? null,
      subscriberAccess: row.subscriberAccess ?? 'included',
      price: row.priceCents != null ? formatPriceInput(row.priceCents) : '',
    })
    setSlugTouched(true)
    setLoaded(true)
  }, [course, loaded, isNew])

  const row = course as any
  const exists = Boolean(row)

  // vazio = sem preço (não vende). Texto que não vira valor positivo é erro, não "sem preço":
  // salvar `null` em silêncio tiraria o curso de venda sem o criador perceber
  const priceCents = draft.price.trim() ? parsePriceInput(draft.price) : null
  const priceInvalid = Boolean(draft.price.trim()) && (priceCents == null || priceCents <= 0)
  const unreachable = draft.subscriberAccess === 'none' && priceCents == null && !priceInvalid
  const isLoading = !isNew && courseQuery.isPending

  const save = async () => {
    if (!courseId || !userId || saving) return
    const slug = draft.slug || toSlug(draft.title)
    if (!draft.title.trim() || !slug || priceInvalid) return

    setSaving(true)
    try {
      const shared = {
        title: draft.title.trim(),
        slug,
        description: draft.description.trim() || undefined,
        visibility: draft.visibility,
        requiredPlanId: draft.requiredPlanId ?? undefined,
        subscriberAccess: draft.subscriberAccess,
        priceCents,
      }

      // upsert: `on conflict (id)` decide entre criar e atualizar, e a `order` sai do
      // servidor (`max + 1`) em vez de um `0` fixo que empatava com o primeiro curso
      await adminCoursesApi({ action: 'saveCourse', id: courseId, ...shared })
      invalidate()
      if (!exists) router.replace(`/admin/courses/${courseId}`)
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    if (!courseId || !exists) return
    await adminCoursesApi({
      action: 'togglePublish',
      id: courseId,
      published: !row.published,
    })
    invalidate()
  }

  if (isLoading) {
    return (
      <YStack py="$10" items="center">
        <Spinner size="small" color="$accent9" />
      </YStack>
    )
  }

  if (!isNew && !exists) {
    return (
      <AdminSection title="Curso não encontrado">
        <SizableText size="$3" color="$color10">
          Ele pode ter sido removido, ou o id da URL está errado.
        </SizableText>
      </AdminSection>
    )
  }

  return (
    <YStack gap="$2">
      <AdminSection
        title={isNew && !exists ? 'Novo curso' : 'Editar curso'}
        detail={exists ? (row.published ? 'Publicado' : 'Rascunho') : 'Ainda não salvo'}
        action={
          <XStack gap="$2">
            {exists ? (
              <Button size="$3" variant="outlined" onPress={togglePublish}>
                {row.published ? 'Despublicar' : 'Publicar'}
              </Button>
            ) : null}
            <Button
              size="$3"
              variant="accent"
              onPress={save}
              disabled={saving || !draft.title.trim()}
              data-testid="save-course"
            >
              <SizableText size="$3" fontWeight="600" color="$accentColor">
                {saving ? 'Salvando…' : 'Salvar'}
              </SizableText>
            </Button>
          </XStack>
        }
      >
        <YStack gap="$4">
          {/* a capa grava na hora (`setCourseCover`); o "Salvar" não mexe nela. Só existe
              depois do primeiro salvamento: sem a linha do curso não há onde ligá-la. */}
          {exists ? (
            <LessonMediaField
              label="Capa"
              media={row.coverMedia ?? null}
              accept="photo"
              emptyHint="foto — aparece no card do curso em 16:9"
              focal
              testID="course-cover"
              onChange={async (mediaId) => {
                await adminCoursesApi({
                  action: 'setCourseCover',
                  courseId: courseId!,
                  mediaId,
                })
                invalidate()
              }}
            />
          ) : null}

          <TextField
            label="Título"
            value={draft.title}
            onChange={(title) =>
              setDraft((d) => ({
                ...d,
                title,
                slug: slugTouched ? d.slug : toSlug(title),
              }))
            }
            placeholder="Aquisição sem depender de anúncio"
            testID="course-title"
          />

          <TextField
            label="Slug"
            hint="Aparece na URL: /home/courses/<slug>. Único por criador."
            value={draft.slug}
            onChange={(slug) => {
              setSlugTouched(true)
              setDraft((d) => ({ ...d, slug: toSlug(slug) }))
            }}
            placeholder="aquisicao-sem-anuncio"
            testID="course-slug"
          />

          <TextField
            label="Descrição"
            value={draft.description}
            onChange={(description) => setDraft((d) => ({ ...d, description }))}
            multiline
          />

          <OptionRow
            label="Quem vê"
            options={VISIBILITIES}
            value={draft.visibility}
            onChange={(visibility) => setDraft((d) => ({ ...d, visibility }))}
          />

          <OptionRow
            label="Exige plano"
            hint="Sem plano, qualquer assinatura ativa libera. Com plano, só aquele."
            options={[
              { id: '', label: 'Qualquer assinatura' },
              ...(plans ?? []).map((p: any) => ({ id: p.id, label: p.name })),
            ]}
            value={draft.requiredPlanId ?? ''}
            onChange={(id) => setDraft((d) => ({ ...d, requiredPlanId: id || null }))}
          />

          {draft.visibility === 'subscribers' ? (
            <OptionRow
              label="Quem tem acesso"
              hint={SUBSCRIBER_ACCESS_HINT[draft.subscriberAccess]}
              options={SUBSCRIBER_ACCESS}
              value={draft.subscriberAccess}
              onChange={(subscriberAccess) => setDraft((d) => ({ ...d, subscriberAccess }))}
            />
          ) : null}

          {draft.visibility === 'subscribers' ? (
            <YStack gap="$1.5">
              <TextField
                label="Preço da compra avulsa (R$)"
                hint="Deixe vazio para não vender avulso. Depois de mudar o valor, rode scripts/stripe-sync-courses.ts para o Stripe cobrar o novo preço."
                value={draft.price}
                onChange={(price) => setDraft((d) => ({ ...d, price }))}
                placeholder="97,00"
                testID="course-price"
              />
              {priceInvalid ? (
                <SizableText size="$2" color="$red10" data-testid="course-price-error">
                  Preço inválido. Use um valor maior que zero.
                </SizableText>
              ) : null}
              {unreachable ? (
                <SizableText size="$2" color="$orange10" data-testid="course-unreachable">
                  ⚠️ Venda avulsa sem preço: ninguém além de você consegue abrir este curso.
                </SizableText>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
      </AdminSection>

      {exists ? <CourseEnrollments courseId={courseId!} /> : null}

      {exists ? (
        <CourseCurriculumEditor
          courseId={courseId!}
          modules={(row.modules ?? []) as any[]}
          lessons={(row.lessons ?? []) as any[]}
        />
      ) : (
        <SizableText size="$2" color="$color10">
          Salve o curso para montar o currículo.
        </SizableText>
      )}
    </YStack>
  )
})
