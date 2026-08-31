import { Path, Svg } from 'react-native-svg'

import { useIconProps } from '~/interface/icons/useIconProps'

import type { IconProps } from '~/interface/icons/types'

/**
 * Ícone da aba de cursos.
 *
 * ⚠️ Path do Phosphor **regular**, como todos os vizinhos desta pasta: um único `Path`
 * preenchido, sem `stroke`. A primeira versão deste ícone era desenhada à mão com
 * `strokeWidth`, e no header ela ficava fina e leve ao lado da casa e do perfil — era o
 * único ícone de outro conjunto na tela.
 */
export const PlayCircleIcon = (props: IconProps) => {
  const { width, height, fill, ...svgProps } = useIconProps(props)

  return (
    <Svg width={width} height={height} viewBox="0 0 256 256" fill="none" {...svgProps}>
      <Path
        d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm36.44-94.66-48-32A8,8,0,0,0,104,96v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM120,145.05V111l25.58,17Z"
        fill={fill}
      />
    </Svg>
  )
}
