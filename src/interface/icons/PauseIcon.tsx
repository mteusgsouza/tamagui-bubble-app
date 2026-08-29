import { Path, Svg } from 'react-native-svg'

import { useIconProps } from '~/interface/icons/useIconProps'

import type { IconProps } from '~/interface/icons/types'

export const PauseIcon = (props: IconProps) => {
  const { width, height, fill, ...svgProps } = useIconProps(props)

  return (
    <Svg width={width} height={height} viewBox="0 0 256 256" fill="none" {...svgProps}>
      <Path d="M76,40 H112 V216 H76 Z" fill={fill} />
      <Path d="M144,40 H180 V216 H144 Z" fill={fill} />
    </Svg>
  )
}
