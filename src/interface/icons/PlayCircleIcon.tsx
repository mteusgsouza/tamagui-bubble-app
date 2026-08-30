import { Circle, Path, Svg } from 'react-native-svg'

import { useIconProps } from '~/interface/icons/useIconProps'

import type { IconProps } from '~/interface/icons/types'

/** Ícone da aba de cursos: o conteúdo é aula em vídeo. */
export const PlayCircleIcon = (props: IconProps) => {
  const { width, height, fill, ...svgProps } = useIconProps(props)

  return (
    <Svg width={width} height={height} viewBox="0 0 256 256" fill="none" {...svgProps}>
      <Circle cx="128" cy="128" r="88" stroke={fill} strokeWidth="16" fill="none" />
      <Path d="M110,88 L172,128 L110,168 Z" fill={fill} />
    </Svg>
  )
}
