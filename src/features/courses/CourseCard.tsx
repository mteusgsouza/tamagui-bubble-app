import { Link } from 'one'
import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { MediaView } from '~/features/media/MediaView'
import { LockIcon } from '~/interface/icons/phosphor/LockIcon'

import { courseStats, courseSummaryLine } from './courseStats'
import { ProgressBar } from './ProgressBar'

import type { Course } from './types'
import type { ReactNode } from 'react'

/**
 * Card da lista de cursos. Mostra capa, título, a linha
 * "6 módulos · 24 aulas · 4 h 12 min" e, quando já começou, "8/24" com a barra.
 */
export const CourseCard = memo(({ course }: { course: Course }) => {
  const stats = courseStats(course)
  const started = stats.completedCount > 0
  const locked = Boolean(course.locked)

  return (
    <Link
      href={`/home/courses/${course.slug}`}
      data-testid="course-card"
      style={{ width: '100%' }}
    >
      <YStack
        gap="$3"
        p="$3"
        rounded="$6"
        borderWidth={1}
        borderColor="$borderColor"
        bg="$color1"
      >
        {course.coverMedia ? (
          <MediaView media={course.coverMedia} aspectRatio={16 / 9} rounded="$4" />
        ) : null}

        <YStack gap="$2">
          <SizableText size="$5" fontWeight="700" lineHeight={23}>
            {course.title}
          </SizableText>

          <SizableText size="$2" color="$color10">
            {courseSummaryLine(stats)}
          </SizableText>

          {/* 🔓 O cadeado não esconde o curso — ele diz que tem conteúdo ali dentro.
              Curso invisível era a mentira que a lista contava antes. */}
          {locked ? (
            <XStack gap="$1.5" items="center">
              <LockIcon size={14} color="$accent11" />
              <SizableText size="$2" fontWeight="600" color="$accent11">
                {course.lockReason === 'needs-plan'
                  ? 'Seu plano não inclui este curso'
                  : 'Assine para abrir as aulas'}
              </SizableText>
            </XStack>
          ) : null}

          {started ? (
            <YStack gap="$1.5" pt="$1">
              <ProgressBar ratio={stats.ratio} />
              <SizableText size="$1" color="$color10">
                {stats.completedCount}/{stats.lessonCount}
              </SizableText>
            </YStack>
          ) : null}

          <XStack gap="$2" pt="$1" flexWrap="wrap">
            {course.requiredPlan ? (
              <Tag>Incluído no plano {course.requiredPlan.name}</Tag>
            ) : null}
            {stats.hasFreePreview ? <Tag>Tem aula grátis</Tag> : null}
          </XStack>
        </YStack>
      </YStack>
    </Link>
  )
})

const Tag = ({ children }: { children: ReactNode }) => (
  <XStack px="$2" py="$0.5" rounded="$12" borderWidth={1} borderColor="$accent7">
    <SizableText size="$1" fontWeight="600" color="$accent11">
      {children}
    </SizableText>
  </XStack>
)
