// O que cada código de erro vira na tela, por área.
//
// Os códigos vêm de `src/server/api/respond.ts` e das rotas. Mensagem que não existe
// aqui cai no `error` do servidor, que já vem em português — o mapa serve para o texto
// ficar mais específico do que a rota consegue ser.

export const FEED_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  'needs-subscription': 'Assine para abrir este post.',
  'needs-plan': 'Seu plano não inclui este post.',
  'not-found': 'Post indisponível.',
  'feed-failed': 'Não deu para carregar o feed. Tente de novo.',
}

export const COMMENT_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  'needs-subscription': 'Assine para comentar.',
  'needs-plan': 'Seu plano não inclui este post.',
  'empty-body': 'Escreva algo antes de enviar.',
  'body-too-long': 'Comentário muito longo.',
  forbidden: 'Você só apaga os próprios comentários.',
}

export const COURSE_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  'not-found': 'Curso indisponível.',
  'courses-failed': 'Não deu para carregar os cursos.',
}

export const ADMIN_MESSAGES: Record<string, string> = {
  forbidden: 'Só o criador administra o conteúdo.',
  'slug-duplicado': 'Já existe outro item com esse endereço.',
  'invalid-kind': 'Tipo de post desconhecido.',
  'invalid-visibility': 'Visibilidade desconhecida.',
  'invalid-interval': 'Periodicidade desconhecida.',
  'invalid-price': 'Preço inválido.',
  'missing-fields': 'Faltam campos obrigatórios.',
  'not-found': 'Esse item não existe mais.',
}
