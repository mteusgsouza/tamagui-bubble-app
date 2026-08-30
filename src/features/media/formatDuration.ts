/**
 * "12:04", "1:02:33" — duração de mídia em relógio.
 *
 * Vive num módulo próprio, sem import nenhum, para os cursos e os testes usarem sem
 * arrastar Tamagui junto (`MediaFrame.tsx` re-exporta para quem já importava de lá).
 */
export const formatDuration = (sec?: number | null) => {
  if (!sec || sec < 0) return null
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`
}
