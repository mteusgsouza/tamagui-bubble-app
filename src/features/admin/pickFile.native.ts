// Seletor de arquivo — nativo. **Não implementado.**
//
// Precisa de `expo-image-picker` (`~55.0.14`, versão da tabela em
// `node_modules/expo/bundledNativeModules.json`), que não está instalado. O admin é
// web-only por decisão do plano da Fase 8, então isto existe só para o bundle nativo
// compilar caso alguém importe o módulo por engano.

export type PickKind = 'photo' | 'video' | 'audio' | 'any'

const unsupported = () => {
  throw new Error(
    'Seleção de arquivo não existe no nativo: o admin é web-only. ' +
      'Para habilitar, instale expo-image-picker (~55.0.14).',
  )
}

export function pickFiles(_kind: PickKind = 'any', _multiple = false): Promise<File[]> {
  return unsupported()
}

export function pickFile(_kind: PickKind = 'any'): Promise<File | null> {
  return unsupported()
}
