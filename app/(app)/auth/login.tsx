import { router } from 'one'
import { useState } from 'react'
import { Separator, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { APP_NAME } from '~/constants/app'
import { authClient } from '~/features/auth/client/authClient'
import { signInAsDemo } from '~/features/auth/client/signInAsDemo'
import { isDemoMode } from '~/helpers/isDemoMode'
import { Link } from '~/interface/app/Link'
import { Logo } from '~/interface/app/Logo'
import { Button } from '~/interface/buttons/Button'
import { AppleIcon } from '~/interface/icons/AppleIcon'
import { GoogleIcon } from '~/interface/icons/GoogleIcon'
import { H1, SubHeading } from '~/interface/text/Headings'
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
 *
 * A hierarquia visual: **uma** ação em destaque (entrar), as alternativas em contorno, e
 * o cadastro como linha de rodapé. Antes eram três botões do mesmo peso empilhados, o que
 * não dizia por onde começar.
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
        showToast('Login com Google ainda não está configurado neste ambiente.', {
          type: 'info',
        })
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
      items="center"
      justify="center"
      px="$4"
      py="$8"
      $platform-web={{ minHeight: '100dvh' }}
    >
      <YStack width="100%" maxW={380} gap="$7">
        <YStack items="center" gap="$4">
          <Logo height={34} />

          <YStack items="center" gap="$2">
            <H1 size="$8" text="center">
              Entrar no {APP_NAME}
            </H1>
            <SubHeading size="$4" text="center">
              Conteúdo, cursos e bastidores — num lugar só.
            </SubHeading>
          </YStack>
        </YStack>

        <YStack gap="$3">
          <Link
            href="/auth/signup/email?intent=login"
            $platform-web={{ display: 'contents' }}
            asChild
          >
            <Button
              size="$5"
              variant="accent"
              data-testid="go-to-login"
              pressStyle={{ scale: 0.98 }}
              transition="quick"
            >
              Entrar com e-mail
            </Button>
          </Link>

          <Divider>ou</Divider>

          <Button
            size="$5"
            variant="outlined"
            onPress={() => handleSocialLogin('google')}
            disabled={socialLoading}
            icon={<GoogleIcon size={18} />}
            pressStyle={{ scale: 0.98 }}
            transition="quick"
          >
            {socialLoading ? <Spinner size="small" /> : 'Continuar com Google'}
          </Button>

          <Button
            size="$5"
            variant="outlined"
            onPress={() => handleSocialLogin('apple')}
            icon={<AppleIcon size={20} />}
            pressStyle={{ scale: 0.98 }}
            transition="quick"
          >
            Continuar com Apple
          </Button>

          {/* modo DEMO — ligado em dev ou com VITE_DEMO_MODE=1 */}
          {isDemoMode && (
            <Button
              size="$4"
              variant="transparent"
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
              data-testid="login-as-demo"
            >
              {demoLoading ? <Spinner size="small" /> : 'Entrar como demonstração'}
            </Button>
          )}
        </YStack>

        <XStack items="center" justify="center" gap="$2" flexWrap="wrap">
          <SizableText size="$3" color="$color10">
            Ainda não tem conta?
          </SizableText>
          <Link href="/auth/signup/email?intent=signup" data-testid="go-to-signup">
            <SizableText
              size="$3"
              fontWeight="700"
              color="$accent11"
              hoverStyle={{ color: '$accent10' }}
              cursor="pointer"
            >
              Criar conta
            </SizableText>
          </Link>
        </XStack>
      </YStack>
    </YStack>
  )
}

/**
 * Linha com um rótulo no meio: `———— ou ————`.
 *
 * Dois detalhes que pareciam ajuste fino e não eram:
 * - **`flex={1}`**: sem ele o `Separator` fica com largura zero e sobra só o rótulo,
 *   solto no meio do nada.
 * - **`borderColor="$color5"`**: o padrão é `$borderColor`, que no tema escuro é quase a
 *   cor do fundo — a linha existia, com 168px, e mesmo assim não dava para ver.
 */
const Divider = ({ children }: { children: string }) => (
  <XStack items="center" gap="$3" py="$1">
    <Separator flex={1} borderColor="$color5" />
    <SizableText size="$1" color="$color10" textTransform="uppercase">
      {children}
    </SizableText>
    <Separator flex={1} borderColor="$color5" />
  </XStack>
)
