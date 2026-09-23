import { createRoute, useParams, useRouter } from 'one'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminPosts } from '~/data/client/api'
import { useAdminPost, usePlans } from '~/data/client/hooks'
import { ADMIN_MESSAGES } from '~/data/client/messages'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { AdminSection } from '~/features/admin/AdminShell'
import { OptionRow, TextField } from '~/features/admin/fields'
import { PostMediaField } from '~/features/admin/PostMediaField'
import { deriveKind } from '~/features/admin/postMediaRules'
import { useAuth } from '~/features/auth/client/authClient'
import { Button } from '~/interface/buttons/Button'
import { apiMessage } from '~/helpers/apiMessage'
import { showToast } from '~/interface/toast/helpers'

import type { PostKind, Visibility } from '~/data/enums'

const route = createRoute<'/(app)/admin/posts/[postId]'>()

const VISIBILITIES: { id: Visibility; label: string }[] = [
  { id: 'subscribers', label: 'Assinantes' },
  { id: 'public', label: 'Aberto a todos' },
]

/**
 * Roda a escrita e reporta em toast.
 *
 * O estado `pending` ("ainda não confirmado, mas não se perdeu") morreu com o Zero e a
 * fila de mutations offline. Agora é binário: ou o servidor aceitou, ou falhou — o que
 * simplifica a tela e é honesto, porque não existe mais fila para segurar a escrita.
 */
const report = async (action: () => Promise<unknown>, done: string, failed: string) => {
  try {
    await action()
    showToast(done, { type: 'success' })
    return true
  } catch (error) {
    showToast(failed, { type: 'error', message: apiMessage(error, ADMIN_MESSAGES) })
    return false
  }
}

export const AdminPostEditPage = memo(() => {
  const router = useRouter()
  const { postId, novo } = useParams<{ postId?: string; novo?: string }>()
  const { user } = useAuth()
  const userId = user?.id || ''

  const isNew = novo === '1'

  const postQuery = useAdminPost(postId || '', !isNew)
  const post = postQuery.data?.post
  const plans = usePlans().data?.plans
  const invalidate = useInvalidateAfterAdminWrite()

  // rascunho local: o servidor é a fonte, mas digitar não pode disparar requisição por tecla.
  // `kind` NÃO entra aqui — ele é deduzido da mídia, nunca escolhido.
  const [draft, setDraft] = useState({
    title: '',
    // vai para `postContent`, atrás do paywall — não é coluna de `post`
    body: '',
    // vai para `post`, e é **público**: é o que o não-assinante vê no card bloqueado
    teaser: '',
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
      body: row.content?.body || '',
      teaser: row.teaser || '',
      visibility: row.visibility,
      requiredPlanId: row.requiredPlanId ?? null,
    })
    setLoaded(true)
  }, [post, loaded, isNew])

  const row = post as any
  const exists = Boolean(row)
  const isLoading = !isNew && postQuery.isPending

  const attached = (row?.media ?? []) as any[]
  const kind = deriveKind(attached)

  // anexar mídia já grava, então o `kind` do banco tem que acompanhar na hora —
  // esperar o "Salvar" deixaria o card do feed com o rótulo errado nesse meio.
  const createdRef = useRef(false)
  const savedKindRef = useRef<PostKind | null>(null)

  const fields = () => ({
    kind,
    title: draft.title.trim() || null,
    teaser: draft.teaser.trim() || null,
    body: draft.body,
    visibility: draft.visibility,
    // plano só faz sentido em post de assinante
    requiredPlanId: draft.visibility === 'subscribers' ? draft.requiredPlanId : null,
  })

  /**
   * Grava o post e o corpo.
   *
   * 🔴 **Uma chamada, uma transação.** Antes eram quatro mutations encadeadas mais
   * `createdRef`, `createAckRef` e um `insert`-ou-`update` escolhido na tela, porque o
   * corpo vive em `postContent` desde a Fase 12 e o CRUD gerado pelo Zero não tinha
   * upsert. Agora quem decide entre criar e atualizar é o `on conflict (id)` no
   * servidor, e a linha de `postContent` nasce junto — a ausência dela é o sinal de
   * "bloqueado", então post sem ela apareceria com paywall até para o criador.
   *
   * O id continua nascendo no cliente: ele veio na URL, e o anexo de mídia precisa que
   * a linha exista antes do arquivo (`postMedia.postId` é FK).
   */
  const persist = () => adminPosts({ action: 'save', id: postId!, ...fields() })

  const onKindChange = useCallback(
    (next: PostKind) => {
      if (!postId || (!exists && !createdRef.current)) return
      if (savedKindRef.current === next || row?.kind === next) {
        savedKindRef.current = next
        return
      }
      savedKindRef.current = next
      void adminPosts({ action: 'save', id: postId, ...fields(), kind: next }).then(invalidate)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postId, exists, row?.kind],
  )

  /**
   * Materializa o rascunho antes do primeiro anexo de mídia.
   *
   * `postMedia.postId` é FK, então o post precisa existir antes do arquivo — mas isso é
   * problema nosso, não de quem publica: escolher um arquivo já basta.
   */
  const ensurePost = async () => {
    if (exists || createdRef.current) return true
    if (!postId || !MASTER_USER_ID) return false

    createdRef.current = true
    try {
      await persist()
      invalidate()
      // sai do modo "novo": daqui pra frente a tela edita em vez de recriar
      router.replace(`/admin/posts/${postId}`)
      return true
    } catch {
      createdRef.current = false
      return false
    }
  }

  const save = async () => {
    if (!postId || saving) return
    setSaving(true)
    try {
      const ok = await report(persist, 'Post salvo', 'Não deu para salvar')
      if (ok) {
        invalidate()
        if (!exists && !createdRef.current) {
          createdRef.current = true
          router.replace(`/admin/posts/${postId}`)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async () => {
    if (!postId || !exists || busy) return
    setBusy(true)
    const wasPublished = Boolean(row.published)
    try {
      await report(
        () =>
          adminPosts({ action: wasPublished ? 'unpublish' : 'publish', id: postId }),
        wasPublished ? 'Post despublicado' : 'Post publicado',
        wasPublished ? 'Não deu para despublicar' : 'Não deu para publicar',
      )
      invalidate()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!postId || !exists || busy) return
    setBusy(true)
    let ok = false
    try {
      ok = await report(
        () => adminPosts({ action: 'delete', id: postId }),
        'Post apagado',
        'Não deu para apagar',
      )
    } finally {
      setBusy(false)
    }
    if (ok) {
      invalidate()
      router.replace('/admin/posts')
    }
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

        {/* Só faz diferença em post de assinante: no post público não há o que bloquear,
            e o texto inteiro já aparece. */}
        {draft.visibility === 'subscribers' ? (
          <TextField
            label="Isca (quem não assina vê isto)"
            value={draft.teaser}
            onChange={(teaser) => setDraft((d) => ({ ...d, teaser }))}
            placeholder="Uma ou duas linhas que dão vontade de assinar."
            multiline
            testID="post-teaser"
          />
        ) : null}

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
