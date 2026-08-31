// Seletor de arquivo — web. A Fase 5 deixou isto explicitamente para cá.
//
// O `useMediaUpload` recebe um `Blob`; quem escolhe o arquivo é a tela. Na web um
// `<input type="file">` descartável resolve sem componente nem estado.

const ACCEPT_BY_KIND = {
  photo: 'image/jpeg,image/png,image/webp,image/avif,image/gif',
  video: 'video/mp4,video/quicktime,video/webm',
  audio: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav',
  any: 'image/*,video/*,audio/*',
} as const

export type PickKind = keyof typeof ACCEPT_BY_KIND

/**
 * Abre o seletor do sistema e resolve com os arquivos escolhidos (lista vazia se
 * cancelar).
 *
 * ⚠️ Cancelar não dispara evento em todo navegador. O `focus` da janela é o sinal que
 * sobra: se voltamos ao app e nenhum `change` veio, foi cancelamento.
 */
export function pickFiles(kind: PickKind = 'any', multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT_BY_KIND[kind]
    input.multiple = multiple
    input.style.display = 'none'

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      const files = input.files ? Array.from(input.files) : []
      input.remove()
      resolve(files)
    }

    input.onchange = finish

    // rede de segurança para o cancelamento
    window.addEventListener('focus', () => setTimeout(finish, 500), { once: true })

    document.body.appendChild(input)
    input.click()
  })
}

/** Conveniência para quando só um arquivo interessa. */
export async function pickFile(kind: PickKind = 'any'): Promise<File | null> {
  const [file] = await pickFiles(kind, false)
  return file ?? null
}
