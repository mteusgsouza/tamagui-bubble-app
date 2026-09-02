import { createRoute, useParams, useRouter } from 'one'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminPost } from '~/data/queries/admin'
import { activePlans } from '~/data/queries/subscription'
import { AdminSection } from '~/features/admin/AdminShell'
import { OptionRow, TextField } from '~/features/admin/fields'
import { PostMediaField } from '~/features/admin/PostMediaField'
import { deriveKind } from '~/features/admin/postMediaRules'
import { useAuth } from '~/features/auth/client/authClient'
import { Button } from '~/interface/buttons/Button'
import { showToast } from '~/interface/toast/helpers'
import { useQuery, zero } from '~/zero/client'
import { awaitMutation } from '~/zero/helpers/awaitMutation'

import type { PostKind, Visibility } from '~/data/types'
import type { MutationOutcome } from '~/zero/helpers/awaitMutation'

const route = createRoute<'/(app)/admin/posts/[postId]'>()

const VISIBILITIES: { id: Visibility; label: string }[] = [
  { id: 'subscribers', label: 'Assinantes' },
  { id: 'public', label: 'Aberto a todos' },
]

/**
 * Transforma o desfecho de uma mutation em toast.
 *
 * `pending` fica de fora do ramo de erro de propósito: nada se perdeu, o Zero só ainda
 * não conseguiu falar com o servidor. Chamar isso de falha faria quem publica salvar
 * de novo — e o texto voltaria a subir duas vezes.
 */
