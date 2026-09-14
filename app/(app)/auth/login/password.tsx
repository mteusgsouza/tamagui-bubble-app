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
import { Pressable } from '~/interface/buttons/Pressable'
import { showError } from '~/interface/dialogs/actions'
import { Field } from '~/interface/forms/Field'
import { EyeIcon } from '~/interface/icons/phosphor/EyeIcon'
import { EyeSlashIcon } from '~/interface/icons/phosphor/EyeSlashIcon'
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
  const [confirm, setConfirm] = useState('')
  // com exigência de tamanho, esconder o que se digita só aumenta a chance de errar
  const [reveal, setReveal] = useState(false)

  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  // só compara depois que a pessoa começou a repetir — acusar diferença no primeiro
  // caractere digitado é ruído, não ajuda
  const confirmTouched = confirm.length > 0
  const matches = password === confirm

  const canSubmit =
    Boolean(password) &&
    !loading &&
    (!isSignup || (name.trim().length > 0 && longEnough && confirmTouched && matches))

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

  /**
   * O olho, dentro do campo. Um só, mandando nos dois: revelar um e esconder o outro
   * deixaria a conferência impossível justamente para quem precisa dela.
   *
   * ⚠️ `aria-label` não é enfeite — ícone sozinho não comunica a quem usa leitor de tela.
   */
  const revealToggle = (
    <Pressable
      onPress={() => setReveal((v) => !v)}
      role="button"
      hitSlop={10}
      aria-label={reveal ? 'Ocultar senha' : 'Mostrar senha'}
      data-testid="toggle-password-visibility"
    >
      {reveal ? (
        <EyeSlashIcon size={20} color="$color10" />
      ) : (
        <EyeIcon size={20} color="$color10" />
      )}
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
          label={isSignup ? 'Crie uma senha' : 'Senha'}
          // a exigência fica visível ANTES de errar, e não some quando a pessoa digita
          hint={isSignup ? `Ao menos ${MIN_PASSWORD_LENGTH} caracteres.` : undefined}
          adornment={revealToggle}
          data-testid="password-input"
          // 🔴 `type`, **nunca** `secureTextEntry`. O `Input` web do Tamagui descarta
          // `secureTextEntry` (a fonte dele lista a prop como "Native-only props (ignored
          // on web)"), e o sintoma é senha digitada em texto puro, sem erro nenhum —
          // typecheck passa liso. O nativo faz o caminho inverso e deriva o mascaramento
          // de `type` (`Input.native.tsx`, "Convert web type to native props"), então
          // `type` é a prop que funciona nas duas plataformas.
          type={reveal ? 'text' : 'password'}
          autoFocus={!isSignup}
          value={password}
          onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
          onSubmitEditing={handleContinue}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          footer={
            isSignup && password ? (
              <SizableText size="$2" color={longEnough ? '$accent11' : '$color10'}>
                {longEnough
                  ? 'Tamanho suficiente'
                  : `Faltam ${MIN_PASSWORD_LENGTH - password.length} ${
                      MIN_PASSWORD_LENGTH - password.length === 1
                        ? 'caractere'
                        : 'caracteres'
                    }`}
              </SizableText>
            ) : null
          }
        />

        {isSignup ? (
          <Field
            label="Repita a senha"
            data-testid="confirm-password-input"
            adornment={revealToggle}
            // mesmo motivo do campo acima: `type`, nunca `secureTextEntry`
            type={reveal ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm((e.target as HTMLInputElement).value)}
            onSubmitEditing={handleContinue}
            autoComplete="new-password"
            footer={
              confirmTouched ? (
                <SizableText size="$2" color={matches ? '$accent11' : '$red11'}>
                  {matches ? 'As senhas conferem' : 'As senhas não são iguais'}
                </SizableText>
              ) : null
            }
          />
        ) : null}
      </YStack>
    </StepPageLayout>
  )
}
