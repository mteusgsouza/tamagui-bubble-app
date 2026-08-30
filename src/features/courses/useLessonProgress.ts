// Gravação do progresso da aula.
//
// O player reporta posição o tempo todo — na web o `timeupdate` dispara ~4x por segundo,
// no nativo 1x. Cada `zero.mutate` é uma escrita sincronizada com o servidor, então
// gravar a cada tique inundaria a fila de mutations (e o `ZERO_PER_USER_MUTATION_LIMIT`
// do `package.json` é 30 por minuto — sem throttle, um minuto de vídeo já estoura).
//
// Aqui a posição entra numa ref a cada tique e só vira mutation a cada
// `SAVE_INTERVAL_MS`, mais um flush ao desmontar — sair da aula no meio guarda onde
// parou.

import { useCallback, useEffect, useRef } from 'react'

import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { zero } from '~/zero/client'

import { COMPLETE_THRESHOLD } from './courseStats'

/** no máximo uma escrita a cada 10 s por aula */
const SAVE_INTERVAL_MS = 10_000

/** posição menor que isso é o começo: não vale gravar nem retomar */
const MIN_POSITION_SEC = 3

type Options = {
  lessonId: string
  /** já concluída? evita regravar `completedAt` e disparar mutation à toa */
  alreadyComplete?: boolean
}

export function useLessonProgress({ lessonId, alreadyComplete }: Options) {
  const { user } = useAuth()
  const userId = user?.id || ''

  // última posição reportada pelo player, ainda não necessariamente gravada
  const pendingRef = useRef<{ position: number; duration: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completedRef = useRef(Boolean(alreadyComplete))

  // o id só é usado na primeira gravação desta aula; mantê-lo estável evita criar
  // linha nova se duas gravações saírem antes de a primeira sincronizar
  const idRef = useRef(newId())

  useEffect(() => {
    completedRef.current = Boolean(alreadyComplete)
  }, [alreadyComplete])

  // trocou de aula: zera tudo, senão a posição de uma vazaria para a outra
  useEffect(() => {
    pendingRef.current = null
    idRef.current = newId()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [lessonId])

  const write = useCallback(
    (positionSec: number, complete: boolean) => {
      if (!userId) return
      // `Date.now()` e `newId()` na tela, nunca dentro da mutation: ela roda duas vezes
      // (otimista e autoritativa) e as duas execuções têm que convergir
      zero.mutate.lessonProgress.save({
        id: idRef.current,
        userId,
        lessonId,
        positionSec: Math.floor(positionSec),
        updatedAt: Date.now(),
        completedAt: complete ? Date.now() : undefined,
      })
    },
    [userId, lessonId],
  )

  const flush = useCallback(() => {
    const pending = pendingRef.current
    if (!pending || pending.position < MIN_POSITION_SEC) return
    pendingRef.current = null
    write(pending.position, false)
  }, [write])

  /** Passe direto no `onProgress` do `<MediaView>`. Não precisa memoizar do lado de lá. */
  const onProgress = useCallback(
    (positionSec: number, durationSec: number) => {
      if (!userId) return
      pendingRef.current = { position: positionSec, duration: durationSec }

      // assistiu quase tudo: marca concluída na hora, sem esperar o intervalo
      if (
        !completedRef.current &&
        durationSec > 0 &&
        positionSec / durationSec >= COMPLETE_THRESHOLD
      ) {
        completedRef.current = true
        pendingRef.current = null
        write(positionSec, true)
        return
      }

      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        flush()
      }, SAVE_INTERVAL_MS)
    },
    [userId, write, flush],
  )

  /** Botão "Marcar como concluída". */
  const markComplete = useCallback(() => {
    if (!userId) return
    completedRef.current = true
    const position = pendingRef.current?.position ?? 0
    pendingRef.current = null
    write(position, true)
  }, [userId, write])

  /** Fim do vídeo: conclui sozinho. */
  const onEnded = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    const position = pendingRef.current?.position ?? 0
    pendingRef.current = null
    write(position, true)
  }, [write])

  // sair da aula grava o que ficou pendente — é o caso comum: assistiu 4 min e voltou
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const pending = pendingRef.current
      if (pending && pending.position >= MIN_POSITION_SEC && userId) {
        write(pending.position, false)
      }
    }
  }, [write, userId])

  return { onProgress, onEnded, markComplete, canSave: Boolean(userId) }
}
