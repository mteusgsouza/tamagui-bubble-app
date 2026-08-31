import { Slot } from 'one'

import { PageMainContainer } from '~/interface/layout/PageContainer'

/**
 * O Perfil é aba, então a moldura (topo/barra/lateral) já vem do `(tabs)/_layout.tsx`.
 * Aqui só sobra a largura de leitura.
 *
 * ⚠️ **Sem `<YStack>` em volta.** Um wrapper sem `flex` encolhe para o conteúdo, e aí o
 * `ScrollView` da tela (que é `flex: 1`) resolve para **altura 0** e some — foi
 * exatamente o que aconteceu quando este layout tinha um. O `PageContainer` já é
 * `flex: 1`; ele precisa ser filho direto da moldura para herdar a altura dela.
 */
export const SettingLayout = () => {
  return (
    <PageMainContainer pt="$6" $xl={{ maxW: 760 }}>
      <Slot />
    </PageMainContainer>
  )
}
