import { isWeb, useEmitter, useEmitterValue } from '@take-out/helpers'
import {
  ToastProvider as TamaguiToastProvider,
  Toast,
  ToastViewport,
  useToastController,
  useToastState,
} from '@tamagui/toast'
import { useState, type ReactNode } from 'react'
import { YStack } from 'tamagui'

import { Z_INDICES } from '../constants'
import { toastEmitter } from './emitter'

// Re-export from helpers for convenience
export { showToast } from './helpers'

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  return (
    <TamaguiToastProvider swipeDirection="horizontal">
      <ToastDisplay />

      <ToastViewport
        portalToRoot
        z={Z_INDICES.toast}
        flexDirection="column-reverse"
        top={0}
        left={0}
        right={0}
        mx="auto"
      />
      {children}
    </TamaguiToastProvider>
  )
}

const ToastDisplay = () => {
  const currentToast = useToastState()
  const nextDuration = currentToast?.duration || 3000
  const [duration, setDuration] = useState(nextDuration)
  if (duration !== nextDuration) {
    setDuration(nextDuration)
  }

  const controller = useToastController()

  const toast = useEmitterValue(toastEmitter)
  const toastType = toast.type === 'show' ? toast.toast.type : null

  useEmitter(toastEmitter, (val) => {
    if (val.type === 'hide') {
      controller.hide()
    } else {
      // `showToast` achata tudo num objeto só (`{ title, ...opções }`), então não existe
      // `toast.options` — ler essa chave entregava `undefined` ao controller e todo
      // `message` era descartado em silêncio. O título aparecia, o detalhe nunca.
      const { title, ...options } = val.toast
      controller.show(title ?? '', options)
    }
  })

  if (currentToast?.isHandledNatively) {
    return null
  }

  if (!currentToast) {
    return null
  }

  return (
    <Toast
      key={currentToast?.id}
      duration={duration}
      enterStyle={{ opacity: 0, scale: 1, y: 0 }}
      exitStyle={{ opacity: 0, scale: 1, y: 0 }}
      y={20}
      opacity={1}
      scale={1}
      transition="quick"
      maxW={340}
      overflow="hidden"
      viewportName={currentToast?.viewportName}
      bg="$color2"
      py="$2.5"
      px="$4"
      theme={
        toastType === 'error'
          ? 'red'
          : toastType === 'warn'
            ? 'yellow'
            : toastType === 'success'
              ? 'green'
              : null
      }
      shadowColor="$shadow2"
      shadowRadius={8}
      shadowOffset={{ height: 4, width: 0 }}
      // @ts-ignore web-only
      boxShadow="0 4px 8px var(--shadow2), 0 16px 40px var(--shadow4)"
      rounded="$8"
    >
      <YStack gap="$1">
        <Toast.Title numberOfLines={2} size="$3" fontWeight="600" color="$color12">
          {currentToast?.title ?? ''}
        </Toast.Title>
        {/* `$color11`, não `$color1`: o fundo do toast é `$color2`, então o detalhe
            estava sendo escrito com a própria cor do fundo — invisível */}
        {!!currentToast?.message && (
          <Toast.Description size="$2" color="$color11">
            {currentToast.message}
          </Toast.Description>
        )}
      </YStack>
    </Toast>
  )
}
