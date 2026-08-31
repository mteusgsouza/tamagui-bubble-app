import { YStack } from 'tamagui'

/** Barra fina de progresso. `ratio` de 0 a 1; valores fora da faixa são fixados. */
export const ProgressBar = ({
  ratio,
  height = 4,
}: {
  ratio: number
  height?: number
}) => {
  const clamped = Math.max(0, Math.min(ratio, 1))

  return (
    <YStack height={height} rounded={100} bg="$color4" overflow="hidden" width="100%">
      <YStack height={height} width={`${clamped * 100}%`} bg="$accent9" />
    </YStack>
  )
}
