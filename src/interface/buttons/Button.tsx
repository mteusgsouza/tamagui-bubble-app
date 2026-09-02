import { Button as TamaguiButton, styled, type GetProps } from 'tamagui'

export const Button = styled(TamaguiButton, {
  render: 'button',
  borderWidth: 0,
  cursor: 'pointer',

  focusVisibleStyle: {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor: '$color8',
  },

  variants: {
    variant: {
      default: {
        bg: '$color3',
        hoverStyle: { bg: '$color4' },
        pressStyle: { bg: '$color2', opacity: 0.8 },
      },
      outlined: {
        bg: 'transparent',
        borderWidth: 2,
        borderColor: '$color6',
        hoverStyle: { borderColor: '$color8' },
        pressStyle: { borderColor: '$color4', opacity: 0.8 },
      },
      transparent: {
        bg: 'transparent',
        hoverStyle: { bg: '$color2' },
        pressStyle: { bg: '$color1', opacity: 0.8 },
      },
      floating: {
        bg: '$color4',
        shadowColor: '$shadow2',
        shadowRadius: 5,
        shadowOffset: { height: 2, width: 0 },
        hoverStyle: { bg: '$color5' },
        pressStyle: { bg: '$color3', opacity: 0.9 },
      },
      /**
       * A ação principal da tela, na cor da marca.
       *
       * Existe porque a tela de login usava `theme="dark_blue"` — um tema do starter que
       * pintava de azul o botão mais importante de um app âmbar. Aqui a cor sai do par
       * `$accentBackground`/`$accentColor`, que já é definido nos dois temas.
       *
       * Use **um por tela**: se tudo é destaque, nada é.
       *
       * ⚠️ O `fontWeight` daqui **não chega ao rótulo** quando o filho é string: o
       * `Button.Text` do Tamagui aplica a própria classe de peso (derivada do `size`) e
       * ela ganha. O `color` chega, o peso não. Quem quer negrito põe o texto num
       * `<SizableText fontWeight="600">` filho — é por isso que as telas de admin fazem
       * assim, e não por descuido.
       */
      accent: {
        bg: '$accentBackground',
        color: '$accentColor',
        fontWeight: '600',
        hoverStyle: { bg: '$accent10' },
        pressStyle: { bg: '$accent8', opacity: 0.9 },
      },
      /**
       * A ação destrutiva — apagar, remover, cancelar de vez.
       *
       * Fica discreta em repouso (contorno vermelho, fundo transparente) e só ganha
       * peso quando o ponteiro chega nela. O vermelho está ali para avisar, não para
       * competir com o `accent`: quem decide o que a tela quer que aconteça é o
       * destaque, e destruir nunca é o caminho principal.
       *
       * Sem `fontWeight`: pelo motivo descrito no `accent`, ele não chegaria ao rótulo —
       * e aqui peso normal é o que se quer mesmo.
       */
      danger: {
        bg: 'transparent',
        color: '$red10',
        borderWidth: 1,
        borderColor: '$red7',
        hoverStyle: { bg: '$red3', borderColor: '$red8', color: '$red11' },
        pressStyle: { bg: '$red4', borderColor: '$red8', opacity: 0.9 },
        focusVisibleStyle: { outlineColor: '$red8' },
      },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
  },
})

export type ButtonProps = GetProps<typeof Button>
