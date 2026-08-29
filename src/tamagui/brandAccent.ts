import { themes as baseThemes } from '@tamagui/config/v5'

/**
 * A cor primária do Bubble, como token — nunca como hex dentro de componente.
 *
 * O `@tamagui/config/v5` já expõe `$accent1`–`$accent12`, `$accentBackground` e
 * `$accentColor`; o default do Takeout deixa tudo em escala de cinza. Aqui essa rampa é
 * sobrescrita uma vez, e daí para frente todo componente referencia `$accent*`.
 *
 * Convenção da rampa (a mesma do Radix, que é a que o Tamagui segue):
 *   1–2   fundo de página
 *   3–5   fundo de componente (normal, hover, press)
 *   6–8   borda (sutil, normal, forte)
 *   9     a cor da marca, sólida — é esta que vira botão
 *   10    o hover do 9
 *   11    texto de baixo contraste sobre fundo neutro
 *   12    texto de alto contraste
 *
 * Para trocar a marca, mexa só no 9 e regenere os vizinhos mantendo a mesma progressão.
 */
const accentDark = {
  accent1: '#1a1305',
  accent2: '#241a06',
  accent3: '#33240a',
  accent4: '#422e0c',
  accent5: '#52390f',
  accent6: '#664914',
  accent7: '#7d591a',
  accent8: '#9c7020',
  accent9: '#e5a33a',
  accent10: '#efb45c',
  accent11: '#f5cd94',
  accent12: '#fdf1dd',
}

const accentLight = {
  accent1: '#fffcf5',
  accent2: '#fff8ea',
  accent3: '#ffefd2',
  accent4: '#ffe6bb',
  accent5: '#f8dca6',
  accent6: '#eecd8e',
  accent7: '#dfba71',
  accent8: '#cba14b',
  accent9: '#e5a33a',
  accent10: '#d4942c',
  accent11: '#8a5a10',
  accent12: '#40290a',
}

// `accentBackground` é o preenchimento sólido e `accentColor` o texto que fica em cima
// dele. Nos dois temas o 9 é claro o bastante para pedir tinta escura.
const accentSurface = {
  accentBackground: '#e5a33a',
  accentColor: '#141414',
}

export const themes = {
  ...baseThemes,
  light: { ...baseThemes.light, ...accentLight, ...accentSurface },
  dark: { ...baseThemes.dark, ...accentDark, ...accentSurface },
} as typeof baseThemes
