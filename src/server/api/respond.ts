// O formato de resposta que as rotas já usavam — agora num lugar só.
//
// `const fail = ...` estava copiado **idêntico em sete arquivos** (`admin/people`,
// `billing/checkout`, `billing/portal`, `billing/webhook/[provider]`, `media/[id]/play`,
// `media/complete`, `media/upload-url`). Com a quantidade de rotas que a saída do Zero
// traz, manter a cópia garantiria divergência.
//
// O contrato não muda: `{ error, code }` com status HTTP, mensagem em português voltada
// ao usuário final. O `code` é o que a tela traduz (`billingMessage`), o `error` é o
// fallback quando o código é desconhecido.

/** Resposta de erro. `code` é contrato com a tela; `message` é o fallback legível. */
export const fail = (status: number, code: string, message: string) =>
  Response.json({ error: message, code }, { status })

/**
 * Os erros que toda rota repete. Existe para o código ser o mesmo em todo lugar — tela
 * que traduz `'unauthenticated'` não pode precisar saber que uma rota escreveu
 * `'unauthorized'`.
 */
export const FAIL = {
  unauthenticated: () => fail(401, 'unauthenticated', 'Faça login.'),
  forbidden: (message = 'Você não tem acesso a isto.') => fail(403, 'forbidden', message),
  notFound: (message = 'Não encontrado.') => fail(404, 'not-found', message),
  invalidJson: () => fail(400, 'invalid-json', 'Corpo da requisição não é JSON.'),
  missingFields: (message = 'Faltam campos obrigatórios.') =>
    fail(400, 'missing-fields', message),
  unknownAction: () => fail(400, 'unknown-action', 'Ação desconhecida.'),
} as const

/**
 * Corpo JSON, ou `null` quando não dá para ler.
 *
 * Devolve `null` em vez de lançar porque o chamador precisa responder 400 com o código
 * certo, e `try/catch` em volta de cada `await request.json()` era o que as rotas faziam
 * à mão. O tipo é uma promessa do chamador, não uma validação — igual ao que já existe.
 */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

/**
 * Um segmento dinâmico do caminho.
 *
 * ⚠️ **Por que regex e não `params`:** o tipo `Endpoint` do One só declara `(req)`,
 * embora o runtime chame `(req, { params })`. Em vez de brigar com o tipo, as rotas
 * daqui tiram o id do caminho — padrão que `app/api/media/[id]/play+api.ts` estabeleceu.
 */
export const pathParam = (request: Request, pattern: RegExp): string | null =>
  pattern.exec(new URL(request.url).pathname)?.[1] ?? null
