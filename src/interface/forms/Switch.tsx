/**
 * O interruptor do app.
 *
 * Hoje é o `Switch` do Tamagui sem mudança nenhuma — o arquivo existe porque o lint
 * (`no-restricted-imports` no `.oxlintrc.json`) proíbe importar `Switch` direto de
 * `tamagui` fora de `src/interface`, e é aqui que um ajuste de estilo passaria a valer
 * para todos os interruptores de uma vez. O import direto em `NotificationSettings.tsx`
 * derrubou o `check:all` do CI.
 *
 * ⚠️ Envolver com `styled()` perde o `Switch.Thumb` estático; se for estilizar, estilize
 * o `Thumb` também e reexporte os dois.
 */
export { Switch } from 'tamagui'
export type { SwitchProps } from 'tamagui'
