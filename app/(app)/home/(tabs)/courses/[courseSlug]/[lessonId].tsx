import { Link, useParams, useRouter, createRoute } from 'one'
import { memo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { courseBySlug, lessonDetail } from '~/data/queries/course'
import { useAuth } from '~/features/auth/client/authClient'
import { lessonAfter, lessonPosition, resumeAt } from '~/features/courses/courseStats'
import { isLessonComplete } from '~/features/courses/types'
import { useLessonProgress } from '~/features/courses/useLessonProgress'
import { formatDuration } from '~/features/media/formatDuration'
import { MediaView } from '~/features/media/MediaView'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'
import { useQuery } from '~/zero/client'

import type { Course, CourseLesson } from '~/features/courses/types'

const route = createRoute<'/(app)/home/(tabs)/courses/[courseSlug]/[lessonId]'>()

export const LessonPage = memo(() => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { courseSlug, lessonId } = useParams<{
    courseSlug?: string
    lessonId?: string
  }>()

  const { user } = useAuth()
  const userId = user?.id || ''

  const [lesson, status] = useQuery(
    lessonDetail,
    { lessonId: lessonId || '', userId },
    { enabled: Boolean(lessonId && userId) },
  )

  // o curso vem junto para "AULA 3 DE 24" e "Próxima aula" — resolve no cache local,
  // porque a tela anterior já sincronizou essas linhas
  const [course] = useQuery(
    courseBySlug,
    { feedOwnerId: MASTER_USER_ID, slug: courseSlug || '', userId },
    { enabled: Boolean(courseSlug && userId && MASTER_USER_ID) },
  )

  const isLoading = status?.type !== 'complete' && !lesson

  const content = (
    <YStack bg="$background" flex={1} width="100%" maxW={720} mx="auto" px="$4">
      <XStack items="center" gap="$3" py="$3">
        <Pressable onPress={() => router.back()} role="button" aria-label="Voltar">
          <CaretLeftIcon size={24} />
        </Pressable>
        <SizableText size="$5" fontWeight="700">
          Aula
        </SizableText>
      </XStack>

      {isLoading ? (
        <YStack flex={1} items="center" justify="center" py="$10">
          <Spinner size="small" color="$accent9" />
        </YStack>
      ) : !lesson ? (
        <YStack flex={1} gap="$2" items="center" justify="center" py="$10">
          <SizableText size="$6" fontWeight="700">
            Aula indisponível
          </SizableText>
          <SizableText size="$4" color="$color10" text="center">
            Ela pode ter sido removida, ou faz parte de um plano que você ainda não
            assina.
          </SizableText>
        </YStack>
      ) : (
        <LessonBody
          lesson={lesson as unknown as CourseLesson}
          course={course as Course | undefined}
          courseSlug={courseSlug || ''}
          moduleTitle={(lesson as any).module?.title}
          courseTitle={(lesson as any).course?.title}
        />
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

const LessonBody = ({
  lesson,
  course,
  courseSlug,
  moduleTitle,
  courseTitle,
}: {
  lesson: CourseLesson
  course?: Course
  courseSlug: string
  moduleTitle?: string
  courseTitle?: string
}) => {
  const done = isLessonComplete(lesson)

  const { onProgress, onEnded, markComplete, canSave } = useLessonProgress({
    lessonId: lesson.id,
    alreadyComplete: done,
  })

  const position = course ? lessonPosition(course, lesson.id) : { index: 0, total: 0 }
  const next = course ? lessonAfter(course, lesson.id) : undefined
  const duration = formatDuration(lesson.durationSec)

  return (
    <YStack gap="$4" pb="$6" data-testid="lesson-detail">
      {lesson.media ? (
        <MediaView
          media={lesson.media}
          // retoma de onde parou; aula concluída volta do começo
          startAtSec={resumeAt(lesson)}
          onProgress={canSave ? onProgress : undefined}
          onEnded={canSave ? onEnded : undefined}
        />
      ) : (
        <YStack
          height={180}
          rounded="$6"
          bg="$color2"
          borderWidth={1}
          borderColor="$borderColor"
          items="center"
          justify="center"
        >
          <SizableText size="$2" color="$color9">
            Esta aula ainda não tem vídeo.
          </SizableText>
        </YStack>
      )}

      <YStack gap="$1.5">
        {position.total > 0 || moduleTitle ? (
          <SizableText size="$1" fontWeight="700" color="$accent11">
            {[
              moduleTitle?.toUpperCase(),
              position.total > 0 ? `AULA ${position.index} DE ${position.total}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </SizableText>
        ) : null}

        <SizableText size="$7" fontWeight="700" lineHeight={29}>
          {lesson.title}
        </SizableText>

        <XStack gap="$2" items="center">
          {duration ? (
            <SizableText size="$2" color="$color10">
              {duration}
            </SizableText>
          ) : null}
          {courseTitle ? (
            <SizableText size="$2" color="$color10">
              · {courseTitle}
            </SizableText>
          ) : null}
        </XStack>
      </YStack>

      {canSave ? (
        <Button
          size="$3"
          variant={done ? 'outlined' : 'default'}
          onPress={markComplete}
          disabled={done}
          opacity={done ? 0.6 : 1}
          self="flex-start"
          data-testid="mark-complete"
        >
          {done ? 'Aula concluída' : 'Marcar como concluída'}
        </Button>
      ) : null}

      {lesson.body ? (
        <SizableText size="$4" color="$color11" lineHeight={24}>
          {lesson.body}
        </SizableText>
      ) : null}

      {next ? (
        <YStack gap="$2" pt="$2">
          <SizableText size="$2" fontWeight="700" color="$color10">
            Próxima aula
          </SizableText>
          <Link
            href={`/home/courses/${courseSlug}/${next.id}`}
            data-testid="next-lesson"
            style={{ width: '100%' }}
          >
            <XStack
              gap="$3"
              p="$3"
              items="center"
              rounded="$6"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <YStack flex={1} gap="$0.5">
                <SizableText size="$3" fontWeight="600">
                  {next.title}
                </SizableText>
                {formatDuration(next.durationSec) ? (
                  <SizableText size="$1" color="$color10">
                    {formatDuration(next.durationSec)}
                  </SizableText>
                ) : null}
              </YStack>
            </XStack>
          </Link>
        </YStack>
      ) : null}
    </YStack>
  )
}