const reportOutcome = (outcome: MutationOutcome, done: string, failed: string) => {
  if (outcome.ok) {
    showToast(done, { type: 'success' })
  } else if (outcome.pending) {
    showToast('Ainda não confirmado', { type: 'warn', message: outcome.message })
  } else {
    showToast(failed, { type: 'error', message: outcome.message })
  }
}

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

  // rascunho local: o Zero é a fonte, mas digitar não pode disparar mutation por tecla.
  // `kind` NÃO entra aqui — ele é deduzido da mídia, nunca escolhido.
  const [draft, setDraft] = useState({
    title: '',
    body: '',
    visibility: 'subscribers' as Visibility,
    requiredPlanId: null as string | null,
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  // publicar e apagar agora esperam o servidor responder, então dá tempo de clicar duas
  // vezes — este `busy` é o que impede o segundo clique
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loaded || isNew || !post) return
    const row = post as any
    setDraft({
      title: row.title || '',
      body: row.body || '',
      visibility: row.visibility,
      requiredPlanId: row.requiredPlanId ?? null,
    })
    setLoaded(true)
  }, [post, loaded, isNew])

  const row = post as any
  const exists = Boolean(row)
  const isLoading = !isNew && status?.type !== 'complete' && !post

  const attached = (row?.media ?? []) as any[]
  const kind = deriveKind(attached)

  // anexar mídia já é mutation imediata, então o `kind` do banco tem que acompanhar na
  // hora — esperar o "Salvar" deixaria o card do feed com o rótulo errado nesse meio.
  const createdRef = useRef(false)
  // o ack do servidor da criação. O "Salvar" espera por ele para saber o que dizer; o
  // anexo de mídia não espera nada — para ele basta a linha existir localmente, e as
  // mutations chegam ao servidor na ordem em que saíram.
  const createAckRef = useRef<Promise<MutationOutcome> | null>(null)
  const savedKindRef = useRef<PostKind | null>(null)
  const onKindChange = useCallback(
    (next: PostKind) => {
      // `createdRef` cobre a janela entre `ensurePost` criar a linha e a query refletir
      if (!postId || (!exists && !createdRef.current)) return
      if (savedKindRef.current === next || row?.kind === next) {
        savedKindRef.current = next
        return
      }
      savedKindRef.current = next
      void zero.mutate.post.update({ id: postId, kind: next })
    },
    [postId, exists, row?.kind],
  )

  const fields = () => ({
    kind,
    title: draft.title.trim() || undefined,
    body: draft.body.trim() || undefined,
    visibility: draft.visibility,
    // plano só faz sentido em post de assinante
    requiredPlanId:
      draft.visibility === 'subscribers'
        ? (draft.requiredPlanId ?? undefined)
        : undefined,
  })

  /**
   * Cria a linha do post se ela ainda não existe.
   *
   * Chamada pelo "Salvar" **e** pelo primeiro anexo de mídia: `postMedia.postId` é FK,
   * então o post precisa existir antes do arquivo — mas isso é problema nosso, não de
   * quem publica. O id já nasceu no cliente (veio na URL), então escolher um arquivo já
   * basta para materializar o rascunho.
   */
  const ensurePost = async () => {
    if (exists || createdRef.current) return true
    if (!postId || !userId || !MASTER_USER_ID) return false

    createdRef.current = true
    try {
      // `newId()` e `Date.now()` na tela, nunca dentro da mutation
      const created = zero.mutate.post.insert({
        id: postId,
        feedOwnerId: MASTER_USER_ID,
        published: false,
        publishedAt: undefined,
        likeCount: 0,
        commentCount: 0,
        deleted: false,
        createdAt: Date.now(),
        ...fields(),
      })
      // guarda o ack para o "Salvar", mas só espera o lado otimista aqui
      createAckRef.current = awaitMutation(created)
      const applied = await created.client
      if (applied.type === 'error') throw new Error(applied.error.message)
      // sai do modo "novo": daqui pra frente a tela edita em vez de recriar
      router.replace(`/admin/posts/${postId}`)
      return true
    } catch {
      createdRef.current = false
      createAckRef.current = null
      return false
    }
  }

  const save = async () => {
    if (!postId || !userId || saving) return
    setSaving(true)
    try {
      let outcome: MutationOutcome
      if (exists || createdRef.current) {
        outcome = await awaitMutation(zero.mutate.post.update({ id: postId, ...fields() }))
      } else if (await ensurePost()) {
        outcome = (await createAckRef.current) ?? { ok: true }
      } else {
        outcome = { ok: false, pending: false, message: 'A criação do post foi recusada.' }
      }
      reportOutcome(outcome, 'Post salvo', 'Não deu para salvar')
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    if (!postId || !exists || busy) return
    setBusy(true)
    const wasPublished = Boolean(row.published)
    try {
      const outcome = await awaitMutation(
        wasPublished
          ? zero.mutate.post.update({ id: postId, published: false })
          : zero.mutate.post.publish({ id: postId, publishedAt: Date.now() }),
      )
      reportOutcome(
        outcome,
        wasPublished ? 'Post despublicado' : 'Post publicado',
        wasPublished ? 'Não deu para despublicar' : 'Não deu para publicar',
      )
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!postId || !exists || busy) return
    setBusy(true)
    let outcome: MutationOutcome
    try {
      outcome = await awaitMutation(zero.mutate.post.softDelete({ id: postId }))
    } finally {
      setBusy(false)
    }
    reportOutcome(outcome, 'Post apagado', 'Não deu para apagar')
    // sai da tela de qualquer jeito que não seja recusa do servidor: em `pending` o
    // post já sumiu do feed localmente, ficar aqui só confundiria.
    if (outcome.ok || outcome.pending) router.replace('/admin/posts')
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

  const KIND_LABEL: Record<PostKind, string> = {
    text: 'Só texto',
    photo: 'Foto',
    video: 'Vídeo',
    audio: 'Áudio',
  }

  return (
    <AdminSection
      title={isNew && !exists ? 'Novo post' : 'Editar post'}
      detail={
        exists
          ? `${row.deleted ? 'Apagado — só você vê' : row.published ? 'Publicado' : 'Rascunho'} · ${KIND_LABEL[kind]}`
          : 'Ainda não salvo'
      }
      action={
        <XStack gap="$2">
          {exists ? (
            <Button
              size="$3"
              variant="outlined"
              onPress={togglePublish}
              disabled={busy}
            >
              {row.published ? 'Despublicar' : 'Publicar'}
            </Button>
          ) : null}
          <Button
            size="$3"
            variant="accent"
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
      <YStack gap="$5">
        {/* a mídia é o campo principal: vem primeiro, o tipo do post sai dela, e ela
            funciona desde o primeiro instante — `ensurePost` materializa o rascunho */}
        <PostMediaField
          postId={postId!}
          attached={attached}
          onKindChange={onKindChange}
          ensurePost={ensurePost}
        />

        <TextField
          label="Título"
          value={draft.title}
          onChange={(title) => setDraft((d) => ({ ...d, title }))}
          placeholder="O que este post diz em uma linha"
          testID="post-title"
          size="lg"
        />

        <TextField
          label="Texto"
          value={draft.body}
          onChange={(body) => setDraft((d) => ({ ...d, body }))}
          placeholder="Escreva aqui. Linha em branco separa parágrafos."
          multiline
          testID="post-body"
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
            label="Quem vê"
            options={VISIBILITIES}
            value={draft.visibility}
            onChange={(visibility) => setDraft((d) => ({ ...d, visibility }))}
          />

          {/* plano não faz sentido em post aberto */}
          {draft.visibility === 'subscribers' ? (
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
          ) : null}
        </YStack>

        {/* apagar é a única ação da tela que tira conteúdo do ar: ganha uma faixa
            própria, separada por linha, com o que acontece escrito antes do botão */}
        {exists && !row.deleted ? (
          <YStack gap="$2" pt="$4" borderTopWidth={1} borderColor="$borderColor">
            <SizableText size="$2" color="$color10">
              Apagar tira o post do feed e dos assinantes. Ele continua aqui, visível só
              para você.
            </SizableText>
            {/* o XStack impede o botão de esticar na largura toda */}
            <XStack>
              <Button
                size="$3"
                variant="danger"
                onPress={remove}
                disabled={busy}
                data-testid="delete-post"
              >
                Apagar post
              </Button>
            </XStack>
          </YStack>
        ) : null}
      </YStack>
    </AdminSection>
  )
})
