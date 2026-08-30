import { Link } from 'one'
import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { formatDuration } from '~/features/media/formatDuration'
import { PlayIcon } from '~/interface/icons/PlayIcon'

import { courseLessons, moduleSummaryLine } from './courseStats'
import { isLessonComplete, lessonProgress } from './types'

import type { Course, CourseLesson } from './types'

/**
 * O currículo: módulos em ordem, cada um com suas aulas, e no fim as aulas soltas
 * (`moduleId` nulo), que não aparecem pendurada em módulo nenhum.
 */
export const CourseCurriculum = memo(({ course }: { course: Course }) => {
  const all = courseLessons(course)
  const modules = course.modules ?? []

  // as aulas vêm da lista cheia, filtradas por módulo: `modules[].lessons` traria a
  // mesma coisa, mas assim uma aula nunca aparece duas vezes nem some
  const inModules = new Set<string>()
  for (const courseModule of modules) {
    for (const lesson of all) {
      if (lesson.moduleId === courseModule.id) inModules.add(lesson.id)
    }
  }
  const loose = all.filter((lesson) => !inModules.has(lesson.id))

  return (
    <YStack gap="$5">
      {modules.map((courseModule, index) => {
        const lessons = all.filter((lesson) => lesson.moduleId === courseModule.id)
        if (lessons.length === 0) return null

        return (
          <YStack key={courseModule.id} gap="$2">
            <SizableText size="$4" fontWeight="700">
              Módulo {index + 1} · {courseModule.title}
            </SizableText>
            <SizableText size="$2" color="$color10">
              {moduleSummaryLine(lessons)}
            </SizableText>

            <YStack pt="$1">
              {lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} courseSlug={course.slug} />
              ))}
            </YStack>
          </YStack>
        )
      })}

      {loose.length > 0 ? (
        <YStack gap="$2">
          {modules.length > 0 ? (
            <SizableText size="$4" fontWeight="700">
              Outras aulas
            </SizableText>
          ) : null}
          <YStack pt="$1">
            {loose.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} courseSlug={course.slug} />
            ))}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  )
})

export const LessonRow = ({
  lesson,
  courseSlug,
}: {
  lesson: CourseLesson
  courseSlug: string
}) => {
  const done = isLessonComplete(lesson)
  const progress = lessonProgress(lesson)
  const total = formatDuration(lesson.durationSec)

  // aula começada e não concluída mostra "4:12 / 18:30", como no mock
  const started = !done && progress && progress.positionSec > 0
  const timeLabel = started
    ? `${formatDuration(progress.positionSec)} / ${total ?? '—'}`
    : total

  return (
    <Link
      href={`/home/courses/${courseSlug}/${lesson.id}`}
      data-testid="lesson-row"
      style={{ width: '100%' }}
    >
      <XStack
        gap="$3"
        py="$2.5"
        items="center"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <CheckDot done={done} />

        <YStack flex={1} gap="$0.5">
          <SizableText size="$3" fontWeight={done ? '400' : '600'} color="$color12">
            {lesson.title}
          </SizableText>

          <XStack gap="$2" items="center">
            {timeLabel ? (
              <SizableText size="$1" color={started ? '$accent11' : '$color10'}>
                {timeLabel}
              </SizableText>
            ) : null}
            {lesson.freePreview ? (
              <SizableText size="$1" fontWeight="600" color="$accent11">
                grátis
              </SizableText>
            ) : null}
          </XStack>
        </YStack>

        <PlayIcon size={14} color="$color9" />
      </XStack>
    </Link>
  )
}

/** Bolinha de concluída. Preenchida = vista. */
const CheckDot = ({ done }: { done: boolean }) => (
  <YStack
    width={18}
    height={18}
    rounded={100}
    borderWidth={done ? 0 : 1.5}
    borderColor="$color7"
    bg={done ? '$accent9' : 'transparent'}
    items="center"
    justify="center"
  >
    {done ? (
      <SizableText size="$1" color="$accent1" fontWeight="700" lineHeight={12}>
        ✓
      </SizableText>
    ) : null}
  </YStack>
)
