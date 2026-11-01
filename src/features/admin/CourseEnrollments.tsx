import { useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { adminEnrollments } from '~/data/client/api'
import { useAdminEnrollments } from '~/data/client/hooks'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { ApiError } from '~/helpers/apiFetch'
import { Button } from '~/interface/buttons/Button'

import { AdminEmpty, AdminSection } from './AdminShell'
import { TextField } from './fields'

const SOURCE_LABEL: Record<string, string> = {
  subscription: 'Assinatura',
  purchase: 'Compra',
  grant: 'Concedida',
  free: 'Curso aberto',
}

const formatDate = (epoch: number | null) =>
  epoch ? new Date(epoch).toLocaleDateString('pt-BR') : '—'

/**
 * Inscritos de um curso: quem tem, por onde veio, desde quando — e conceder / revogar à mão.
 *
 * A concessão (`source: 'grant'`) sobrevive à perda da assinatura: só as matrículas de
 * `source = 'subscription'` caem junto com ela.
 */
export const CourseEnrollments = ({ courseId }: { courseId: string }) => {
  const { data, isPending } = useAdminEnrollments(courseId)
  const invalidate = useInvalidateAfterAdminWrite()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await adminEnrollments(body)
      invalidate()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não deu para salvar.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const grant = async () => {
    if (!email.trim() || busy) return
    if (await run({ action: 'grant', courseId, email })) setEmail('')
  }

  const rows = data?.enrollments ?? []

  return (
    <AdminSection
      title="Inscritos"
      detail={`${rows.filter((row) => !row.revokedAt).length} ativos`}
    >
      <YStack gap="$3" data-testid="course-enrollments">
        <XStack gap="$2" items="flex-end">
          <YStack flex={1}>
            <TextField
              label="Conceder acesso"
              hint="E-mail de uma conta que já abriu o app."
              value={email}
              onChange={setEmail}
              placeholder="pessoa@exemplo.com"
              testID="grant-email"
            />
          </YStack>
          <Button
            size="$3"
            variant="accent"
            onPress={grant}
            disabled={busy || !email.trim()}
            data-testid="grant-enrollment"
          >
            <SizableText size="$3" fontWeight="600" color="$accentColor">
              Conceder
            </SizableText>
          </Button>
        </XStack>

        {error ? (
          <SizableText size="$2" color="$red10">
            {error}
          </SizableText>
        ) : null}

        {isPending ? (
          <Spinner size="small" color="$accent9" />
        ) : rows.length === 0 ? (
          <AdminEmpty>Ninguém se inscreveu ainda.</AdminEmpty>
        ) : (
          <YStack gap="$2">
            {rows.map((row) => (
              <XStack
                key={row.id}
                gap="$3"
                items="center"
                opacity={row.revokedAt ? 0.55 : 1}
                data-testid={`enrollment-${row.id}`}
              >
                <YStack flex={1}>
                  <SizableText size="$3" fontWeight="600">
                    {row.userName || row.userEmail || row.userId}
                  </SizableText>
                  <SizableText size="$1" color="$color10">
                    {SOURCE_LABEL[row.source] ?? row.source} · desde{' '}
                    {formatDate(row.createdAt)}
                    {row.revokedAt ? ` · revogada em ${formatDate(row.revokedAt)}` : ''}
                  </SizableText>
                </YStack>
                {row.revokedAt ? null : (
                  <Button
                    size="$2"
                    variant="outlined"
                    disabled={busy}
                    onPress={() => run({ action: 'revoke', enrollmentId: row.id })}
                  >
                    Revogar
                  </Button>
                )}
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
    </AdminSection>
  )
}
