export const ROOT_MAIN_ROUTE_NAME = '(app)'

/**
 * Altura das barras do app na web.
 *
 * Elas são `position: fixed` (`src/features/app/AppNav.tsx`), então **saem do fluxo**:
 * quem desenha por cima ou por baixo precisa compensar a altura na mão. Por isso o
 * número mora aqui e não dentro do `AppNav` — o composer de comentários também precisa
 * dele para se encostar acima da barra de abas.
 */
export const TOP_BAR_HEIGHT = 56
export const BOTTOM_BAR_HEIGHT = 68
