import { string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type PostContent = TableInsertRow<typeof schema>

/**
 * O texto do post, fora da linha do post.
 *
 * **É aqui que o paywall mora agora.** `post` sincroniza para todo mundo (título, tipo,
 * data, contadores, `teaser`) e esta tabela só chega a quem tem direito — porque
 * permission do Zero é por linha, e não existe "sincroniza o post sem o `body`".
 *
 * Corolário para a tela: **`post` sem `content` é o sinal de bloqueado.** Não invente
 * flag nova nem pergunte ao servidor.
 */
export const schema = table('postContent')
  .columns({
    postId: string(),
    body: string().optional(),
  })
  .primaryKey('postId')

/**
 * Só o dono do feed escreve.
 *
 * ⚠️ Não dá para checar `feedOwnerId` aqui direto — ele está em `post`. O `exists` sobe
 * pela relação; é a mesma forma que as permissions de `comment` e `reaction` usam.
 */
const canWrite = serverWhere('postContent', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where('feedOwnerId', userId))
})

export const mutate = mutations(schema, canWrite)
