// Seletor de arquivo — nativo. **Não implementado.**
//
// Precisa de `expo-image-picker` (`~55.0.14`, versão da tabela em
// `node_modules/expo/bundledNativeModules.json`), que não está instalado. O admin é
// web-only por decisão do plano da Fase 8, então isto existe só para o bundle nativo
// compilar caso alguém importe o módulo por engano.
//
// Quando for implementado: `launchImageLibraryAsync` devolve `uri`, `width`, `height`,
// `mimeType` e `duration`, e `fetch(uri).then((r) => r.blob())` fecha o `PickedFile` —
// ou seja, no nativo a dimensão **já vem pronta** do seletor, sem a medição que a web
// faz em `pickFile.ts`.

import type { PickedFile, PickKind } from './pickedFile'

export type { PickedFile, PickKind } from './pickedFile'

const unsupported = () => {
  throw new Error(
    'Seleção de arquivo não existe no nativo: o admin é web-only. ' +
      'Para habilitar, instale expo-image-picker (~55.0.14).',
  )
}

export function pickFiles(
  _kind: PickKind = 'any',
  _multiple = false,
): Promise<PickedFile[]> {
  return unsupported()
}

export function pickFile(_kind: PickKind = 'any'): Promise<PickedFile | null> {
  return unsupported()
}
