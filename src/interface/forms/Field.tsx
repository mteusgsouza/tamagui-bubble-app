import { SizableText, XStack, YStack, type TamaguiElement } from 'tamagui'

import { Input } from './Input'

import type { InputProps } from './Input'
import type { ReactNode, Ref } from 'react'

/**
 * Rótulo de campo, com dica opcional embaixo.
 *
 * ℹ️ Morava em `src/features/admin/fields.tsx`. Saiu de lá quando o cadastro precisou do
 * mesmo — rótulo de formulário não é assunto de admin.
 */
export const FieldLabel = ({
  label,
  hint,
  action,
}: {
  label: string
  hint?: string
  /** canto direito do rótulo: "Mostrar", "Esqueci minha senha", etc. */
  action?: ReactNode
}) => (
  <YStack gap="$0.5">
    <XStack items="center" justify="space-between" gap="$2">
      <SizableText size="$2" fontWeight="600" color="$color11">
        {label}
      </SizableText>
      {action}
    </XStack>
    {hint ? (
      <SizableText size="$1" color="$color10">
        {hint}
      </SizableText>
    ) : null}
  </YStack>
)

/**
 * Campo de texto **com rótulo visível**.
 *
 * 🔴 Rótulo não é placeholder. Placeholder some quando a pessoa digita, e aí o formulário
 * fica com duas caixas sem nome — que foi exatamente o problema do cadastro: "Ao menos 8
 * caracteres" nem dizia que o campo era a senha.
 *
 * A dica (`hint`) fica **fora** do input e não some: requisito que só aparece depois de
 * errar é requisito escondido.
 */
/** Espaço reservado à direita do input quando há adorno, para o texto não passar por baixo. */
const ADORNMENT_WIDTH = 48

export const Field = ({
  label,
  hint,
  action,
  adornment,
  footer,
  ref,
  ...inputProps
}: InputProps & {
  label: string
  hint?: string
  action?: ReactNode
  /**
   * Controle **dentro** do campo, encostado à direita — o olho de mostrar senha é o caso.
   * Dentro e não ao lado do rótulo: é onde a convenção põe, e não rouba a linha do rótulo.
   */
  adornment?: ReactNode
  /** validação ou confirmação, abaixo do campo */
  footer?: ReactNode
  /**
   * ⚠️ Encaminhado de propósito. Sem isto, o `inputRef.current?.focus?.()` da tela de
   * e-mail vira no-op silencioso — o autofoco que já funcionava sumiria e ninguém
   * relacionaria a causa a um wrapper de rótulo.
   */
  ref?: Ref<TamaguiElement>
}) => (
  <YStack gap="$1.5">
    <FieldLabel label={label} hint={hint} action={action} />

    {adornment ? (
      <YStack position="relative">
        <Input ref={ref} pr={ADORNMENT_WIDTH} {...inputProps} />
        <XStack
          position="absolute"
          r={0}
          t={0}
          b={0}
          width={ADORNMENT_WIDTH}
          items="center"
          justify="center"
        >
          {adornment}
        </XStack>
      </YStack>
    ) : (
      <Input ref={ref} {...inputProps} />
    )}

    {footer}
  </YStack>
)
