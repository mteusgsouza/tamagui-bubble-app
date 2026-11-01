// O que o seletor de arquivo entrega — nas duas plataformas.
//
// Mesmo papel que `MediaFrame.tsx` cumpre para os dois `MediaView`: o tipo mora fora
// dos módulos de plataforma, para `pickFile.ts` (web, `<input type="file">`) e
// `pickFile.native.ts` falarem a mesma língua.
//
// 🔴 **A dimensão nasce aqui.** Até agora a tela mandava só `blob` e `mime` para o
// `useMediaUpload`, e `media.width`/`media.height` ficavam `NULL` em toda foto que
// passou pelo admin — embora `/api/media/upload-url` e `/api/media/complete` sempre
// tenham aceitado os dois. Sem dimensão, `defaultAspectRatio` devolve 16/9 e **toda
// foto em pé é cortada pelo meio**. Medir na escolha do arquivo fecha o buraco na
// origem, antes de qualquer byte subir.

/** O que o seletor aceita. `any` = o primeiro arquivo decide o tipo do post. */
export type PickKind = 'photo' | 'video' | 'audio' | 'any'

export type PickedFile = {
  /** os bytes, que é o que o `useMediaUpload` consome */
  blob: Blob
  mime: string
  /**
   * Em pixels. **Opcional de propósito:** medir pode falhar (arquivo corrompido, codec
   * que o navegador não abre), e isso não é motivo para recusar o upload — sem a
   * dimensão o app volta a se comportar como antes, em vez de barrar o arquivo.
   */
  width?: number
  height?: number
  durationSec?: number
  /** nome original, só para mensagem de erro */
  name?: string
}
