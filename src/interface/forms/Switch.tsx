import {
  createSwitch,
  getTokenValue,
  styled,
  SwitchFrame,
  SwitchThumb,
  withStaticProperties,
} from 'tamagui'

import type { ComponentProps } from 'react'
import type { SizeTokens } from 'tamagui'

/**
 * O interruptor do app — o `Switch` do Tamagui, montado com o `createSwitch` dele.
 *
 * O padrão do Tamagui 2 saía quebrado na tela (bolinha vazando do trilho, deslocada, e
 * nenhuma cor de "ligado"), por três motivos que nenhum deles avisa:
 *
 * 1. 🔴 **O trilho é um `<button>` e o Tamagui não zera o estilo do navegador.** Fica a
 *    borda de 2px e o padding `1px 6px` que todo botão tem, e a área útil do trilho
 *    encolhe para 30×17 enquanto a bolinha continua com 23×23.
 * 2. **A bolinha tem a altura do trilho** (os dois saem de `size × 0.65`), então mesmo
 *    sem o item 1 ela encostaria nas bordas. Aqui o trilho tem um respiro (`inset`) e a
 *    bolinha é a altura menos esse respiro dos dois lados.
 * 3. **Ligado = `$backgroundActive`**, que no tema escuro é praticamente o mesmo cinza
 *    de desligado. O estado ligado vai para a cor da marca (`$accent9`, invariante 4).
 *
 * Uso igual ao do Tamagui: `<Switch checked onCheckedChange><Switch.Thumb /></Switch>`.
 * O `size` continua valendo (padrão `$true`), e trilho e bolinha crescem juntos.
 */

/** o `$true` do config v5, para quando o tamanho não é token (`"auto"`, `"inherit"`) */
const DEFAULT_SIZE = 44

/** altura do trilho a partir do token de tamanho: `$true` (44) → 27px */
const trackHeight = (size: SizeTokens | number) => {
  const value =
    typeof size === 'number'
      ? size
      : Number(getTokenValue(size as Parameters<typeof getTokenValue>[0], 'size'))
  return Math.round((Number.isFinite(value) && value > 0 ? value : DEFAULT_SIZE) * 0.62)
}

/** o respiro entre a borda do trilho e a bolinha */
const inset = (height: number) => Math.max(2, Math.round(height * 0.11))

const Track = styled(SwitchFrame, {
  name: 'Switch',
  cursor: 'pointer',

  variants: {
    unstyled: {
      false: {
        // o reset do item 1: sem isto, borda e padding vêm do navegador
        borderWidth: 0,
        borderRadius: 1000,
        backgroundColor: '$color6',
        hoverStyle: { backgroundColor: '$color7' },
        focusVisibleStyle: {
          outlineColor: '$accent8',
          outlineStyle: 'solid',
          outlineWidth: 2,
          outlineOffset: 2,
        },
      },
    },

    size: {
      '...size': (val) => {
        const height = trackHeight(val)
        return {
          height,
          minHeight: height,
          width: Math.round(height * 1.75),
          padding: inset(height),
        }
      },
    },
  } as const,
})

const Knob = styled(SwitchThumb, {
  name: 'SwitchThumb',

  variants: {
    unstyled: {
      false: {
        borderRadius: 1000,
        // branca nos dois temas, como o interruptor do sistema; a sombra separa a
        // bolinha do trilho claro no tema claro
        backgroundColor: '$white',
        shadowColor: '$shadowColor',
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      },
    },

    size: {
      '...size': (val) => {
        const height = trackHeight(val)
        const knob = height - inset(height) * 2
        return { height: knob, width: knob }
      },
    },
  } as const,
})

const BaseSwitch = createSwitch({ Frame: Track, Thumb: Knob })

/**
 * Ligado na cor da marca.
 *
 * Vai como `activeStyle` (prop) e não como estilo do `Track` porque o `createSwitch`
 * aplica `$backgroundActive` **como prop** quando está ligado e não recebeu
 * `activeStyle` — e prop ganha de estilo base. O `hoverStyle` vem junto para o hover do
 * trilho ligado não voltar para o cinza do desligado.
 */
const CHECKED = {
  backgroundColor: '$accent9',
  hoverStyle: { backgroundColor: '$accent10' },
} as const

type SwitchProps = ComponentProps<typeof BaseSwitch>

function SwitchRoot(props: SwitchProps) {
  return <BaseSwitch activeStyle={CHECKED} {...props} />
}

export const Switch = withStaticProperties(SwitchRoot, { Thumb: BaseSwitch.Thumb })
export type { SwitchProps }
