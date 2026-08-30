import { memo, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { courses } from '~/data/queries/course'
import { useAuth } from '~/features/auth/client/authClient'
import { CourseCard } from '~/features/courses/CourseCard'
import { courseStats } from '~/features/courses/courseStats'
import { Pressable } from '~/interface/buttons/Pressable'
import { useQuery } from '~/zero/client'

import type { Course } from '~/features/courses/types'

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'doing', label: 'Em andamento' },
  { id: 'done', label: 'Concluídos' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

export const CoursesPage = memo(() => {
  const insets = useSafeAreaInsets()
  // useAuth, não useUser: o id vem do JWT na hora, sem consultar o banco
  const { user } = useAuth()
  const userId = user?.id || ''

  const [filter, setFilter] = useState<FilterId>('all')

  const [rows, status] = useQuery(
    courses,
    { feedOwnerId: MASTER_USER_ID, userId },
    { enabled: Boolean(userId && MASTER_USER_ID) },
  )

  const all = (rows ?? []) as readonly Course[]
  const isLoading = status?.type !== 'complete' && all.length === 0

  // o filtro é client-side de propósito: "concluído" depende do progresso do usuário,
  // que já veio junto na query — não vale uma consulta a mais
  const visible = all.filter((course) => {
    if (filter === 'all') return true
    const stats = courseStats(course)
    // curso sem aula não está nem em andamento nem concluído
    if (stats.lessonCount === 0) return false
    const done = stats.completedCount === stats.lessonCount
    return filter === 'done' ? done : stats.completedCount > 0 && !done
  })

  const content = (
    <YStack bg="$background" flex={1} width="100%" maxW={620} mx="auto" px="$4" gap="$4">
      <SizableText size="$7" fontWeight="700" pt="$3">
        Cursos
      </SizableText>

      <XStack gap="$2">
        {FILTERS.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => setFilter(option.id)}
            px="$3"
            py="$1.5"
            rounded="$12"
            borderWidth={1}
            borderColor={filter === option.id ? '$accent7' : '$borderColor'}
            bg={filter === option.id ? '$accent3' : 'transparent'}
            role="button"
          >
            <SizableText
              size="$2"
              fontWeight="600"
              color={filter === option.id ? '$accent11' : '$color10'}
            >
              {option.label}
            </SizableText>
          </Pressable>
        ))}
      </XStack>

      {!MASTER_USER_ID ? (
        <Empty
          title="Sem criador definido"
          detail="VITE_MASTER_USER_ID está vazio no .env.development."
        />
      ) : isLoading ? (
        <YStack flex={1} items="center" justify="center" py="$10">
          <Spinner size="small" color="$accent9" />
        </YStack>
      ) : visible.length === 0 ? (
        <Empty
          title={all.length === 0 ? 'Nenhum curso ainda' : 'Nada neste filtro'}
          detail={
            all.length === 0
              ? 'Quando o criador publicar um curso, ele aparece aqui.'
              : 'Troque o filtro para ver os outros cursos.'
          }
        />
      ) : (
        <YStack gap="$3" pb="$6">
          {visible.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </YStack>
      )}
    </YStack>
  )

  if (isWeb) {
    return (
      <YStack bg="$background" flex={1} {...({ minHeight: '100vh' } as any)}>
        {content}
      </YStack>
    )
  }

  return (
    <ScrollView flex={1} bg="$background" pt={insets.top + 16}>
      {content}
      <YStack height={insets.bottom + 40} />
    </ScrollView>
  )
})

const Empty = ({ title, detail }: { title: string; detail: string }) => (
  <YStack flex={1} gap="$2" items="center" justify="center" py="$10">
    <SizableText size="$6" fontWeight="700">
      {title}
    </SizableText>
    <SizableText size="$4" color="$color10" text="center">
      {detail}
    </SizableText>
  </YStack>
)
