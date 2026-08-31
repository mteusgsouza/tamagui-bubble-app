import { useParams, useRouter, createRoute } from 'one'
import { memo, useEffect, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminCourse } from '~/data/queries/admin'
import { activePlans } from '~/data/queries/subscription'
import { AdminSection } from '~/features/admin/AdminShell'
import { CourseCurriculumEditor } from '~/features/admin/CourseCurriculumEditor'
import { OptionRow, TextField } from '~/features/admin/fields'
import { useAuth } from '~/features/auth/client/authClient'
import { Button } from '~/interface/buttons/Button'
import { useQuery, zero } from '~/zero/client'

import type { Visibility } from '~/data/types'

const route = createRoute<'/(app)/admin/courses/[courseId]'>()

const VISIBILITIES: { id: Visibility; label: string }[] = [
  { id: 'subscribers', label: 'Assinantes' },
  { id: 'public', label: 'Aberto a todos' },
]

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

  const [course, status] = useQuery(
    adminCourse,
    { courseId: courseId || '', userId },
    { enabled: Boolean(courseId && userId && !isNew) },
  )
  const [plans] = useQuery(activePlans, { enabled: Boolean(userId) })

  const [draft, setDraft] = useState({
    title: '',
    slug: '',
    description: '',
    visibility: 'subscribers' as Visibility,
    requiredPlanId: null as string | null,
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
    })
    setSlugTouched(true)
    setLoaded(true)
  }, [course, loaded, isNew])

  const row = course as any
  const exists = Boolean(row)
  const isLoading = !isNew && status?.type !== 'complete' && !course

  const save = async () => {
    if (!courseId || !userId || saving) return
    const slug = draft.slug || toSlug(draft.title)
    if (!draft.title.trim() || !slug) return

    setSaving(true)
    try {
      const shared = {
        title: draft.title.trim(),
        slug,
        description: draft.description.trim() || undefined,
        visibility: draft.visibility,
        requiredPlanId: draft.requiredPlanId ?? undefined,
      }

      if (exists) {
        await zero.mutate.course.update({ id: courseId, ...shared })
      } else {
        await zero.mutate.course.insert({
          id: courseId,
          feedOwnerId: MASTER_USER_ID,
          published: false,
          order: 0,
          createdAt: Date.now(),
          ...shared,
        })
        router.replace(`/admin/courses/${courseId}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    if (!courseId || !exists) return
    await zero.mutate.course.update({ id: courseId, published: !row.published })
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
              bg="$accentBackground"
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
        </YStack>
      </AdminSection>

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
