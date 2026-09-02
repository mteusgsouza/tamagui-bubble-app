import { createEmitter } from '@take-out/helpers'

import type { ToastData } from './types'

// `ToastData`, e não `ToastOptions`: quem emite é o `showToast`, que junta o título às
// opções num objeto só. Com `ToastOptions` o `title` só passava porque o tipo do Tamagui
// aceita chave arbitrária — o tipo mentia sobre o formato real.
export const toastEmitter = createEmitter<
  { type: 'show'; toast: ToastData } | { type: 'hide' }
>('toast', {
  type: 'hide',
})
