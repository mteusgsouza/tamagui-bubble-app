import { useParams, useRouter, createRoute } from 'one'
import { memo, useEffect, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminPost } from '~/data/queries/admin'
import { activePlans } from '~/data/queries/subscription'
import { AdminSection } from '~/features/admin/AdminShell'
import { MediaPicker } from '~/features/admin/MediaPicker'
import { OptionRow, TextField } from '~/features/admin/fields'
import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { Button } from '~/interface/buttons/Button'
import { useQuery, zero } from '~/zero/client'

import type { PostKind, Visibility } from '~/data/types'

const route = createRoute<'/(app)/admin/posts/[postId]'>()

const KINDS: { id: PostKind; label: string }[] = [
  { id: 'text', label: 'Texto' },
  { id: 'photo', label: 'Foto' },
  { id: 'video', label: 'Vídeo' },
  { id: 'audio', label: 'Áudio' },
]

const VISIBILITIES: { id: Visibility; label: string }[] = [
  { id: 'subscribers', label: 'Assinantes' },
  { id: 'public', label: 'Aberto a todos' },
]

export const AdminPostEditPage = memo(() => {
  const router = useRouter()
  const { postId, novo } = useParams<{ postId?: string; novo?: string }>()
  const { user } = useAuth()
  const userId = user?.id || ''

  const isNew = novo === '1'

  const [post, status] = useQuery(
    adminPost,
    { postId: postId || '', userId },
    { enabled: Boolean(postId && userId && !isNew) },
  )
  const [plans] = useQuery(activePlans, { enabled: Boolean(userId) })

  // rascunho local: o Zero é a fonte, mas digitar não pode disparar mutation por tecla
  const [draft, setDraft] = useState({
    title: '',
    body: '',
    kind: 'text' as PostKind,
    visibility: 'subscribers' as Visibility,
    requiredPlanId: null as string | null,
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // carrega o post no formulário uma vez; depois disso quem manda é o que está digitado
  useEffect(() => {
    if (loaded || isNew || !post) return
    const row = post as any
    setDraft({
      title: row.title || '',
      body: row.body || '',
      kind: row.kind,
      visibility: row.visibility,
      requiredPlanId: row.requiredPlanId ?? null,
    })
    setLoaded(true)
  }, [post, loaded, isNew])

  const row = post as any
  const exists = Boolean(row)
  const isLoading = !isNew && status?.type !== 'complete' && !post

  const save = async () => {
    if (!postId || !userId || saving) return
    setSaving(true)
    try {
      const shared = {
        kind: draft.kind,
        title: draft.title.trim() || undefined,
        body: draft.body.trim() || undefined,
        visibility: draft.visibility,
        requiredPlanId: draft.requiredPlanId ?? undefined,
      }

      if (exists) {
        await zero.mutate.post.update({ id: postId, ...shared })
      } else {
        // `newId()` e `Date.now()` na tela, nunca dentro da mutation
        await zero.mutate.post.insert({
          id: postId,
          feedOwnerId: MASTER_USER_ID,
          published: false,
          publishedAt: undefined,
          likeCount: 0,
          commentCount: 0,
          deleted: false,
          createdAt: Date.now(),
          ...shared,
        })
        // sai do modo "novo" para a tela passar a editar em vez de recriar
        router.replace(`/admin/posts/${postId}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    if (!postId || !exists) return
    if (row.published) {
      await zero.mutate.post.update({ id: postId, published: false })
    } else {
      await zero.mutate.post.publish({ id: postId, publishedAt: Date.now() })
    }
  }

  const remove = async () => {
    if (!postId || !exists) return
    await zero.mutate.post.softDelete({ id: postId })
    router.replace('/admin/posts')
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
      <AdminSection title="Post não encontrado">
        <SizableText size="$3" color="$color10">
          Ele pode ter sido removido de vez, ou o id da URL está errado.
        </SizableText>
      </AdminSection>
    )
  }

  return (
    <AdminSection
      title={isNew && !exists ? 'Novo post' : 'Editar post'}
      detail={
        exists
          ? row.deleted
            ? 'Apagado — só você vê'
            : row.published
              ? 'Publicado'
              : 'Rascunho'
          : 'Ainda não salvo'
      }
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
            disabled={saving}
            data-testid="save-post"
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
          onChange={(title) => setDraft((d) => ({ ...d, title }))}
          placeholder="O que este post diz em uma linha"
          testID="post-title"
        />

        <TextField
          label="Texto"
          value={draft.body}
          onChange={(body) => setDraft((d) => ({ ...d, body }))}
          placeholder="Escreva aqui. Linha em branco separa parágrafos."
          multiline
          testID="post-body"
        />

        <OptionRow
          label="Tipo"
          options={KINDS}
          value={draft.kind}
          onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
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

        {exists ? (
          <MediaPicker
            postId={postId!}
            kind={draft.kind}
            attached={(row.media ?? []) as any[]}
          />
        ) : (
          <SizableText size="$2" color="$color10">
            Salve o post para poder anexar mídia.
          </SizableText>
        )}

        {exists && !row.deleted ? (
          <XStack pt="$4">
            <Button size="$2" variant="outlined" onPress={remove}>
              <SizableText size="$2" color="$red10">
                Apagar post
              </SizableText>
            </Button>
          </XStack>
        ) : null}
      </YStack>
    </AdminSection>
  )
})
