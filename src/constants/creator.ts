// Id do usuário mestre — dono do feed e dos cursos, valor de `post.feedOwnerId`,
// `course.feedOwnerId` e `subscription.creatorId`.
//
// Vive aqui, e não em `src/server/`, porque as queries do feed rodam no cliente:
// tudo em `src/server/` é server-only (`env-server.ts` chega a lançar erro se for
// importado no browser). O id vai embutido no bundle e isso é aceitável — é o mesmo
// id que aparece em qualquer post sincronizado.
export const MASTER_USER_ID = process.env.VITE_MASTER_USER_ID || ''

// Status de assinatura que dão acesso ao conteúdo pago.
// Nunca comparar `currentPeriodEnd` com `Date.now()` dentro de permission: comparação
// com "agora" quebra a convergência client/server que o Zero exige. Quem mantém o
// status correto é o webhook do gateway (Fase 9) e o admin.
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const
