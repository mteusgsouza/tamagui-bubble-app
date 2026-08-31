import { createRoute, useParams, useRouter } from 'one'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { SizableText, Spinner, useEvent, XStack, YStack } from 'tamagui'

import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { showError } from '~/interface/dialogs/actions'
import { Input } from '~/interface/forms/Input'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'
import { UserCircleIcon } from '~/interface/icons/phosphor/UserCircleIcon'
import { StepPageLayout } from '~/interface/pages/StepPageLayout'

const route = createRoute<'/(app)/auth/signup/[method]'>()

/**
 * Coleta o e-mail e leva para a senha.
 *
 * Usa o `StepPageLayout` do template — o mesmo da tela de senha. Antes esta tela montava
 * o próprio cabeçalho e nascia colada no topo, fora do ritmo das outras duas etapas.
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
      <YStack flex={1} bg="$background" px="$4" pt="$6" gap="$4">
        <XStack items="center" gap="$3">
          <Pressable onPress={handleGoBack}>
            <CaretLeftIcon size={24} />
          </Pressable>
        </XStack>
        <YStack flex={1} items="center" justify="center">
          <SizableText size="$4" color="$color10">
            Método de autenticação inválido
          </SizableText>
        </YStack>
      </YStack>
    )
  }

  return (
    <StepPageLayout
      title={isSignup ? 'Criar conta' : 'Entrar com e-mail'}
      Icon={UserCircleIcon}
      description={
        isSignup
          ? 'Escolha o e-mail que você vai usar para entrar.'
          : 'Digite o e-mail da sua conta.'
      }
      bottom={
        <Button
          data-testid="next-button"
          size="$5"
          variant="accent"
          pressStyle={{ scale: 0.98, opacity: 0.9 }}
          onPress={handleContinue}
          disabled={isDisabled || loading}
        >
          {loading ? <Spinner size="small" /> : 'Continuar'}
        </Button>
      }
    >
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
    </StepPageLayout>
  )
})
