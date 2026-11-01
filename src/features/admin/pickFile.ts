// Seletor de arquivo — web. A Fase 5 deixou isto explicitamente para cá.
//
// O `useMediaUpload` recebe um `Blob`; quem escolhe o arquivo é a tela. Na web um
// `<input type="file">` descartável resolve sem componente nem estado.
//
// Além de escolher, **mede**: largura, altura e duração saem daqui dentro de um
// `PickedFile`. Ver o porquê em `pickedFile.ts`.

import type { PickedFile, PickKind } from './pickedFile'

export type { PickedFile, PickKind } from './pickedFile'

const ACCEPT_BY_KIND: Record<PickKind, string> = {
  photo: 'image/jpeg,image/png,image/webp,image/avif,image/gif',
  video: 'video/mp4,video/quicktime,video/webm',
  audio: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav',
  any: 'image/*,video/*,audio/*',
}

/**
 * Teto para a medição.
 *
 * `loadedmetadata` de um arquivo que o navegador não sabe abrir **nunca dispara** — nem
 * `error`, em alguns casos. Sem teto, escolher um vídeo exótico travaria o seletor para
 * sempre, e o sintoma seria "cliquei em adicionar e nada aconteceu".
 */
const MEASURE_TIMEOUT_MS = 5_000

const withTimeout = <T>(promise: Promise<T>): Promise<T | null> =>
  Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS)),
  ])

/**
 * Dimensão da imagem.
 *
 * `createImageBitmap` é o caminho direto, e decodifica fora da thread principal. Onde
 * ele não existe ou recusa o formato, um `<img>` com object URL resolve — e é por isso
 * que vale ter os dois: o fallback cobre AVIF/GIF em navegador antigo sem que a tela
 * precise saber disso.
 */
async function measureImage(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      if (size.width > 0 && size.height > 0) return size
    } catch {
      // cai no `<img>` abaixo
    }
  }

  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image()
      image.onload = () =>
        resolve(
          image.naturalWidth > 0
            ? { width: image.naturalWidth, height: image.naturalHeight }
            : null,
        )
      image.onerror = () => resolve(null)
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Dimensão e duração do vídeo, pelos metadados — sem baixar o arquivo inteiro. */
async function measureVideo(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<{
      width: number
      height: number
      durationSec?: number
    } | null>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.onloadedmetadata = () => {
        resolve(
          video.videoWidth > 0
            ? {
                width: video.videoWidth,
                height: video.videoHeight,
                // `Infinity` acontece em stream e em alguns webm: é pior que ausente,
                // porque viraria um `durationSec` absurdo no banco
                durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
              }
            : null,
        )
      }
      video.onerror = () => resolve(null)
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Só a duração: áudio não tem dimensão, e o player dele é uma faixa de altura fixa. */
async function measureAudio(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<{ durationSec?: number } | null>((resolve) => {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      audio.onloadedmetadata = () =>
        resolve({
          durationSec: Number.isFinite(audio.duration) ? audio.duration : undefined,
        })
      audio.onerror = () => resolve(null)
      audio.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Um `File` do navegador, medido, no formato que o upload consome.
 *
 * Exportado para dar prova: medir depende de `createImageBitmap`, `<video>` e
 * `loadedmetadata`, que não existem no ambiente `node` do vitest. Dá para exercitar
 * esta função no navegador com um `File` gerado de um `<canvas>` — é a única forma
 * honesta de verificar a medição, e é ela que decide se a foto nasce com dimensão.
 */
export async function describePicked(file: File): Promise<PickedFile> {
  const mime = file.type || ''
  const base: PickedFile = { blob: file, mime, name: file.name }

  if (mime.startsWith('image/')) {
    const size = await withTimeout(measureImage(file))
    return size ? { ...base, ...size } : base
  }

  if (mime.startsWith('video/')) {
    const meta = await withTimeout(measureVideo(file))
    return meta ? { ...base, ...meta } : base
  }

  if (mime.startsWith('audio/')) {
    const meta = await withTimeout(measureAudio(file))
    return meta ? { ...base, ...meta } : base
  }

  // mime desconhecido segue em frente: `useMediaUpload` recusa com mensagem própria,
  // que é melhor que um erro genérico vindo daqui
  return base
}

/**
 * Abre o seletor do sistema e resolve com os arquivos escolhidos, já medidos (lista
 * vazia se cancelar).
 *
 * ⚠️ Cancelar não dispara evento em todo navegador. O `focus` da janela é o sinal que
 * sobra: se voltamos ao app e nenhum `change` veio, foi cancelamento.
 */
export function pickFiles(
  kind: PickKind = 'any',
  multiple = false,
): Promise<PickedFile[]> {
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
      // medir é assíncrono, então a promessa do seletor passa a esperar por isso. São
      // milissegundos num arquivo local, e é o que evita subir foto sem dimensão.
      void Promise.all(files.map(describePicked)).then(resolve)
    }

    input.onchange = finish

    // rede de segurança para o cancelamento
    window.addEventListener('focus', () => setTimeout(finish, 500), { once: true })

    document.body.appendChild(input)
    input.click()
  })
}

/** Conveniência para quando só um arquivo interessa. */
export async function pickFile(kind: PickKind = 'any'): Promise<PickedFile | null> {
  const [file] = await pickFiles(kind, false)
  return file ?? null
}
