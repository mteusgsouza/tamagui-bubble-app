import { styled, TextArea as TamaguiTextArea, type GetProps } from 'tamagui'

/** Mesma linguagem visual do `Input`, para texto de várias linhas (comentários). */
export const TextArea = styled(TamaguiTextArea, {
  size: '$4',
  borderWidth: 0.5,
  placeholderTextColor: '$color8',

  focusVisibleStyle: {
    outlineWidth: 3,
    outlineStyle: 'solid',
    outlineColor: '$background04',
    outlineOffset: 1,
    borderWidth: 0.5,
    borderColor: '$color5',
  },
})

export type TextAreaProps = GetProps<typeof TextArea>
