import { router, useParams } from 'one'
import { useState } from 'react'
import { Keyboard } from 'react-native'
import { SizableText, XStack, YStack } from 'tamagui'

import { passwordLogin } from '~/features/auth/client/passwordLogin'
import {
  MIN_PASSWORD_LENGTH,
  passwordSignup,
} from '~/features/auth/client/passwordSignup'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { showError } from '~/interface/dialogs/actions'
import { Field } from '~/interface/forms/Field'
import { PasswordIcon } from '~/interface/icons/phosphor/PasswordIcon'
import { KeyboardStickyFooter } from '~/interface/keyboard/KeyboardStickyFooter'
import { StepPageLayout } from '~/interface/pages/StepPageLayout'

/**
 * Última etapa: senha (e nome, no cadastro).
 *
 * Serve às duas intenções. Com `intent=signup` pede **nome** também e chama
 * `passwordSignup`; senão chama `passwordLogin`. Quem decide é a tela anterior — ver o
 * comentário em `signup/[method].tsx` sobre não perguntar ao servidor se a conta existe.
 *
 * 🔴 **Rótulo em cima de cada campo, não placeholder.** A primeira versão desta tela tinha
 * duas caixas sem nome: o placeholder some ao digitar, e "Ao menos 8 caracteres" nem dizia
 * que aquele campo era a senha. Pior, o título dizia "Criar sua senha" enquanto o primeiro
 * campo pedia o nome.
 */
export const PasswordPage = () => {
  const params = useParams<{ value?: string; intent?: 'login' | 'signup' }>()
  const [loading, setLoading] = useState<boolean>(false)

  const isSignup = params.intent === 'signup'
  const displayValue = params.value || 'seu@email.com'

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  // com exigência de tamanho, esconder o que se digita só aumenta a chance de errar
  const [reveal, setReveal] = useState(false)

  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const canSubmit =
    Boolean(password) && !loading && (!isSignup || (name.trim().length > 0 && longEnough))

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

  const revealToggle = (
    <Pressable onPress={() => setReveal((v) => !v)} role="button" hitSlop={8}>
      <SizableText size="$2" fontWeight="600" color="$accent11">
        {reveal ? 'Ocultar' : 'Mostrar'}
      </SizableText>
    </Pressable>
  )

  return (
    <StepPageLayout
      // O título diz **o que há nesta tela**, não a meta. "Criar sua senha" mentia (o
      // primeiro campo é o nome) e "Criar conta" repetiria o título do passo anterior,
      // fazendo os dois passos parecerem o mesmo.
      title={isSignup ? 'Nome e senha' : 'Digite sua senha'}
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
      <YStack gap="$4">
        {isSignup ? (
          <Field
            label="Seu nome"
            hint="É como você vai aparecer nos comentários."
            data-testid="name-input"
            placeholder="Maria Silva"
            value={name}
            autoFocus
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            autoComplete="name"
            name="name"
          />
        ) : null}

        <Field
          label="Senha"
          // a exigência fica visível ANTES de errar, e não some quando a pessoa digita
          hint={isSignup ? `Ao menos ${MIN_PASSWORD_LENGTH} caracteres.` : undefined}
          action={password ? revealToggle : undefined}
          data-testid="password-input"
          secureTextEntry={!reveal}
          autoFocus={!isSignup}
          value={password}
          onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
          onSubmitEditing={handleContinue}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          footer={
            isSignup && password ? (
              <XStack items="center" gap="$1.5">
                <SizableText size="$2" color={longEnough ? '$accent11' : '$color10'}>
                  {longEnough
                    ? 'Tamanho suficiente'
                    : `Faltam ${MIN_PASSWORD_LENGTH - password.length} ${
                        MIN_PASSWORD_LENGTH - password.length === 1
                          ? 'caractere'
                          : 'caracteres'
                      }`}
                </SizableText>
              </XStack>
            ) : null
          }
        />
      </YStack>
    </StepPageLayout>
  )
}
