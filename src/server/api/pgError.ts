// Reconhecer erro do Postgres através do embrulho do Drizzle.
//
// 🔴 **`error.code` não é o código do Postgres.** O Drizzle lança `DrizzleQueryError` e
// põe o `DatabaseError` original em `cause` — às vezes aninhado mais de um nível. Checar
// só o topo faz violação de índice único cair no `catch` genérico e virar **500**, quando
// o certo é 422 com a frase que o usuário resolve ("já existe um plano com esse slug").
// Foi exatamente o que aconteceu no primeiro teste da rota de cursos.

/** Percorre a cadeia de `cause` procurando um `code` de erro do Postgres. */
function pgCode(error: unknown, depth = 0): string | null {
  if (depth > 5 || typeof error !== 'object' || error === null) return null

  const { code, cause } = error as { code?: unknown; cause?: unknown }
  if (typeof code === 'string' && /^\d{5}$/.test(code)) return code

  return pgCode(cause, depth + 1)
}

/** `23505` — violação de índice ou constraint único. */
export const isUniqueViolation = (error: unknown) => pgCode(error) === '23505'

/** `23503` — violação de chave estrangeira. */
export const isForeignKeyViolation = (error: unknown) => pgCode(error) === '23503'
