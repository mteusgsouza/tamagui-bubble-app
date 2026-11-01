import { describe, expect, test } from 'vitest'

import { draftToFeedPost } from '~/features/admin/postPreview'
import { isPostLocked, postMediaItems } from '~/features/feed/types'

import type { PostDraft } from '~/features/admin/postPreview'
import type { AttachedMedia } from '~/features/admin/postMediaRules'

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
  title: 'Título',
  body: 'O corpo do post, que é o produto.',
  teaser: 'A isca.',
  visibility: 'subscribers',
  requiredPlanId: null,
  ...over,
})

const foto: AttachedMedia = {
  id: 'pm-1',
  position: 0,
  media: { id: 'm1', kind: 'photo', width: 1080, height: 1920, focalX: 0.4, focalY: 0.2 },
}

const autor = { id: 'u1', name: 'Criador', image: null }

describe('prévia de quem assina', () => {
  test('mostra o post inteiro: corpo e mídia', () => {
    const post = draftToFeedPost(draft(), [foto], autor, { as: 'subscriber' })

    expect(isPostLocked(post)).toBe(false)
    expect(post.content?.body).toBe('O corpo do post, que é o produto.')
    expect(postMediaItems(post)).toHaveLength(1)
  })

  test('o tipo sai da mídia, como no resto do app', () => {
    expect(draftToFeedPost(draft(), [foto], autor, { as: 'subscriber' }).kind).toBe('photo')
    expect(draftToFeedPost(draft(), [], autor, { as: 'subscriber' }).kind).toBe('text')
  })

  test('🔴 dimensão e ponto focal atravessam — senão a prévia recorta diferente do feed', () => {
    const [media] = postMediaItems(
      draftToFeedPost(draft(), [foto], autor, { as: 'subscriber' }),
    )

    expect(media).toMatchObject({ width: 1080, height: 1920, focalX: 0.4, focalY: 0.2 })
  })
})

describe('prévia de quem não assina', () => {
  test('🔴 reproduz o servidor: sem corpo e sem mídia', () => {
    // é o contrato de `src/server/content/posts.ts` — a ausência de `content` **é** o
    // sinal de bloqueado, e mídia não vai porque mídia é produto
    const post = draftToFeedPost(draft(), [foto], autor, { as: 'visitor' })

    expect(isPostLocked(post)).toBe(true)
    expect(post.content).toBeNull()
    expect(postMediaItems(post)).toHaveLength(0)
  })

  test('a isca continua indo: é o que o card bloqueado mostra', () => {
    const post = draftToFeedPost(draft(), [foto], autor, { as: 'visitor' })
    expect(post.teaser).toBe('A isca.')
  })

  test('🔴 post aberto NÃO tem estado bloqueado', () => {
    // o gate do servidor só olha `visibility = 'subscribers'`. Fingir bloqueio aqui
    // faria a tela prometer um paywall que não existe.
    const post = draftToFeedPost(draft({ visibility: 'public' }), [foto], autor, {
      as: 'visitor',
    })

    expect(isPostLocked(post)).toBe(false)
    expect(postMediaItems(post)).toHaveLength(1)
  })
})

describe('o rascunho virando card', () => {
  test('campo em branco vira null, não string vazia', () => {
    // o card desenharia uma linha de título vazia ocupando espaço
    const post = draftToFeedPost(draft({ title: '   ', teaser: '' }), [], autor, {
      as: 'subscriber',
    })

    expect(post.title).toBeNull()
    expect(post.teaser).toBeNull()
  })

  test('plano exigido só sobrevive em post de assinante', () => {
    const base = draft({ requiredPlanId: 'plan-anual' })

    expect(draftToFeedPost(base, [], autor, { as: 'subscriber' }).requiredPlanId).toBe(
      'plan-anual',
    )
    expect(
      draftToFeedPost({ ...base, visibility: 'public' }, [], autor, { as: 'subscriber' })
        .requiredPlanId,
    ).toBeNull()
  })

  test('rascunho tem data: `timeAgo(null)` devolveria string vazia', () => {
    // o card ficaria com um " · assinantes" solto no lugar da data
    const post = draftToFeedPost(draft(), [], autor, { as: 'subscriber' })
    expect(post.publishedAt).toBeGreaterThan(0)
  })

  test('contadores nascem zerados: rascunho não tem curtida nem comentário', () => {
    const post = draftToFeedPost(draft(), [], autor, { as: 'subscriber' })
    expect(post.likeCount).toBe(0)
    expect(post.commentCount).toBe(0)
    expect(post.liked).toBe(false)
  })

  test('sem autor carregado a prévia ainda monta', () => {
    // acontece no primeiro render, antes de `useAuth` resolver
    const post = draftToFeedPost(draft(), [], null, { as: 'subscriber' })
    expect(post.feedOwner).toBeNull()
    expect(post.feedOwnerId).toBe('')
  })

  test('vínculo sem mídia carregada não entra na prévia', () => {
    const orphan: AttachedMedia = { id: 'pm-x', media: null }
    const post = draftToFeedPost(draft(), [orphan, foto], autor, { as: 'subscriber' })
    expect(postMediaItems(post)).toHaveLength(1)
  })
})
