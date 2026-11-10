import { createRoute, useParams } from 'one'
import { memo, useEffect, useState } from 'react'
import { isWeb, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { APP_NAME } from '~/constants/app'
import { getPublicCertificate } from '~/data/client/api'
import { ApiError } from '~/helpers/apiFetch'
import { fullDate } from '~/features/feed/formatDate'
import { Button } from '~/interface/buttons/Button'

import type { PublicCertificateDTO } from '~/server/content/certificates'

const route = createRoute<'/certificado/[code]'>()

/**
 * Verificação pública de certificado.
 *
 * 🔴 **Fica fora de `app/(app)/`, de propósito.** Quem confere um certificado não tem
 * conta aqui, e rota dentro de `(app)` herda o guard e o `QueryClientProvider` dele. Por
 * isso a página busca com um `fetch` simples em vez de React Query. Só se prova em janela
 * anônima — logado, o defeito não aparece.
 */
export const CertificatePage = memo(() => {
  const { code } = useParams<{ code?: string }>()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'missing' }
    | { kind: 'error' }
    | { kind: 'ok'; certificate: PublicCertificateDTO }
  >({ kind: 'loading' })

  useEffect(() => {
    if (!code) return
    const controller = new AbortController()
    setState({ kind: 'loading' })
    getPublicCertificate(code, { signal: controller.signal })
      .then((data) => setState({ kind: 'ok', certificate: data.certificate }))
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({ kind: error instanceof ApiError && error.status === 404 ? 'missing' : 'error' })
      })
    return () => controller.abort()
  }, [code])

  return (
    <YStack
      bg="$background"
      flex={1}
      items="center"
      justify="center"
      px="$4"
      py="$8"
      {...(isWeb ? ({ minHeight: '100vh' } as any) : null)}
    >
      {isWeb ? <PrintStyle /> : null}

      {state.kind === 'loading' ? (
        <Spinner size="small" color="$accent9" />
      ) : state.kind === 'ok' ? (
        <Certificate certificate={state.certificate} />
      ) : (
        <YStack gap="$2" items="center" data-testid="certificate-missing">
          <SizableText size="$6" fontWeight="700">
            {state.kind === 'missing' ? 'Certificado não encontrado' : 'Não deu para verificar'}
          </SizableText>
          <SizableText size="$3" color="$color10" text="center">
            {state.kind === 'missing'
              ? 'Confira o código na URL. Ele tem 10 caracteres.'
              : 'Tente de novo em instantes.'}
          </SizableText>
        </YStack>
      )}
    </YStack>
  )
})

const Certificate = ({ certificate }: { certificate: PublicCertificateDTO }) => (
  <YStack width="100%" maxW={720} gap="$4" items="center">
    <YStack
      className="certificate-sheet"
      width="100%"
      gap="$3"
      items="center"
      p="$7"
      rounded="$6"
      borderWidth={2}
      borderColor="$accent8"
      data-testid="certificate"
    >
      <SizableText size="$2" color="$accent11" fontWeight="700" letterSpacing={2}>
        CERTIFICADO DE CONCLUSÃO
      </SizableText>
      <SizableText size="$2" color="$color10">
        {APP_NAME} certifica que
      </SizableText>
      <SizableText size="$9" fontWeight="700" text="center" data-testid="certificate-holder">
        {certificate.holderName}
      </SizableText>
      <SizableText size="$3" color="$color10" text="center">
        concluiu o curso
      </SizableText>
      <SizableText size="$7" fontWeight="700" text="center" data-testid="certificate-course">
        {certificate.courseTitle}
      </SizableText>
      <SizableText size="$3" color="$color11" text="center">
        {certificate.lessonsCompleted} de {certificate.lessonsTotal} aulas ·{' '}
        {fullDate(certificate.issuedAt).split(',')[0]}
      </SizableText>
      <SizableText size="$1" color="$color10" mt="$3">
        Código de verificação: {certificate.code}
      </SizableText>
    </YStack>

    {isWeb ? (
      <XStack className="no-print">
        <Button
          size="$4"
          variant="accent"
          onPress={() => window.print()}
          data-testid="print-certificate"
        >
          <SizableText size="$4" fontWeight="600" color="$accentColor">
            Imprimir / Salvar em PDF
          </SizableText>
        </Button>
      </XStack>
    ) : null}
  </YStack>
)

/** Só o certificado sai na impressão: botão escondido, fundo branco, borda preta. */
const PrintStyle = () => (
  <style>{`
    @media print {
      .no-print { display: none !important; }
      body { background: #fff !important; }
      .certificate-sheet { border-color: #000 !important; }
      .certificate-sheet * { color: #000 !important; }
    }
  `}</style>
)
