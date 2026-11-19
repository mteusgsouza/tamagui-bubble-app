import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SizableText, XStack, YStack } from 'tamagui'

import { useKeys, useNotificationPrefs } from '~/data/client/hooks'
import * as api from '~/data/client/api'
import { Switch } from '~/interface/forms/Switch'

import type { NotificationPrefs } from '~/server/content/dto'

const ROWS: { key: keyof NotificationPrefs; title: string; hint: string }[] = [
  { key: 'notifyNewPost', title: 'Post novo', hint: 'Por e-mail, quando o criador publicar.' },
  {
    key: 'notifyNewLesson',
    title: 'Aula nova',
    hint: 'Por e-mail, nos cursos em que você está matriculado.',
  },
]

/** "Avisos", em Ajustes: os dois interruptores do opt-out de conteúdo novo. */
export const NotificationSettings = () => {
  const prefs = useNotificationPrefs().data
  const { keys } = useKeys()
  const client = useQueryClient()

  const save = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => api.saveNotificationPrefs(patch),
    // otimista: o interruptor responde na hora, o servidor confirma por baixo
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: keys.notifications() })
      const before = client.getQueryData<NotificationPrefs>(keys.notifications())
      client.setQueryData(keys.notifications(), { ...before, ...patch })
      return { before }
    },
    onError: (_error, _patch, context) => {
      client.setQueryData(keys.notifications(), context?.before)
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.notifications() }),
  })

  if (!prefs) return null

  return (
    <YStack gap="$2" px="$4" pb="$5" data-testid="notification-settings">
      <SizableText size="$5" fontWeight="700">
        Avisos
      </SizableText>
      {ROWS.map((row) => (
        <XStack key={row.key} items="center" justify="space-between" gap="$3">
          <YStack flex={1} gap="$0.5">
            <SizableText size="$4">{row.title}</SizableText>
            <SizableText size="$2" color="$color10">
              {row.hint}
            </SizableText>
          </YStack>
          <Switch
            size="$3"
            checked={prefs[row.key]}
            onCheckedChange={(checked) => save.mutate({ [row.key]: checked })}
            data-testid={`switch-${row.key}`}
          >
            <Switch.Thumb transition="quick" />
          </Switch>
        </XStack>
      ))}
    </YStack>
  )
}
