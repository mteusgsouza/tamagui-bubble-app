import { createRoute, useParams, useRouter } from 'one'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SizableText, Spinner, useEvent, XStack, YStack } from 'tamagui'

import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { showError } from '~/interface/dialogs/actions'
import { Input } from '~/interface/forms/Input'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'
import { PageLayout } from '~/interface/pages/PageLayout'

const route = createRoute<'/(app)/auth/signup/[method]'>()

/**
 * Coleta o e-mail e leva para a senha.
 *
 * O `intent` (`login` | `signup`) atravessa daqui até a tela de senha e decide qual
 * chamada fazer lá. Ele vem da tela anterior, **não é adivinhado a partir do e-mail**:
 * perguntar ao servidor se a conta existe entregaria a lista de e-mails cadastrados a
 * quem quisesse testar um por um.
 */
export const SignupPage = memo(() => {
  const { method, intent } = useParams<{
    method?: 'email'
    intent?: 'login' | 'signup'
  }>()
  const { top } = useSafeAreaInsets()
  const router = useRouter()
  const inputRef = useRef<any>(null)
  const [inputValue, setInputValue] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const isSignup = intent === 'signup'
  const isDisabled = !inputValue.trim()

  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus?.()
    }, 650)

    return () => clearTimeout(timer)
  }, [])

  const handleGoBack = useEvent(() => router.back())

  const handleContinue = useEvent(async () => {
    if (!method) {
      showError('Método de autenticação não informado.')
      return
    }

    setLoading(true)

    try {
      const email = encodeURIComponent(inputValue.trim())
      router.push(
        `/auth/login/password?method=${method}&value=${email}&intent=${isSignup ? 'signup' : 'login'}`
      )
    } finally {
      setLoading(false)
    }
  })

  if (method !== 'email') {
    return (
      <YStack flex={1} bg="$background" pt={top} px="$4">
        <XStack items="center" gap="$3">
          <Pressable onPress={handleGoBack}>
            <CaretLeftIcon size={24} />
          </Pressable>
        </XStack>
        <YStack flex={1} items="center" justify="center">
          <SizableText fontSize={16} opacity={0.6}>
            Método de autenticação inválido
          </SizableText>
        </YStack>
      </YStack>
    )
  }

  return (
    <PageLayout>
      <YStack flex={1} bg="$background" pt={top} px="$4" gap="$4">
        <XStack items="center" gap="$3">
          <Pressable onPress={handleGoBack}>
            <CaretLeftIcon size={24} />
          </Pressable>
          <SizableText size="$6" fontWeight="bold">
            {isSignup ? 'Criar conta' : 'Entrar com e-mail'}
          </SizableText>
        </XStack>

        <SizableText size="$4" color="$color10">
          {isSignup
            ? 'Escolha o e-mail que você vai usar para entrar.'
            : 'Digite o e-mail da sua conta.'}
        </SizableText>

        <YStack gap="$4" mt="$4">
          <Input
            data-testid="email-input"
            ref={inputRef}
            placeholder="seu@email.com"
            value={inputValue}
            onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
            autoCapitalize="none"
            onSubmitEditing={handleContinue}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
          />

          <Button
            data-testid="next-button"
            size="$5"
            pressStyle={{ scale: 0.97, opacity: 0.9 }}
            onPress={handleContinue}
            disabled={isDisabled || loading}
          >
            {loading ? <Spinner size="small" /> : 'Continuar'}
          </Button>
        </YStack>
      </YStack>
    </PageLayout>
  )
})
