import { router } from 'one'
import { useState } from 'react'
import { Circle, isWeb, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { APP_NAME } from '~/constants/app'
import { authClient } from '~/features/auth/client/authClient'
import { signInAsDemo } from '~/features/auth/client/signInAsDemo'
import { isDemoMode } from '~/helpers/isDemoMode'
import { Link } from '~/interface/app/Link'
import { LogoIcon } from '~/interface/app/LogoIcon'
import { Button } from '~/interface/buttons/Button'
import { AppleIcon } from '~/interface/icons/AppleIcon'
import { GoogleIcon } from '~/interface/icons/GoogleIcon'
import { H2 } from '~/interface/text/Headings'
import { showToast } from '~/interface/toast/helpers'

/**
 * Entrada de autenticação.
 *
 * **Entrar e criar conta são caminhos separados**, e isso não é preferência de layout.
 * A tela antiga tinha um botão só ("Continue with Email") que sempre terminava em
 * `signIn.email`: e-mail novo dava `INVALID_EMAIL_OR_PASSWORD` e não existia cadastro.
 * Juntar os dois num botão de novo traria de volta o problema que motivou a separação:
 * com signUp-primeiro, e-mail digitado errado vira **conta nova** em vez de "senha
 * incorreta".
 */
export const LoginPage = () => {
  const [demoLoading, setDemoLoading] = useState<boolean>(false)
  const [socialLoading, setSocialLoading] = useState<boolean>(false)

  /**
   * Login social.
   *
   * O Google só está registrado no servidor quando `GOOGLE_CLIENT_ID` e
   * `GOOGLE_CLIENT_SECRET` existem (ver `authServer.ts`). Sem eles a chamada volta com
   * erro e o botão avisa em vez de quebrar — é por isso que quem decide se o Google
   * funciona é o **servidor**, não uma flag duplicada no cliente.
   */
  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    if (provider === 'apple') {
      // exige conta de desenvolvedor Apple; a App Store passa a exigir isto quando
      // houver outro login social
      showToast('Login com Apple ainda não está disponível.', { type: 'info' })
      return
    }

    setSocialLoading(true)
    try {
      const { error } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/home/feed',
      })
      if (error) {
        showToast(
          'Login com Google ainda não está configurado neste ambiente.',
          { type: 'info' }
        )
      }
    } catch {
      showToast('Não foi possível falar com o Google. Tente de novo.', { type: 'error' })
    } finally {
      setSocialLoading(false)
    }
  }

  return (
    <YStack
      flex={1}
      justify="center"
      items="center"
      $platform-web={{ minHeight: '100vh' }}
    >
      <Circle
        size={80}
        my="$4"
        transition="medium"
        enterStyle={{ scale: 0.95, opacity: 0 }}
      >
        <LogoIcon size={42} />
      </Circle>

      <YStack
        gap="$6"
        width="100%"
        items="center"
        bg="$background"
        rounded="$8"
        p={isWeb ? '$6' : '$4'}
        maxW={isWeb ? 400 : '90%'}
      >
        <H2 text="center">Entrar no {APP_NAME}</H2>

        <YStack
          key="welcome-content"
          gap="$4"
          items="center"
          width="100%"
          transition="medium"
          enterStyle={{ opacity: 0, y: 10 }}
          exitStyle={{ opacity: 0, y: -10 }}
          position="relative"
          overflow="hidden"
        >
          <YStack width="100%" gap="$3">
            <Link
              href="/auth/signup/email?intent=login"
              $platform-web={{ display: 'contents' }}
              asChild
            >
              <Button
                size="$5"
                theme="dark_blue"
                variant="floating"
                data-testid="go-to-login"
                pressStyle={{ scale: 0.97, opacity: 0.9 }}
                transition="200ms"
                enterStyle={{ opacity: 0, scale: 0.95 }}
              >
                Entrar com e-mail
              </Button>
            </Link>

            <Link
              href="/auth/signup/email?intent=signup"
              $platform-web={{ display: 'contents' }}
              asChild
            >
              <Button
                size="$5"
                variant="outlined"
                data-testid="go-to-signup"
                pressStyle={{ scale: 0.97, opacity: 0.9 }}
                transition="200ms"
                enterStyle={{ opacity: 0, scale: 0.95 }}
              >
                Criar conta
              </Button>
            </Link>

            {/* modo DEMO — ligado em dev ou com VITE_DEMO_MODE=1 */}
            {isDemoMode && (
              <Button
                variant="outlined"
                size="$5"
                onPress={async () => {
                  setDemoLoading(true)
                  const { error } = await signInAsDemo()
                  setDemoLoading(false)
                  if (error) {
                    showToast('Login de demonstração falhou', { type: 'error' })
                    return
                  }
                  router.replace('/home/feed')
                }}
                disabled={demoLoading}
                width="100%"
                data-testid="login-as-demo"
                pressStyle={{ scale: 0.97 }}
                transition="200ms"
                enterStyle={{ opacity: 0, scale: 0.95 }}
              >
                {demoLoading ? <Spinner size="small" /> : 'Entrar como demonstração'}
              </Button>
            )}
          </YStack>

          <SizableText size="$1" color="$color10">
            ou continue com
          </SizableText>

          <XStack width="100%" gap="$3" justify="center" overflow="visible">
            <Button
              size="$5"
              onPress={() => handleSocialLogin('google')}
              disabled={socialLoading}
              pressStyle={{ scale: 0.97, bg: '$color2' }}
              hoverStyle={{ bg: '$color2' }}
              transition="200ms"
              enterStyle={{ opacity: 0, scale: 0.95 }}
              icon={<GoogleIcon size={18} />}
            />

            <Button
              size="$5"
              onPress={() => handleSocialLogin('apple')}
              pressStyle={{ scale: 0.97, bg: '$color2' }}
              hoverStyle={{ bg: '$color2' }}
              transition="200ms"
              enterStyle={{ opacity: 0, scale: 0.95 }}
              icon={<AppleIcon size={20} />}
            />
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  )
}
