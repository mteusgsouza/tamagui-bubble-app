import { router, useParams } from 'one'
import { useState } from 'react'
import { Keyboard } from 'react-native'
import { SizableText, YStack } from 'tamagui'

import { passwordLogin } from '~/features/auth/client/passwordLogin'
import {
  MIN_PASSWORD_LENGTH,
  passwordSignup,
} from '~/features/auth/client/passwordSignup'
import { Button } from '~/interface/buttons/Button'
import { showError } from '~/interface/dialogs/actions'
import { Input } from '~/interface/forms/Input'
import { PasswordIcon } from '~/interface/icons/phosphor/PasswordIcon'
import { KeyboardStickyFooter } from '~/interface/keyboard/KeyboardStickyFooter'
import { StepPageLayout } from '~/interface/pages/StepPageLayout'

/**
 * Última etapa: senha.
 *
 * Serve às duas intenções. Com `intent=signup` pede **nome** também e chama
 * `passwordSignup`; senão chama `passwordLogin`. Quem decide é a tela anterior — ver o
 * comentário em `signup/[method].tsx` sobre não perguntar ao servidor se a conta existe.
 */
export const PasswordPage = () => {
  const params = useParams<{ value?: string; intent?: 'login' | 'signup' }>()
  const [loading, setLoading] = useState<boolean>(false)

  const isSignup = params.intent === 'signup'
  const displayValue = params.value || 'seu@email.com'

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit =
    Boolean(password) &&
    !loading &&
    (!isSignup || (name.trim().length > 0 && password.length >= MIN_PASSWORD_LENGTH))

  const handleContinue = async () => {
    if (!params.value) {
      showError('E-mail não informado.')
      return
    }
    if (!canSubmit) return

    setLoading(true)

    try {
      const { error } = isSignup
        ? await passwordSignup(name.trim(), params.value, password)
        : await passwordLogin(params.value, password)

      if (error) {
        Keyboard.dismiss()
        showError(error)
        return
      }
      router.replace('/home')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <StepPageLayout
      title={isSignup ? 'Criar sua senha' : 'Digite sua senha'}
      Icon={PasswordIcon}
      description={isSignup ? 'Você vai entrar com' : 'Senha da conta'}
      descriptionSecondLine={displayValue}
      bottom={
        <KeyboardStickyFooter openedOffset={-10}>
          <Button
            data-testid="submit-password-button"
            size="$5"
            variant="accent"
            onPress={handleContinue}
            disabled={!canSubmit}
          >
            {loading
              ? isSignup
                ? 'Criando...'
                : 'Verificando...'
              : isSignup
                ? 'Criar conta'
                : 'Entrar'}
          </Button>
        </KeyboardStickyFooter>
      }
    >
      <YStack gap="$3">
        {isSignup ? (
          <Input
            data-testid="name-input"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            autoComplete="name"
            name="name"
          />
        ) : null}

        <Input
          data-testid="password-input"
          type="password"
          autoFocus={!isSignup}
          placeholder={isSignup ? `Ao menos ${MIN_PASSWORD_LENGTH} caracteres` : undefined}
          value={password}
          onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
          onSubmitEditing={handleContinue}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
        />

        {isSignup && password && password.length < MIN_PASSWORD_LENGTH ? (
          <SizableText size="$2" color="$color10">
            Faltam {MIN_PASSWORD_LENGTH - password.length} caractere(s).
          </SizableText>
        ) : null}
      </YStack>
    </StepPageLayout>
  )
}
