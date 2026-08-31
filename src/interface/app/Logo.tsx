import { SizableText, XStack } from 'tamagui'

import { APP_NAME_LOWERCASE } from '~/constants/app'

import { LogoIcon } from './LogoIcon'

/**
 * Marca + wordmark.
 *
 * O wordmark **não some mais no mobile** (antes havia um `$max-md` escondendo-o): a logo
 * é a peça central do topo no layout novo, e um quadradinho sozinho não identifica nada.
 */
export const Logo = ({ height = 24 }: { height?: number }) => {
  return (
    <XStack items="center" gap={height / 2.5}>
      <LogoIcon size={height} />
      <SizableText
        select="none"
        fontFamily="$mono"
        fontSize={height * 0.72}
        lineHeight={height * 0.72}
        letterSpacing={-0.2}
      >
        {APP_NAME_LOWERCASE}
      </SizableText>
    </XStack>
  )
}
