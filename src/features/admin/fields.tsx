import { SizableText, XStack, YStack } from 'tamagui'

import { Pressable } from '~/interface/buttons/Pressable'
import { Input } from '~/interface/forms/Input'
import { TextArea } from '~/interface/forms/TextArea'

/** Campo de texto com rótulo. `multiline` troca para `TextArea`. */
export const TextField = ({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  hint,
  testID,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  hint?: string
  testID?: string
}) => (
  <YStack gap="$1.5">
    <FieldLabel label={label} hint={hint} />
    {multiline ? (
      <TextArea
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        minH={160}
        data-testid={testID}
      />
    ) : (
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        data-testid={testID}
      />
    )}
  </YStack>
)

/**
 * Escolha entre poucas opções, em pílulas.
 *
 * Não é `<select>` de propósito: o mesmo componente serve web e nativo, e com 2–5
 * opções a lista aberta lê melhor que um menu fechado.
 */
export function OptionRow<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint?: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <YStack gap="$1.5">
      <FieldLabel label={label} hint={hint} />
      <XStack gap="$2" flexWrap="wrap">
        {options.map((option) => {
          const active = option.id === value
          return (
            <Pressable
              key={option.id || '(vazio)'}
              onPress={() => onChange(option.id)}
              px="$3"
              py="$1.5"
              rounded="$12"
              borderWidth={1}
              borderColor={active ? '$accent7' : '$borderColor'}
              bg={active ? '$accent3' : 'transparent'}
              hoverStyle={{ bg: active ? '$accent3' : '$color2' }}
              role="button"
            >
              <SizableText
                size="$2"
                fontWeight="600"
                color={active ? '$accent11' : '$color10'}
              >
                {option.label}
              </SizableText>
            </Pressable>
          )
        })}
      </XStack>
    </YStack>
  )
}

const FieldLabel = ({ label, hint }: { label: string; hint?: string }) => (
  <YStack gap="$0.5">
    <SizableText size="$2" fontWeight="600" color="$color11">
      {label}
    </SizableText>
    {hint ? (
      <SizableText size="$1" color="$color10">
        {hint}
      </SizableText>
    ) : null}
  </YStack>
)
