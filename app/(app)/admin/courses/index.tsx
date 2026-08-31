import { Link, useRouter } from 'one'
import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminCourses } from '~/data/queries/admin'
import { AdminEmpty, AdminSection } from '~/features/admin/AdminShell'
import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { Button } from '~/interface/buttons/Button'
import { useQuery } from '~/zero/client'

export const AdminCoursesPage = memo(() => {
  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id || ''

  const [courses] = useQuery(
    adminCourses,
    { feedOwnerId: MASTER_USER_ID, userId },
    { enabled: Boolean(userId && MASTER_USER_ID) },
  )

  const rows = (courses ?? []) as any[]

  return (
    <AdminSection
      title="Cursos"
      detail={`${rows.length} no total, incluindo despublicados`}
      action={
        <Button
          size="$3"
          bg="$accentBackground"
          onPress={() => router.push(`/admin/courses/${newId()}?novo=1`)}
          data-testid="new-course"
        >
          <SizableText size="$3" fontWeight="600" color="$accentColor">
            Novo curso
          </SizableText>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <AdminEmpty>Nenhum curso ainda.</AdminEmpty>
      ) : (
        <YStack rounded="$6" borderWidth={1} borderColor="$borderColor" overflow="hidden">
          {rows.map((course, index) => (
            <Link
              key={course.id}
              href={`/admin/courses/${course.id}`}
              style={{ width: '100%' }}
            >
              <XStack
                gap="$3"
                p="$3"
                items="center"
                borderTopWidth={index === 0 ? 0 : 1}
                borderColor="$borderColor"
                hoverStyle={{ bg: '$color2' }}
              >
                <YStack flex={1} gap="$1">
                  <SizableText size="$4" fontWeight="600" color="$color12">
                    {course.title || '(sem título)'}
                  </SizableText>
                  <SizableText size="$1" color="$color10">
                    /{course.slug} · {course.modules?.length ?? 0} módulos ·{' '}
                    {course.lessons?.length ?? 0} aulas
                    {course.requiredPlan ? ` · plano ${course.requiredPlan.name}` : ''}
                  </SizableText>
                </YStack>

                <XStack
                  px="$2"
                  py="$0.5"
                  rounded="$12"
                  borderWidth={1}
                  borderColor={course.published ? '$green10' : '$color10'}
                >
                  <SizableText
                    size="$1"
                    fontWeight="600"
                    color={course.published ? '$green10' : '$color10'}
                  >
                    {course.published ? 'publicado' : 'rascunho'}
                  </SizableText>
                </XStack>
              </XStack>
            </Link>
          ))}
        </YStack>
      )}
    </AdminSection>
  )
})
