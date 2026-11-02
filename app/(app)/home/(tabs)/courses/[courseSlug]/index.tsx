import { Link, useParams, useRouter, createRoute } from 'one'
import { memo, useEffect, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { useCourse } from '~/data/client/hooks'
import { useEnroll } from '~/data/client/mutations'
import { COURSE_MESSAGES } from '~/data/client/messages'
import { ApiError } from '~/helpers/apiFetch'
import { apiMessage } from '~/helpers/apiMessage'
import { CHECKOUT_MESSAGES, goToGateway, startCheckout } from '~/features/billing/client/billingApi'
import { formatPrice } from '~/features/billing/formatPrice'
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

import type { Course } from '~/features/courses/types'

const route = createRoute<'/(app)/home/(tabs)/courses/[courseSlug]'>()

export const CourseDetailPage = memo(() => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { courseSlug, checkout } = useParams<{ courseSlug?: string; checkout?: string }>()

  // semeado pela lista quando ela já foi carregada, então abrir um curso vindo do
  // catálogo não mostra spinner
  const { data, isPending, refetch } = useCourse(courseSlug || '')

  const isLoading = isPending
  const typed = data?.course as Course | undefined

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
        <CourseBody course={typed} returning={checkout === 'success'} refetch={refetch} />
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

const CourseBody = ({
  course,
  returning,
  refetch,
}: {
  course: Course
  /** voltou do checkout (`?checkout=success`) */
  returning: boolean
  refetch: () => unknown
}) => {
  const router = useRouter()
  const stats = courseStats(course)
  const next = nextLesson(course)
  const percent = Math.round(stats.ratio * 100)
  const enroll = useEnroll(course.slug)

  // `pending` é o clique em comprar; `buyError` a frase de falha
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState<string | null>(null)

  // O webhook pode chegar depois do redirecionamento: o cliente volta pago e o curso ainda
  // aparece fechado por alguns segundos. Em vez de deixar a pessoa achando que não pagou,
  // a tela diz que está liberando e pergunta de novo até a matrícula aparecer.
  const waitingForWebhook = returning && Boolean(course.locked)
  useEffect(() => {
    if (!waitingForWebhook) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      void refetch()
      if (tries >= 15) clearInterval(timer)
    }, 2000)
    return () => clearInterval(timer)
  }, [waitingForWebhook, refetch])

  const buy = async () => {
    if (buying) return
    setBuying(true)
    setBuyError(null)
    try {
      goToGateway(await startCheckout({ kind: 'course', courseId: course.id }))
    } catch (err) {
      setBuyError(apiMessage(err, CHECKOUT_MESSAGES))
      setBuying(false)
    }
  }

  const start = async () => {
    try {
      await enroll.mutateAsync(course.id)
      if (next) router.push(`/home/courses/${course.slug}/${next.id}`)
    } catch {
      // a mensagem sai de `enroll.error`, logo abaixo do botão
    }
  }

  const enrollError = (() => {
    const error = enroll.error
    if (!error) return null
    const code = error instanceof ApiError ? error.code : ''
    return COURSE_MESSAGES[code] ?? COURSE_MESSAGES['enroll-failed']
  })()

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

      {/* 🔒 Curso fechado: o currículo continua visível logo abaixo — é ele que vende —
          e o botão leva para os planos em vez de para uma aula que daria 404. */}
      {course.locked && course.lockReason === 'needs-enrollment' ? (
        // tem direito (assinatura cobre, ou curso aberto) — falta o ato de se matricular
        <Button
          size="$4"
          variant="accent"
          onPress={start}
          disabled={enroll.isPending}
          data-testid="enroll-course"
        >
          <SizableText size="$4" fontWeight="600" color="$accentColor">
            {enroll.isPending ? 'Abrindo…' : 'Começar o curso'}
          </SizableText>
        </Button>
      ) : course.locked && course.lockReason === 'needs-purchase' ? (
        // a assinatura não cobre este curso: só a compra avulsa
        <YStack gap="$1.5">
          {waitingForWebhook ? (
            <SizableText size="$3" color="$accent11" fontWeight="600" data-testid="buy-waiting">
              Pagamento recebido. Liberando o seu acesso…
            </SizableText>
          ) : course.priceCents ? (
            <Button
              size="$4"
              variant="accent"
              onPress={buy}
              disabled={buying}
              data-testid="buy-course"
            >
              <SizableText size="$4" fontWeight="600" color="$accentColor">
                {buying
                  ? 'Abrindo o pagamento…'
                  : `Comprar este curso — ${formatPrice(course.priceCents)}`}
              </SizableText>
            </Button>
          ) : (
            <Button size="$4" variant="accent" disabled data-testid="buy-course">
              <SizableText size="$4" fontWeight="600" color="$accentColor">
                Comprar este curso
              </SizableText>
            </Button>
          )}
          <SizableText size="$2" color="$color10">
            {course.priceCents
              ? 'Compra única, acesso ao curso para sempre. Não está incluído na sua assinatura.'
              : 'Este curso é vendido à parte, mas ainda não está à venda.'}
          </SizableText>
          {buyError ? (
            <SizableText size="$3" color="$red10" data-testid="buy-error">
              {buyError}
            </SizableText>
          ) : null}
        </YStack>
      ) : course.locked ? (
        <Link href="/assinar" style={{ width: '100%' }} asChild>
          <Button size="$4" variant="accent" width="100%">
            <SizableText size="$4" fontWeight="600" color="$accentColor">
              {course.lockReason === 'needs-plan'
                ? 'Ver planos que incluem este curso'
                : 'Assinar para abrir as aulas'}
            </SizableText>
          </Button>
        </Link>
      ) : next ? (
        <Button
          size="$4"
          variant="accent"
          onPress={() => router.push(`/home/courses/${course.slug}/${next.id}`)}
          data-testid="continue-course"
        >
          {/* o rótulo vai num filho: o `fontWeight` do variant não chega ao
              `Button.Text`, que aplica a própria classe de peso e ganha */}
          <SizableText size="$4" fontWeight="600" color="$accentColor">
            {stats.completedCount > 0 ? `Continuar: ${next.title}` : 'Começar o curso'}
          </SizableText>
        </Button>
      ) : stats.lessonCount > 0 ? (
        <SizableText size="$3" color="$accent11" fontWeight="600">
          Curso concluído.
        </SizableText>
      ) : null}

      {enrollError ? (
        <SizableText size="$3" color="$red10" data-testid="enroll-error">
          {enrollError}
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
