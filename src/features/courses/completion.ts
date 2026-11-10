// Quando um curso conta como terminado.
//
// 🔴 **Zero imports, de propósito.** A emissão do certificado acontece no servidor e a
// tela usa a mesma regra no cliente. `courseStats.ts` importa `./types`, que puxa o
// `MediaFrame` e, com ele, o Tamagui — uma função sem import pode ser chamada dos dois
// lados sem arrastar UI para o bundle do servidor.

export type CompletionRule = {
  completionRule: 'all' | 'min-lessons'
  minLessons: number | null
}

/**
 * O curso está concluído para quem tem estas contagens?
 *
 * - curso sem aula **não** conclui: `0 de 0` não é 100%
 * - `min-lessons` sem número vale como `all` — não quebra e não libera de graça
 * - `min-lessons` acima do total nunca conclui (o admin é avisado na tela)
 */
export function isCourseComplete(
  rule: CompletionRule,
  counts: { completedCount: number; lessonCount: number },
): boolean {
  const { completedCount, lessonCount } = counts
  if (lessonCount <= 0) return false

  const needed =
    rule.completionRule === 'min-lessons' && rule.minLessons != null && rule.minLessons > 0
      ? rule.minLessons
      : lessonCount

  // `needed > lessonCount` ficaria inalcançável de qualquer jeito; explícito para quem lê
  if (needed > lessonCount) return false
  return completedCount >= needed
}

/** O mínimo configurado passa do total de aulas — o curso nunca emitiria. */
export const minLessonsUnreachable = (rule: CompletionRule, lessonCount: number) =>
  rule.completionRule === 'min-lessons' &&
  rule.minLessons != null &&
  rule.minLessons > lessonCount
