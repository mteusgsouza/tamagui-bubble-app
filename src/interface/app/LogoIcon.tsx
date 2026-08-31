import { Circle, Rect, Svg } from 'react-native-svg'
import { useTheme } from 'tamagui'

/**
 * A marca do Bubble.
 *
 * Desenho vindo do mock (`docs/design/Main.dc.html`): quadrado arredondado no acento com
 * duas bolhas dentro.
 *
 * ⚠️ **As duas cores são token, nunca hex** (decisão 11 do STATE). O par
 * `$accentBackground` / `$accentColor` existe nos dois temas justamente para isto: o
 * quadrado é sempre o âmbar da marca, e a tinta em cima dele é sempre escura — não pode
 * seguir o tema, senão no claro as bolhas somem.
 *
 * `.get()` em vez do valor direto para sair como `var()` e sobreviver ao SSR, igual ao
 * `useIconProps`.
 */
export const LogoIcon = ({ size = 24 }: { size?: number }) => {
  const theme = useTheme()
  const brand = theme.accentBackground?.get()
  const ink = theme.accentColor?.get()

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="2.2" y="2.2" width="19.6" height="19.6" rx="6" fill={brand} />
      <Circle cx="9.6" cy="10" r="3.3" fill={ink} />
      <Circle cx="15.4" cy="15" r="2.1" fill={ink} />
    </Svg>
  )
}
