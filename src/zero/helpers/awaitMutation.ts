import type { PromiseWithServerResult } from '@rocicorp/zero'

/** O desfecho de uma mutation, do ponto de vista de quem vai avisar a tela. */
export type MutationOutcome =
  | { ok: true }
  /** o servidor recusou (permissão, validação) — o Zero desfaz o otimista sozinho */
  | { ok: false; pending: false; message: string }
  /** sem resposta a tempo: continua na fila e sincroniza quando a conexão voltar */
  | { ok: false; pending: true; message: string }

const DEFAULT_TIMEOUT_MS = 8000

const PENDING_MESSAGE =
  'Sem resposta do servidor. A alteração fica na fila e sobe sozinha quando a conexão voltar.'

/**
 * Espera a confirmação **do servidor** de uma mutation do Zero.
 *
 * ⚠️ `zero.mutate.x.update(...)` **não devolve uma promise** — devolve
 * `{ client, server }`. Então `await zero.mutate...` resolve no mesmo instante, sem
 * esperar nada, e nunca lança: qualquer `try/catch` em volta dele é decoração. Uma tela
 * que quer dizer "salvo" ou "não deu" precisa esperar o `server`, que é onde a regra de
 * permissão roda de verdade (a versão otimista do cliente sempre passa).
 *
 * O timeout existe porque `server` só resolve com conexão: offline ele nunca volta, e
 * o botão ficaria em "Salvando…" para sempre. Estourado o prazo a mutation **não** é
 * perdida — ela continua na fila do Zero — e por isso o desfecho é `pending`, não erro.
 */
export async function awaitMutation(
  result: PromiseWithServerResult,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<MutationOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined

  // o `.then` com dois ramos, e não um try/catch em volta do race: se o timeout ganhar
  // a corrida, a rejeição de `server` chegaria depois sem ninguém escutando — e isso é
  // unhandled rejection. Assim `server` sempre tem tratador, ganhe ou perca.
  const acked = result.server.then(
    (details): MutationOutcome =>
      details.type === 'error'
        ? { ok: false, pending: false, message: details.error.message }
        : { ok: true },
    (err): MutationOutcome => ({
      ok: false,
      pending: false,
      message: err instanceof Error ? err.message : String(err),
    }),
  )

  const timedOut = new Promise<MutationOutcome>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, pending: true, message: PENDING_MESSAGE }),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([acked, timedOut])
  } finally {
    clearTimeout(timer)
  }
}
