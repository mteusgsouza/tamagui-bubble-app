import { router } from 'one'

import { Pressable } from '~/interface/buttons/Pressable'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'

import type { Href } from 'one'
import type { ViewProps } from 'tamagui'

type Props = ViewProps & {
  /**
   * Para onde ir quando **não há histórico** — carregamento direto da URL, aba nova,
   * link colado. Sem isto o `back()` sairia do site ou não faria nada, e o botão parece
   * quebrado justo em quem chegou de fora. Omitir mantém o comportamento antigo.
   */
  fallbackHref?: Href
}

export const HeaderBackButton = ({ fallbackHref, ...props }: Props) => {
  return (
    <Pressable
      onPress={() => {
        if (fallbackHref && !router.canGoBack()) {
          router.navigate(fallbackHref)
          return
        }
        router.back()
      }}
      width={36}
      height={36}
      items="center"
      justify="center"
      role="button"
      aria-label="Voltar"
      {...props}
    >
      <CaretLeftIcon size={24} />
    </Pressable>
  )
}
