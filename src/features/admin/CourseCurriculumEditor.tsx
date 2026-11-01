import { Link } from 'one'
import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { adminCourses } from '~/data/client/api'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { AdminEmpty, AdminSection } from '~/features/admin/AdminShell'
import { formatDuration } from '~/features/media/formatDuration'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { Input } from '~/interface/forms/Input'

import { moveLesson, moveModule } from './lessonOrder'

import type { Direction } from './lessonOrder'

type ModuleRow = { id: string; title: string; order: number }
type LessonRow = {
  id: string
  title: string
  moduleId?: string | null
  order: number
  published?: boolean
  freePreview?: boolean
  durationSec?: number | null
  media?: { id: string } | null
}

/**
 * Montagem do currículo: módulos e aulas.
 *
 * ⚠️ **`lesson.order` é global no curso, não por módulo.** É ele que define
 * "AULA 3 DE 24" e a "próxima aula" (`lessonPosition`/`lessonAfter` em
 * `~/features/courses/courseStats`). As setas ↑ ↓ trocam a aula com a vizinha **do mesmo
 * módulo** (`moveLesson`) e o servidor regrava a numeração inteira numa transação — sem
 * buraco e sem empate. Reordenar assim preserva o progresso de quem assistiu; apagar e
 * recriar não preservava (`lessonProgress` é `cascade`).
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
  const invalidate = useInvalidateAfterAdminWrite()
  const [newModule, setNewModule] = useState('')

  const orderedLessons = [...lessons].sort((a, b) => a.order - b.order)
  const orderedModules = [...modules].sort((a, b) => a.order - b.order)
  const positionOf = (lessonId: string) =>
    orderedLessons.findIndex((item) => item.id === lessonId) + 1

  /** Reordenar é "troque com o vizinho"; quem calcula é uma função pura e testada. */
  const moveLessonBy = (lessonId: string, direction: Direction) => async () => {
    const lessonIds = moveLesson(lessons, lessonId, direction)
    if (!lessonIds) return
    await adminCourses({ action: 'reorderLessons', courseId, lessonIds })
    invalidate()
  }

  const moveModuleBy = (moduleId: string, direction: Direction) => async () => {
    const moduleIds = moveModule(modules, moduleId, direction)
    if (!moduleIds) return
    await adminCourses({ action: 'reorderModules', courseId, moduleIds })
    invalidate()
  }

  const addModule = async () => {
    const title = newModule.trim()
    if (!title) return
    // a `order` sai do servidor (`max + 1`): mandar `modules.length` corria — dois
    // cliques rápidos geravam a mesma posição
    await adminCourses({ action: 'addModule', courseId, title })
    invalidate()
    setNewModule('')
  }

  const loose = orderedLessons.filter(
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

        {orderedModules.map((courseModule, index) => (
          <ModuleBlock
            key={courseModule.id}
            index={index}
            last={index === orderedModules.length - 1}
            courseModule={courseModule}
            courseId={courseId}
            lessons={orderedLessons.filter((l) => l.moduleId === courseModule.id)}
            positionOf={positionOf}
            onMoveModule={moveModuleBy}
            onMoveLesson={moveLessonBy}
          />
        ))}

        {loose.length > 0 ? (
          <YStack gap="$2">
            <SizableText size="$3" fontWeight="700">
              Aulas fora de módulo
            </SizableText>
            {loose.map((lesson, index) => (
              <LessonLine
                key={lesson.id}
                lesson={lesson}
                position={positionOf(lesson.id)}
                first={index === 0}
                last={index === loose.length - 1}
                onMove={(direction) => moveLessonBy(lesson.id, direction)}
              />
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
  last,
  courseModule,
  courseId,
  lessons,
  positionOf,
  onMoveModule,
  onMoveLesson,
}: {
  index: number
  last: boolean
  courseModule: ModuleRow
  courseId: string
  lessons: LessonRow[]
  positionOf: (lessonId: string) => number
  onMoveModule: (moduleId: string, direction: Direction) => () => Promise<void>
  onMoveLesson: (lessonId: string, direction: Direction) => () => Promise<void>
}) => {
  const invalidate = useInvalidateAfterAdminWrite()
  const [newLesson, setNewLesson] = useState('')
  // `null` = não está renomeando; string = o rascunho do nome
  const [renaming, setRenaming] = useState<string | null>(null)

  const rename = async () => {
    const title = (renaming ?? '').trim()
    if (!title) return
    if (title !== courseModule.title) {
      await adminCourses({ action: 'updateModule', moduleId: courseModule.id, title })
      invalidate()
    }
    setRenaming(null)
  }

  const addLesson = async () => {
    const title = newLesson.trim()
    if (!title) return
    // a numeração global do curso agora é calculada no servidor
    await adminCourses({ action: 'addLesson', courseId, moduleId: courseModule.id, title })
    invalidate()
    setNewLesson('')
  }

  const removeModule = async () => {
    // as aulas ficam: `lesson.moduleId` é `set null` no schema, então elas caem em
    // "fora de módulo" em vez de sumirem junto
    await adminCourses({ action: 'removeModule', moduleId: courseModule.id })
    invalidate()
  }

  return (
    <YStack gap="$2" p="$3" rounded="$6" borderWidth={1} borderColor="$borderColor">
      <XStack items="center" justify="space-between" gap="$2" flexWrap="wrap">
        {renaming !== null ? (
          <XStack gap="$2" items="center" flex={1} minW={220}>
            <Input
              flex={1}
              size="$3"
              height={40}
              value={renaming}
              onChangeText={setRenaming}
              data-testid="module-rename-input"
            />
            <Button
              size="$2"
              variant="accent"
              onPress={rename}
              disabled={!renaming.trim()}
              data-testid="module-rename-save"
            >
              Salvar
            </Button>
            <Button size="$2" variant="outlined" onPress={() => setRenaming(null)}>
              Cancelar
            </Button>
          </XStack>
        ) : (
          <SizableText size="$3" fontWeight="700" flex={1} minW={160}>
            Módulo {index + 1} · {courseModule.title}
          </SizableText>
        )}

        <XStack gap="$3" items="center">
          <Arrows
            first={index === 0}
            last={last}
            onMove={(direction) => onMoveModule(courseModule.id, direction)}
            testID="module"
          />
          <Pressable
            onPress={() => setRenaming(courseModule.title)}
            role="button"
            data-testid="module-rename"
          >
            <SizableText size="$1" fontWeight="600" color="$accent11">
              Renomear
            </SizableText>
          </Pressable>
          <Pressable onPress={removeModule} role="button">
            <SizableText size="$1" fontWeight="600" color="$red10">
              Remover módulo
            </SizableText>
          </Pressable>
        </XStack>
      </XStack>

      {lessons.map((lesson, lessonIndex) => (
        <LessonLine
          key={lesson.id}
          lesson={lesson}
          position={positionOf(lesson.id)}
          first={lessonIndex === 0}
          last={lessonIndex === lessons.length - 1}
          onMove={(direction) => onMoveLesson(lesson.id, direction)}
        />
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

const LessonLine = ({
  lesson,
  position,
  first,
  last,
  onMove,
}: {
  lesson: LessonRow
  /** posição na numeração global do curso (1-based) — a mesma do "AULA 3 DE 24" */
  position: number
  first: boolean
  last: boolean
  onMove: (direction: Direction) => () => Promise<void>
}) => {
  const invalidate = useInvalidateAfterAdminWrite()

  const toggle = (field: 'published' | 'freePreview') => async () => {
    await adminCourses({ action: 'updateLesson', lessonId: lesson.id, [field]: !lesson[field] })
    invalidate()
  }

  const remove = async () => {
    await adminCourses({ action: 'removeLesson', lessonId: lesson.id })
    invalidate()
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
        #{position}
      </SizableText>

      <Link href={`/admin/lessons/${lesson.id}`} style={{ flex: 1, minWidth: 160 }}>
        <SizableText
          size="$3"
          color="$color12"
          textDecorationLine="underline"
          data-testid="lesson-open"
        >
          {lesson.title}
        </SizableText>
      </Link>

      {!lesson.media ? (
        <SizableText size="$1" color="$orange10">
          sem vídeo
        </SizableText>
      ) : null}

      {formatDuration(lesson.durationSec) ? (
        <SizableText size="$1" color="$color10">
          {formatDuration(lesson.durationSec)}
        </SizableText>
      ) : null}

      <Arrows first={first} last={last} onMove={onMove} testID="lesson" />

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

/** ↑ ↓ — setas e não arrastar: funcionam no teclado e resolvem o caso real. */
const Arrows = ({
  first,
  last,
  onMove,
  testID,
}: {
  first: boolean
  last: boolean
  onMove: (direction: Direction) => () => Promise<void>
  testID: string
}) => (
  <XStack gap="$1">
    <Arrow
      label="↑"
      aria="Subir"
      disabled={first}
      onPress={onMove('up')}
      testID={`${testID}-up`}
    />
    <Arrow
      label="↓"
      aria="Descer"
      disabled={last}
      onPress={onMove('down')}
      testID={`${testID}-down`}
    />
  </XStack>
)

const Arrow = ({
  label,
  aria,
  disabled,
  onPress,
  testID,
}: {
  label: string
  aria: string
  disabled: boolean
  onPress: () => void
  testID: string
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    role="button"
    aria-label={aria}
    aria-disabled={disabled}
    data-testid={testID}
    width={28}
    height={28}
    items="center"
    justify="center"
    rounded="$3"
    borderWidth={1}
    borderColor="$borderColor"
    opacity={disabled ? 0.3 : 1}
    hoverStyle={disabled ? undefined : { bg: '$color2' }}
  >
    <SizableText size="$2" fontWeight="700" color="$color11">
      {label}
    </SizableText>
  </Pressable>
)

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
