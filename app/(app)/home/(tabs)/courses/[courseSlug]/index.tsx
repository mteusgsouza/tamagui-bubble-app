import { useParams, useRouter, createRoute } from 'one'
import { memo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { courseBySlug } from '~/data/queries/course'
import { useAuth } from '~/features/auth/client/authClient'
import { CourseCurriculum } from '~/features/courses/CourseCurriculum'
import {
  courseStats,
  courseSummaryLine,
  nextLesson,
} from '~/features/courses/courseStats'
import { ProgressBar } from '~/features/courses/ProgressBar'
import { MediaView } from '~/features/media/MediaView'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'
import { useQuery } from '~/zero/client'

import type { Course } from '~/features/courses/types'

const route = createRoute<'/(app)/home/(tabs)/courses/[courseSlug]'>()

export const CourseDetailPage = memo(() => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { courseSlug } = useParams<{ courseSlug?: string }>()

  const { user } = useAuth()
  const userId = user?.id || ''

  const [course, status] = useQuery(
    courseBySlug,
    { feedOwnerId: MASTER_USER_ID, slug: courseSlug || '', userId },
    { enabled: Boolean(courseSlug && userId && MASTER_USER_ID) },
  )

  const isLoading = status?.type !== 'complete' && !course
  const typed = course as Course | undefined

  const content = (
    <YStack bg="$background" flex={1} width="100%" maxW={620} mx="auto" px="$4">
      <XStack items="center" gap="$3" py="$3">
        <Pressable onPress={() => router.back()} role="button" aria-label="Voltar">
          <CaretLeftIcon size={24} />
        </Pressable>
        <SizableText size="$5" fontWeight="700">
          Curso
        </SizableText>
      </XStack>

      {isLoading ? (
        <YStack flex={1} items="center" justify="center" py="$10">
          <Spinner size="small" color="$accent9" />
        </YStack>
      ) : !typed ? (
        // curso despublicado e curso barrado pelo paywall somem igual: a linha não
        // sincroniza, então para o cliente os dois casos são o mesmo
        <YStack flex={1} gap="$2" items="center" justify="center" py="$10">
          <SizableText size="$6" fontWeight="700">
            Curso indisponível
          </SizableText>
          <SizableText size="$4" color="$color10" text="center">
            Ele pode ter sido removido, ou faz parte de um plano que você ainda não
            assina.
          </SizableText>
        </YStack>
      ) : (
        <CourseBody course={typed} />
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
    <ScrollView flex={1} bg="$background" pt={insets.top}>
      {content}
      <YStack height={insets.bottom + 40} />
    </ScrollView>
  )
})

const CourseBody = ({ course }: { course: Course }) => {
  const router = useRouter()
  const stats = courseStats(course)
  const next = nextLesson(course)
  const percent = Math.round(stats.ratio * 100)

  return (
    <YStack gap="$4" pb="$6" data-testid="course-detail">
      {course.coverMedia ? (
        <MediaView media={course.coverMedia} aspectRatio={16 / 9} />
      ) : null}

      <YStack gap="$2">
        <SizableText size="$8" fontWeight="700" lineHeight={32}>
          {course.title}
        </SizableText>
        <SizableText size="$2" color="$color10">
          {courseSummaryLine(stats)}
        </SizableText>
      </YStack>

      {stats.lessonCount > 0 ? (
        <YStack gap="$1.5">
          <ProgressBar ratio={stats.ratio} />
          <SizableText size="$1" color="$color10">
            {stats.completedCount}/{stats.lessonCount} · {percent}%
          </SizableText>
        </YStack>
      ) : null}

      {next ? (
        <Button
          size="$4"
          bg="$accentBackground"
          hoverStyle={{ bg: '$accent10' }}
          onPress={() => router.push(`/home/courses/${course.slug}/${next.id}`)}
          data-testid="continue-course"
        >
          {/* o texto vai num filho: o `Button` deste repo não expõe `color` */}
          <SizableText size="$4" fontWeight="600" color="$accentColor">
            {stats.completedCount > 0 ? `Continuar: ${next.title}` : 'Começar o curso'}
          </SizableText>
        </Button>
      ) : stats.lessonCount > 0 ? (
        <SizableText size="$3" color="$accent11" fontWeight="600">
          Curso concluído.
        </SizableText>
      ) : null}

      {course.description ? (
        <SizableText size="$4" color="$color11" lineHeight={24}>
          {course.description}
        </SizableText>
      ) : null}

      <CourseCurriculum course={course} />
    </YStack>
  )
}
