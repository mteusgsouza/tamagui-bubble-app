// Ordem do currículo — as contas por trás das setas ↑ ↓.
//
// Puro, sem I/O: é o que permite testar os casos de borda sem banco nem tela.
//
// `lesson.order` é **global no curso** (é ele que define "AULA 3 DE 24"), mas a tela
// mostra as aulas agrupadas por módulo. Subir uma aula, então, é trocá-la com a vizinha
// **do mesmo grupo** na lista global — não com a de cima, que pode ser de outro módulo.

export type OrderedLesson = { id: string; moduleId?: string | null; order: number }

const byOrder = <T extends { order: number; id: string }>(a: T, b: T) =>
  a.order - b.order || a.id.localeCompare(b.id)

export type Direction = 'up' | 'down'

/**
 * A nova ordem das aulas (lista de ids) depois de mover `id` uma casa dentro do módulo
 * dele, ou `null` quando não há para onde ir (primeira subindo, última descendo, aula
 * que não existe).
 */
export function moveLesson(
  lessons: readonly OrderedLesson[],
  id: string,
  direction: Direction,
): string[] | null {
  const sorted = [...lessons].sort(byOrder)
  const from = sorted.findIndex((item) => item.id === id)
  if (from < 0) return null

  const group = sorted[from]!.moduleId ?? null
  const step = direction === 'up' ? -1 : 1

  let to = from + step
  while (to >= 0 && to < sorted.length && (sorted[to]!.moduleId ?? null) !== group) to += step
  if (to < 0 || to >= sorted.length) return null

  const ids = sorted.map((item) => item.id)
  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
  return ids
}

/** O mesmo para módulos: troca com o vizinho imediato. */
export function moveModule(
  modules: readonly { id: string; order: number }[],
  id: string,
  direction: Direction,
): string[] | null {
  const sorted = [...modules].sort(byOrder)
  const from = sorted.findIndex((item) => item.id === id)
  const to = from + (direction === 'up' ? -1 : 1)
  if (from < 0 || to < 0 || to >= sorted.length) return null

  const ids = sorted.map((item) => item.id)
  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
  return ids
}

/**
 * A ordem global que o servidor grava depois de mexer em módulos: aulas seguem a
 * sequência dos módulos, e as soltas (sem módulo) vão por último. Sem isso, subir um
 * módulo mudaria a lista na tela mas não o "próxima aula" do player.
 */
export function sequenceLessons(
  modules: readonly { id: string; order: number }[],
  lessons: readonly OrderedLesson[],
): string[] {
  const rank = new Map(
    [...modules].sort(byOrder).map((item, index) => [item.id, index] as const),
  )
  const loose = modules.length
  return [...lessons]
    .sort(
      (a, b) =>
        (rank.get(a.moduleId ?? '') ?? loose) - (rank.get(b.moduleId ?? '') ?? loose) ||
        byOrder(a, b),
    )
    .map((item) => item.id)
}
