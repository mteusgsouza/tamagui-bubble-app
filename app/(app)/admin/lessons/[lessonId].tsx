import { createRoute, useParams, useRouter } from 'one'
import { memo, useEffect, useState } from 'react'
import { SizableText, Spinner, useMedia, XStack, YStack } from 'tamagui'

import { adminCourses } from '~/data/client/api'
import { useAdminCourses } from '~/data/client/hooks'
import { ADMIN_MESSAGES } from '~/data/client/messages'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { AdminActionBar, AdminSection } from '~/features/admin/AdminShell'
import { OptionRow, TextField } from '~/features/admin/fields'
import { LessonMediaField } from '~/features/admin/LessonMediaField'
import { apiMessage } from '~/helpers/apiMessage'
import { Button } from '~/interface/buttons/Button'
import { showToast } from '~/interface/toast/helpers'

const route = createRoute<'/(app)/admin/lessons/[lessonId]'>()

const NO_MODULE = ''

/**
 * A aula: vídeo (ou áudio, ou foto), título e texto.
 *
 * Rota **plana** (`/admin/lessons/<id>`), não aninhada em `courses/[courseId]/`: o id da
 * aula é único no banco, e uma pasta `[courseId]/` ao lado do arquivo `[courseId].tsx`
 * daria ao roteador dois nós com o mesmo nome de parâmetro. O caminho de volta sai da
 * própria aula (`courseId`).
 *
 * A mídia grava na hora em que o upload termina — como no composer de post. O resto
 * (título, texto, módulo, publicada, grátis) é rascunho local até o "Salvar".
 */
export const AdminLessonEditPage = memo(() => {
  const router = useRouter()
  const { lessonId } = useParams<{ lessonId?: string }>()
  const invalidate = useInvalidateAfterAdminWrite()
  const wide = useMedia().md

  const coursesQuery = useAdminCourses()
  const courses = coursesQuery.data?.courses
  const course = courses?.find((item) => item.lessons.some((l) => l.id === lessonId))
  const lesson = course?.lessons.find((l) => l.id === lessonId)

  const [draft, setDraft] = useState({
    title: '',
    body: '',
    moduleId: NO_MODULE,
    published: false,
    freePreview: false,
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (loaded || !lesson) return
    setDraft({
      title: lesson.title,
      body: lesson.body ?? '',
      moduleId: lesson.moduleId ?? NO_MODULE,
      published: lesson.published,
      freePreview: lesson.freePreview,
    })
    setLoaded(true)
  }, [lesson, loaded])

  if (!lesson && coursesQuery.isPending) {
    return (
      <YStack py="$10" items="center">
        <Spinner size="small" color="$accent9" />
      </YStack>
    )
  }

  if (!lesson || !course) {
    return (
      <AdminSection title="Aula não encontrada">
        <SizableText size="$3" color="$color10">
          Ela pode ter sido removida, ou o id da URL está errado.
        </SizableText>
      </AdminSection>
    )
  }

  const back = () => router.push(`/admin/courses/${course.id}`)

  const setMedia = async (mediaId: string | null) => {
    await adminCourses({ action: 'updateLesson', lessonId: lesson.id, mediaId })
    invalidate()
  }

  const save = async () => {
    if (saving || !draft.title.trim()) return
    setSaving(true)
    try {
      await adminCourses({
        action: 'updateLesson',
        lessonId: lesson.id,
        title: draft.title.trim(),
        body: draft.body.trim() || null,
        moduleId: draft.moduleId || null,
        published: draft.published,
        freePreview: draft.freePreview,
      })
      invalidate()
      showToast('Aula salva', { type: 'success' })
    } catch (error) {
      showToast('Não deu para salvar', {
        type: 'error',
        message: apiMessage(error, ADMIN_MESSAGES),
      })
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <XStack gap="$2">
      <Button size="$3" variant="outlined" onPress={back} data-testid="back-to-course">
        Voltar ao curso
      </Button>
      <Button
        size="$3"
        variant="accent"
        onPress={save}
        disabled={saving || !draft.title.trim()}
        data-testid="save-lesson"
      >
        <SizableText size="$3" fontWeight="600" color="$accentColor">
          {saving ? 'Salvando…' : 'Salvar'}
        </SizableText>
      </Button>
    </XStack>
  )

  return (
    <>
      <AdminSection
        title="Editar aula"
        detail={`${course.title} · ${lesson.published ? 'Publicada' : 'Rascunho'}`}
        action={wide ? actions : null}
      >
        <YStack gap="$5" maxW={720}>
          {/* mídia primeiro: é o que define a aula */}
          <LessonMediaField
            label="Vídeo da aula"
            media={lesson.media}
            accept="any"
            emptyHint="vídeo, áudio ou foto — a duração sai do arquivo"
            onChange={setMedia}
          />

          <TextField
            label="Título"
            value={draft.title}
            onChange={(title) => setDraft((d) => ({ ...d, title }))}
            placeholder="O que esta aula ensina"
            testID="lesson-title"
            size="lg"
          />

          <TextField
            label="Texto"
            value={draft.body}
            onChange={(body) => setDraft((d) => ({ ...d, body }))}
            placeholder="Roteiro, resumo ou links da aula. Linha em branco separa parágrafos."
            multiline
            testID="lesson-body"
          />

          <YStack
            gap="$4"
            p="$3"
            rounded="$6"
            borderWidth={1}
            borderColor="$borderColor"
            bg="$color1"
          >
            <SizableText size="$3" fontWeight="700">
              Publicação
            </SizableText>

            <OptionRow
              label="Módulo"
              hint="Mudar de módulo coloca a aula no fim do módulo novo."
              options={[
                ...course.modules.map((m) => ({ id: m.id, label: m.title })),
                { id: NO_MODULE, label: 'Sem módulo' },
              ]}
              value={draft.moduleId}
              onChange={(moduleId) => setDraft((d) => ({ ...d, moduleId }))}
            />

            <OptionRow
              label="Situação"
              options={[
                { id: 'rascunho', label: 'Rascunho' },
                { id: 'publicada', label: 'Publicada' },
              ]}
              value={draft.published ? 'publicada' : 'rascunho'}
              onChange={(value) =>
                setDraft((d) => ({ ...d, published: value === 'publicada' }))
              }
            />

            <OptionRow
              label="Aula grátis"
              hint="Abre mesmo para quem não assina — é a amostra do curso."
              options={[
                { id: 'nao', label: 'Só para quem tem acesso' },
                { id: 'sim', label: 'Grátis' },
              ]}
              value={draft.freePreview ? 'sim' : 'nao'}
              onChange={(value) => setDraft((d) => ({ ...d, freePreview: value === 'sim' }))}
            />
          </YStack>
        </YStack>
      </AdminSection>

      {!wide ? <AdminActionBar>{actions}</AdminActionBar> : null}
    </>
  )
})
