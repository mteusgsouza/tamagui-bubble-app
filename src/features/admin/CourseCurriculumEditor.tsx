import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { AdminEmpty, AdminSection } from '~/features/admin/AdminShell'
import { formatDuration } from '~/features/media/formatDuration'
import { newId } from '~/helpers/id'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { Input } from '~/interface/forms/Input'
import { zero } from '~/zero/client'

type ModuleRow = { id: string; title: string; order: number }
type LessonRow = {
  id: string
  title: string
  moduleId?: string | null
  order: number
  published?: boolean
  freePreview?: boolean
  durationSec?: number | null
}

/**
 * Montagem do currículo: módulos e aulas.
 *
 * ⚠️ **`lesson.order` é global no curso, não por módulo.** É ele que define
 * "AULA 3 DE 24" e a "próxima aula" (`lessonPosition`/`lessonAfter` em
 * `~/features/courses/courseStats`). Toda aula nova entra no fim da numeração global,
 * mesmo que o módulo dela venha antes — reordenar de verdade é trabalho futuro.
 */
export const CourseCurriculumEditor = ({
  courseId,
  modules,
  lessons,
}: {
  courseId: string
  modules: ModuleRow[]
  lessons: LessonRow[]
}) => {
  const [newModule, setNewModule] = useState('')

  const addModule = async () => {
    const title = newModule.trim()
    if (!title) return
    await zero.mutate.courseModule.insert({
      id: newId(),
      courseId,
      title,
      order: modules.length,
    })
    setNewModule('')
  }

  const loose = lessons.filter(
    (lesson) => !modules.some((courseModule) => courseModule.id === lesson.moduleId),
  )

  return (
    <AdminSection
      title="Currículo"
      detail={`${modules.length} módulos · ${lessons.length} aulas`}
    >
      <YStack gap="$4">
        {modules.length === 0 && lessons.length === 0 ? (
          <AdminEmpty>Comece criando um módulo.</AdminEmpty>
        ) : null}

        {modules.map((courseModule, index) => (
          <ModuleBlock
            key={courseModule.id}
            index={index}
            courseModule={courseModule}
            courseId={courseId}
            lessons={lessons.filter((l) => l.moduleId === courseModule.id)}
            totalLessons={lessons.length}
          />
        ))}

        {loose.length > 0 ? (
          <YStack gap="$2">
            <SizableText size="$3" fontWeight="700">
              Aulas fora de módulo
            </SizableText>
            {loose.map((lesson) => (
              <LessonLine key={lesson.id} lesson={lesson} />
            ))}
          </YStack>
        ) : null}

        <XStack gap="$2" items="center" pt="$2">
          <Input
            flex={1}
            value={newModule}
            onChangeText={setNewModule}
            placeholder="Nome do novo módulo"
            data-testid="new-module-title"
          />
          <Button
            size="$3"
            variant="outlined"
            onPress={addModule}
            disabled={!newModule.trim()}
            data-testid="add-module"
          >
            Criar módulo
          </Button>
        </XStack>
      </YStack>
    </AdminSection>
  )
}

const ModuleBlock = ({
  index,
  courseModule,
  courseId,
  lessons,
  totalLessons,
}: {
  index: number
  courseModule: ModuleRow
  courseId: string
  lessons: LessonRow[]
  totalLessons: number
}) => {
  const [newLesson, setNewLesson] = useState('')

  const addLesson = async () => {
    const title = newLesson.trim()
    if (!title) return
    await zero.mutate.lesson.insert({
      id: newId(),
      courseId,
      moduleId: courseModule.id,
      title,
      // entra no fim da numeração GLOBAL do curso — ver comentário do componente
      order: totalLessons,
      published: false,
      freePreview: false,
      createdAt: Date.now(),
    })
    setNewLesson('')
  }

  const removeModule = async () => {
    // as aulas ficam: `lesson.moduleId` é `set null` no schema, então elas caem em
    // "fora de módulo" em vez de sumirem junto
    await zero.mutate.courseModule.delete({ id: courseModule.id })
  }

  return (
    <YStack gap="$2" p="$3" rounded="$6" borderWidth={1} borderColor="$borderColor">
      <XStack items="center" justify="space-between" gap="$2">
        <SizableText size="$3" fontWeight="700">
          Módulo {index + 1} · {courseModule.title}
        </SizableText>
        <Pressable onPress={removeModule} role="button">
          <SizableText size="$1" fontWeight="600" color="$red10">
            Remover módulo
          </SizableText>
        </Pressable>
      </XStack>

      {lessons.map((lesson) => (
        <LessonLine key={lesson.id} lesson={lesson} />
      ))}

      <XStack gap="$2" items="center" pt="$1">
        <Input
          flex={1}
          size="$3"
          height={40}
          value={newLesson}
          onChangeText={setNewLesson}
          placeholder="Título da nova aula"
        />
        <Button
          size="$2"
          variant="outlined"
          onPress={addLesson}
          disabled={!newLesson.trim()}
        >
          Criar aula
        </Button>
      </XStack>
    </YStack>
  )
}

const LessonLine = ({ lesson }: { lesson: LessonRow }) => {
  const toggle = (field: 'published' | 'freePreview') => async () => {
    await zero.mutate.lesson.update({ id: lesson.id, [field]: !lesson[field] })
  }

  const remove = async () => {
    await zero.mutate.lesson.delete({ id: lesson.id })
  }

  return (
    <XStack
      gap="$2"
      py="$2"
      items="center"
      borderTopWidth={1}
      borderColor="$borderColor"
      flexWrap="wrap"
    >
      <SizableText size="$1" color="$color9" width={28}>
        #{lesson.order}
      </SizableText>

      <SizableText size="$3" flex={1} minW={160} color="$color12">
        {lesson.title}
      </SizableText>

      {formatDuration(lesson.durationSec) ? (
        <SizableText size="$1" color="$color10">
          {formatDuration(lesson.durationSec)}
        </SizableText>
      ) : null}

      <Toggle on={Boolean(lesson.published)} onPress={toggle('published')}>
        publicada
      </Toggle>
      <Toggle on={Boolean(lesson.freePreview)} onPress={toggle('freePreview')}>
        grátis
      </Toggle>

      <Pressable onPress={remove} role="button">
        <SizableText size="$1" fontWeight="600" color="$red10">
          remover
        </SizableText>
      </Pressable>
    </XStack>
  )
}

const Toggle = ({
  on,
  onPress,
  children,
}: {
  on: boolean
  onPress: () => void
  children: string
}) => (
  <Pressable
    onPress={onPress}
    px="$2"
    py="$0.5"
    rounded="$12"
    borderWidth={1}
    borderColor={on ? '$accent7' : '$borderColor'}
    bg={on ? '$accent3' : 'transparent'}
    role="button"
  >
    <SizableText size="$1" fontWeight="600" color={on ? '$accent11' : '$color10'}>
      {children}
    </SizableText>
  </Pressable>
)
